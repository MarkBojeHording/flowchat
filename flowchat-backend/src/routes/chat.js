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

function appToPlatform(app) {
  const value = (app || '').toLowerCase()
  if (value.includes('google') || value === 'gmail' || value.includes('sheet')) {
    return 'google'
  }
  if (value.includes('slack')) return 'slack'
  if (value.includes('typeform')) return 'typeform'
  if (value.includes('airtable')) return 'airtable'
  if (value.includes('notion')) return 'notion'
  return value
}

async function getConnectedPlatforms(userId) {
  try {
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(userId)

    if (userError) {
      console.error('getUserById error:', userError.message)
      return []
    }

    const userEmail = userData?.user?.email
    if (!userEmail) return []

    const { data, error } = await supabase
      .from('platform_accounts')
      .select('platform')
      .eq('email', userEmail)

    if (error) {
      console.error('platform_accounts query error:', error.message)
      return []
    }

    return data?.map((row) => row.platform) || []
  } catch (err) {
    console.error('getConnectedPlatforms failed:', err.message)
    return []
  }
}

async function executeTool(name, input, userId) {
  switch (name) {
    case 'check_connected_apps': {
      const connected = await getConnectedPlatforms(userId)
      return { connected }
    }

    case 'get_user_resources':
      return {
        google_sheets: ['Client Leads', 'New Signups'],
        slack_channels: ['#general', '#team'],
        typeform_forms: ['Contact Us 2026', 'New Client Intake'],
      }

    case 'request_app_connection':
      return {
        app: input.app,
        url: `${process.env.BACKEND_URL}/api/auth/${input.app}`,
        message: `Click below to connect ${input.app}`,
      }

    case 'build_workflow': {
      const connected = await getConnectedPlatforms(userId)
      const requiredApps = [
        appToPlatform(input.trigger_app),
        appToPlatform(input.action_app),
      ]
      const missingApps = [...new Set(requiredApps)].filter(
        (platform) =>
          !connected.some(
            (entry) => entry.toLowerCase() === platform.toLowerCase()
          )
      )

      if (missingApps.length > 0) {
        return {
          success: false,
          summary:
            'Cannot build automation — required apps are not connected yet.',
        }
      }

      return {
        success: true,
        workflowId: 'stub-' + Date.now(),
        summary: 'Automation built successfully',
      }
    }

    case 'test_workflow':
      return {
        success: false,
        summary:
          'I cannot run a real test until all required apps are connected and the automation is fully built. Please connect your apps first.',
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

function generateAutoName(message, nameFromState) {
  if (nameFromState) return nameFromState

  const cleaned = message.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 50) return cleaned
  return `${cleaned.slice(0, 47)}...`
}

function buildChatResponse(
  replyText,
  { action, actionData, connectedApps, currentWorkflowId, automationId, autoName }
) {
  console.log('Final reply text:', JSON.stringify(replyText))

  let reply = replyText

  if (action === 'request_connection') {
    reply = sanitizeConnectionReply(reply, actionData)
  }

  const stage = determineStage(action, currentWorkflowId)

  return {
    reply,
    action,
    actionData,
    updatedState: {
      connectedApps,
      currentWorkflowId,
      stage,
      automationId: automationId || null,
      autoName: autoName || null,
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
    connectedPlatforms = await getConnectedPlatforms(userId)
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
  const { userId, automationId: requestAutomationId, message, conversationHistory: requestHistory } =
    req.body

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message required' })
  }

  try {
    let automationId = requestAutomationId || null
    let conversationHistory = Array.isArray(requestHistory) ? requestHistory : []
    let autoName = null
    let n8nWorkflowId = null

    if (automationId) {
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', automationId)
        .eq('user_id', userId)
        .single()

      if (workflowError) {
        console.error('Workflow load error:', workflowError.message)
      } else if (workflow) {
        if (workflow.conversation) {
          conversationHistory = workflow.conversation
        }
        autoName = workflow.auto_name
        n8nWorkflowId = workflow.n8n_workflow_id
      }
    }

    const systemTemplate = fs.readFileSync(AGENT_PROMPT_PATH, 'utf8')
    const { connectedPlatforms, automationNames } = await loadUserContext(userId)
    const systemPrompt = populateSystemPrompt(systemTemplate, {
      connectedPlatforms,
      automationNames,
    })

    const messages = [
      ...conversationHistory,
      { role: 'user', content: message },
    ]

    let action = null
    let actionData = null
    let currentWorkflowId = n8nWorkflowId
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

          const result = await executeTool(block.name, block.input, userId)

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

    const updatedConversation = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ]

    const updatedStage = determineStage(action, currentWorkflowId)
    let savedAutomationId = automationId
    let savedAutoName = autoName

    if (automationId) {
      const { error: updateError } = await supabase
        .from('workflows')
        .update({
          conversation: updatedConversation,
          last_message_at: new Date().toISOString(),
          stage: updatedStage || 'gathering_info',
        })
        .eq('id', automationId)
        .eq('user_id', userId)

      if (updateError) {
        console.error('Workflow update error:', updateError.message)
      }
    } else {
      savedAutoName = generateAutoName(message)

      const { data: newWorkflow, error: insertError } = await supabase
        .from('workflows')
        .insert({
          user_id: userId,
          auto_name: savedAutoName,
          conversation: updatedConversation,
          status: 'draft',
          stage: 'gathering_info',
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        console.error('Workflow insert error:', insertError.message)
      } else if (newWorkflow) {
        savedAutomationId = newWorkflow.id
        savedAutoName = newWorkflow.auto_name
      }
    }

    return res.json(
      buildChatResponse(replyText, {
        action,
        actionData,
        connectedApps,
        currentWorkflowId,
        automationId: savedAutomationId,
        autoName: savedAutoName,
      })
    )
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/automations', async (req, res) => {
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: 'userId required' })
  }

  try {
    const { data, error } = await supabase
      .from('workflows')
      .select(
        'id, auto_name, name, status, stage, last_message_at, n8n_workflow_id, trigger_app, action_apps'
      )
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })

    if (error) throw error

    res.json({ automations: data || [] })
  } catch (err) {
    console.error('Get automations error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/automations/:id', async (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: 'userId required' })
  }

  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    res.json({ automation: data })
  } catch (err) {
    console.error('Get automation error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
