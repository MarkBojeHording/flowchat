const express = require('express')
const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const AGENT_PROMPT_PATH = path.join(__dirname, '../prompts/agent.txt')
const MAX_AGENT_ITERATIONS = 15

const TOOLS = [
  {
    name: 'check_connected_apps',
    description: 'Check which apps the user has already connected',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_user_resources',
    description:
      "Get the user's actual resource names — Google Sheet names, Slack channels, Typeform form names",
    input_schema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'which app to get resources for: google_sheets, slack, typeform, airtable, notion',
        },
      },
      required: ['app'],
    },
  },
  {
    name: 'request_app_connection',
    description:
      'Initiate connecting an app. Returns the OAuth URL for the user to click.',
    input_schema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'the app to connect: google, slack, typeform, airtable, notion',
        },
      },
      required: ['app'],
    },
  },
  {
    name: 'build_workflow',
    description:
      'Build the automation once all information is gathered and all apps are connected',
    input_schema: {
      type: 'object',
      properties: {
        trigger_app: { type: 'string' },
        trigger_event: { type: 'string' },
        action_app: { type: 'string' },
        action_event: { type: 'string' },
        details: {
          type: 'string',
          description: 'any additional details as JSON string',
        },
      },
      required: ['trigger_app', 'trigger_event', 'action_app', 'action_event'],
    },
  },
  {
    name: 'test_workflow',
    description:
      'Run a test of the automation and return plain English results',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'activate_workflow',
    description: 'Turn the automation on so it runs for real',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'update_workflow',
    description: 'Make changes to an existing automation based on user request',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        changes: {
          type: 'string',
          description: 'plain English description of what to change',
        },
      },
      required: ['workflowId', 'changes'],
    },
  },
  {
    name: 'pause_workflow',
    description: 'Turn an automation off',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
      },
      required: ['workflowId'],
    },
  },
]

async function executeTool(name, input) {
  switch (name) {
    case 'check_connected_apps':
      return { connected: ['google', 'slack'] }

    case 'get_user_resources':
      return {
        google_sheets: ['Client Leads', 'New Signups'],
        slack_channels: ['#general', '#team'],
        typeform_forms: ['Contact Us 2026', 'New Client Intake'],
      }

    case 'request_app_connection':
      return {
        app: input.app,
        url: 'https://flowchat.now/connect?app=' + input.app,
        message: 'Click below to connect ' + input.app,
      }

    case 'build_workflow':
      return {
        success: true,
        workflowId: 'stub-' + Date.now(),
        summary: 'Automation built successfully',
      }

    case 'test_workflow':
      return {
        success: true,
        summary: 'Test completed. A test row was added to your sheet.',
      }

    case 'activate_workflow':
      return { success: true, summary: 'Automation is now live' }

    case 'update_workflow':
      return { success: true, summary: 'Automation updated successfully' }

    case 'pause_workflow':
      return { success: true, summary: 'Automation paused' }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

function extractTextFromContent(content) {
  if (!Array.isArray(content)) return ''

  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function sanitizeConnectionReply(reply, actionData) {
  let cleaned = reply

  if (actionData?.url) {
    cleaned = cleaned.split(actionData.url).join('')
  }

  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/g, '')
  return cleaned.replace(/\s{2,}/g, ' ').trim()
}

function buildChatResponse(replyText, { action, actionData, connectedApps, currentWorkflowId }) {
  console.log('Final reply text:', JSON.stringify(replyText))

  let reply = replyText

  if (action === 'request_connection') {
    reply = sanitizeConnectionReply(reply, actionData)
  }

  return {
    reply,
    action,
    actionData,
    updatedState: {
      connectedApps,
      currentWorkflowId,
      stage: determineStage(action, currentWorkflowId),
    },
  }
}

function determineStage(action, currentWorkflowId) {
  if (action === 'automation_live') return 'live'
  if (action === 'show_test_result') return 'testing'
  if (action === 'request_connection') return 'connecting_apps'
  if (currentWorkflowId) return 'built'
  return 'gathering_info'
}

async function loadUserContext(userId) {
  let connectedPlatforms = []
  let automationNames = []

  try {
    const { data: accounts, error: accountsError } = await supabase
      .from('platform_accounts')
      .select('platform')
      .eq('user_id', userId)

    if (accountsError) {
      console.error('platform_accounts query error:', accountsError.message)
    } else if (accounts?.length) {
      connectedPlatforms = accounts.map((row) => row.platform)
    }
  } catch (err) {
    console.error('platform_accounts query failed:', err.message)
  }

  try {
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('name')
      .eq('user_id', userId)

    if (workflowsError) {
      console.error('workflows query error:', workflowsError.message)
    } else if (workflows?.length) {
      automationNames = workflows.map((row) => row.name).filter(Boolean)
    }
  } catch (err) {
    console.error('workflows query failed:', err.message)
  }

  return { connectedPlatforms, automationNames }
}

function populateSystemPrompt(template, { connectedPlatforms, automationNames }) {
  return template
    .replace(
      '{{USER_CONTEXT}}',
      'New user. No previous automations. Name unknown.'
    )
    .replace(
      '{{USER_AUTOMATIONS}}',
      automationNames.length ? automationNames.join(', ') : 'None yet.'
    )
    .replace('{{CURRENT_STATE}}', 'None. User is starting fresh.')
    .replace(
      '{{CONNECTED_APPS}}',
      connectedPlatforms.length
        ? connectedPlatforms.join(', ')
        : 'None connected yet.'
    )
}

router.post('/message', async (req, res) => {
  const { userId, message, conversationHistory } = req.body

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message required' })
  }

  try {
    const systemTemplate = fs.readFileSync(AGENT_PROMPT_PATH, 'utf8')
    const { connectedPlatforms, automationNames } = await loadUserContext(userId)
    const systemPrompt = populateSystemPrompt(systemTemplate, {
      connectedPlatforms,
      automationNames,
    })

    const messages = [
      ...(Array.isArray(conversationHistory) ? conversationHistory : []),
      { role: 'user', content: message },
    ]

    let action = null
    let actionData = null
    let currentWorkflowId = null
    let connectedApps = [...connectedPlatforms]
    let response = null
    let iterations = 0
    let replyText = ''
    let toolsWereUsed = false

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      iterations = i + 1
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      })

      const iterationText = extractTextFromContent(response.content)
      console.log(
        `Agent iteration ${iterations}: stop_reason=${response.stop_reason}, textLen=${iterationText.length}`
      )

      if (iterationText) {
        replyText = iterationText
      }

      if (response.stop_reason === 'end_turn') {
        if (replyText || !toolsWereUsed) {
          break
        }

        messages.push({
          role: 'user',
          content:
            'Please give the user a brief, warm message explaining what happens next. Do not include any URLs.',
        })
        continue
      }

      if (response.stop_reason === 'tool_use') {
        toolsWereUsed = true
        messages.push({ role: 'assistant', content: response.content })

        const toolResults = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          const result = await executeTool(block.name, block.input)

          if (block.name === 'request_app_connection') {
            action = 'request_connection'
            actionData = result
          } else if (block.name === 'test_workflow') {
            action = 'show_test_result'
            actionData = result
          } else if (block.name === 'activate_workflow') {
            action = 'automation_live'
            actionData = result
          } else if (block.name === 'build_workflow') {
            currentWorkflowId = result.workflowId
          } else if (block.name === 'check_connected_apps') {
            connectedApps = result.connected
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }

        messages.push({ role: 'user', content: toolResults })
        continue
      }

      console.error('Unexpected stop_reason:', response.stop_reason)
      break
    }

    if (!response) {
      return res.status(500).json({ error: 'No response from agent' })
    }

    if (!replyText && action === 'request_connection' && actionData?.app) {
      replyText = `I need access to your ${actionData.app} to continue. Click the button below to connect it — takes about 30 seconds.`
    }

    if (!replyText && response.stop_reason !== 'end_turn' && iterations >= MAX_AGENT_ITERATIONS) {
      return res.status(500).json({ error: 'Agent exceeded maximum iterations' })
    }

    return res.json(
      buildChatResponse(replyText, {
        action,
        actionData,
        connectedApps,
        currentWorkflowId,
      })
    )
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
