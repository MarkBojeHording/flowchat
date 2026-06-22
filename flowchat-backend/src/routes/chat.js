const express = require('express')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')
const { getMetadataForAgent } = require('../services/integrations')

const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

async function logExecution(userId, workflowId, executionData) {
  try {
    const isTest = executionData.mode === 'webhook'

    await supabase.from('executions').insert({
      user_id: userId,
      workflow_id: workflowId,
      n8n_execution_id: executionData.id?.toString(),
      status: executionData.status || 'success',
      mode: executionData.mode || 'trigger',
    })

    if (!isTest) {
      await supabase.rpc('increment_runs_used', { user_id_input: userId })
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('test_runs_used')
        .eq('id', userId)
        .single()

      await supabase
        .from('profiles')
        .update({
          test_runs_used: (profile?.test_runs_used || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
    }
  } catch (err) {
    console.error('logExecution error:', err)
  }
}

const PLAN_DEFAULTS = {
  free: { name: 'Free', runsLimit: 50 },
  pro: { name: 'Pro', runsLimit: 2000 },
  business: { name: 'Business', runsLimit: 10000 },
}

function resolvePlanInfo(profile) {
  const planId = profile.plan_id || 'free'
  const joined = Array.isArray(profile.plans)
    ? profile.plans[0]
    : profile.plans
  const defaults = PLAN_DEFAULTS[planId] || PLAN_DEFAULTS.free

  return {
    id: planId,
    name: joined?.name || defaults.name,
    runsLimit: joined?.runs_limit ?? defaults.runsLimit,
  }
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const AGENT_PROMPT_PATH = path.join(__dirname, '../prompts/agent.txt')
const MAX_AGENT_ITERATIONS = 15
const MAX_HISTORY = 20
const MAX_STORED = 50

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
    description:
      'Make changes to an existing automation. Call this when the user wants to change the schedule, message, channel, or recipient of an existing live automation.',
    input_schema: {
      type: 'object',
      properties: {
        changes: {
          type: 'string',
          description: 'Plain English description of what changed',
        },
        cron_expression: {
          type: 'string',
          description:
            'New cron expression if schedule changed (e.g. "0 9 * * 1" for Monday 9am)',
        },
        channel: {
          type: 'string',
          description: 'New Slack channel if changed (e.g. #team)',
        },
        message: {
          type: 'string',
          description: 'New message text if changed',
        },
        to: {
          type: 'string',
          description: 'New email recipient if changed',
        },
        subject: {
          type: 'string',
          description: 'New email subject if changed',
        },
        body: {
          type: 'string',
          description: 'New email body if changed',
        },
      },
      required: ['changes'],
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
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('platform')
      .eq('user_id', userId)

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

async function executeTool(name, input, userId, automationId = null) {
  switch (name) {
    case 'check_connected_apps': {
      const connected = await getConnectedPlatforms(userId)
      return { connected }
    }

    case 'get_user_resources': {
      const { app } = input

      try {
        if (app === 'slack') {
          console.log('Fetching Slack channels for userId:', userId)
          const { data: slackAccount } = await supabase
            .from('platform_accounts')
            .select('access_token')
            .eq('platform', 'slack')
            .eq('user_id', userId)
            .single()

          console.log('Slack account found:', !!slackAccount)

          if (!slackAccount?.access_token) {
            return { error: 'Slack not connected' }
          }

          const response = await axios.get(
            'https://slack.com/api/conversations.list',
            {
              headers: {
                Authorization: `Bearer ${slackAccount.access_token}`,
              },
              params: {
                limit: 50,
                types: 'public_channel,private_channel',
              },
            }
          )

          console.log('Slack API response:', response.data.ok, response.data.error)

          if (response.data.ok) {
            const channels = response.data.channels
              .filter((c) => !c.is_archived)
              .map((c) => `#${c.name}`)
            return { slack_channels: channels }
          }

          if (!response.data.ok) {
            return {
              slack_channels: [],
              note: 'Could not fetch channels automatically. Ask the user to type their channel name manually.',
            }
          }
        }

        if (app === 'google_sheets') {
          const { data: googleAccount } = await supabase
            .from('platform_accounts')
            .select('access_token')
            .eq('platform', 'google')
            .eq('user_id', userId)
            .single()

          if (!googleAccount?.access_token) {
            return { error: 'Google not connected' }
          }

          const response = await axios.get(
            'https://www.googleapis.com/drive/v3/files',
            {
              headers: {
                Authorization: `Bearer ${googleAccount.access_token}`,
              },
              params: {
                q: "mimeType='application/vnd.google-apps.spreadsheet'",
                fields: 'files(id,name)',
                pageSize: 20,
              },
            }
          )

          const sheets = response.data.files?.map((f) => f.name) || []
          return { google_sheets: sheets }
        }

        return {
          google_sheets: ['Client Leads', 'New Signups'],
          slack_channels: ['#general', '#team'],
          typeform_forms: ['Contact Us', 'New Client Intake'],
        }
      } catch (err) {
        console.error('get_user_resources error:', err)
        return { error: err.message }
      }
    }

    case 'request_app_connection':
      return {
        app: input.app,
        url: `${process.env.BACKEND_URL}/api/auth/${input.app}`,
        message: `Click below to connect ${input.app}`,
      }

    case 'build_workflow': {
      console.log('build_workflow called with:', JSON.stringify(input, null, 2))
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('runs_used, topup_runs, plan_id')
          .eq('id', userId)
          .single()

        if (profile) {
          const planInfo = resolvePlanInfo(profile)
          const runsLimit = planInfo.runsLimit + (profile.topup_runs || 0)
          if (profile.runs_used >= runsLimit) {
            return {
              success: false,
              summary: `You've reached your monthly run limit on the ${planInfo.name} plan. Upgrade or top up to create more automations.`,
              limitReached: true,
            }
          }
        }

        const { buildWorkflow, ensureWorkflowCredentialUrls } = require('../services/workflowBuilder')
        const { createWorkflow, activateWorkflow, getWorkflow, deleteWorkflow } =
          require('../services/n8n')

        if (automationId) {
          const { data: existingWorkflow } = await supabase
            .from('workflows')
            .select('n8n_workflow_id, id')
            .eq('id', automationId)
            .single()

          if (existingWorkflow?.n8n_workflow_id) {
            const patched = await ensureWorkflowCredentialUrls(
              userId,
              existingWorkflow.n8n_workflow_id
            )

            if (patched) {
              return {
                success: true,
                workflowId: existingWorkflow.n8n_workflow_id,
                summary: 'Automation updated with correct credential URLs.',
              }
            }

            try {
              await getWorkflow(existingWorkflow.n8n_workflow_id)
              return {
                success: true,
                workflowId: existingWorkflow.n8n_workflow_id,
                summary: 'Automation is already built and active.',
              }
            } catch (err) {
              console.error('Could not fetch existing workflow, rebuilding:', err.message)
              try {
                await deleteWorkflow(existingWorkflow.n8n_workflow_id)
              } catch (deleteErr) {
                console.error('n8n delete before rebuild failed:', deleteErr.message)
              }
            }
          }
        }

        const { trigger_app, trigger_event, action_app, action_event, details } =
          input

        const detailsObj =
          typeof details === 'string'
            ? JSON.parse(details || '{}')
            : details || {}

        console.log('build_workflow details object:', JSON.stringify(detailsObj))

        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        const userEmail = userData?.user?.email || userId

        const { workflow: workflowData, testWebhookPath } = await buildWorkflow(
          userId,
          userEmail,
          {
            trigger_app,
            trigger_event,
            action_app,
            action_event,
            details: detailsObj,
          }
        )

        const created = await createWorkflow(workflowData)
        await activateWorkflow(created.id)

        const testWebhookUrl = `${process.env.N8N_BASE_URL.replace(/\/$/, '')}/webhook/${testWebhookPath}`

        if (automationId) {
          await supabase
            .from('workflows')
            .update({
              n8n_workflow_id: created.id,
              webhook_url: testWebhookUrl,
              name: `${userEmail} — ${trigger_app} → ${action_app}`,
              status: 'active',
              stage: 'live',
              trigger_app,
              action_apps: [action_app],
            })
            .eq('id', automationId)
            .eq('user_id', userId)
        }

        return {
          success: true,
          workflowId: created.id,
          summary: 'Automation built and activated successfully.',
        }
      } catch (err) {
        console.error('build_workflow error:', err)
        return {
          success: false,
          summary: `Failed to build: ${err.message}`,
        }
      }
    }

    case 'test_workflow': {
      try {
        const { data: workflow } = await supabase
          .from('workflows')
          .select('webhook_url, n8n_workflow_id, id')
          .eq('id', automationId)
          .single()

        if (!workflow?.webhook_url) {
          return {
            success: false,
            summary: 'No test webhook found. Please rebuild this automation.',
          }
        }

        await axios.get(workflow.webhook_url, { timeout: 10000 })

        await logExecution(userId, workflow.id, {
          mode: 'webhook',
          status: 'success',
          id: null,
        })

        return {
          success: true,
          summary:
            'The n8n workflow just executed successfully. Check your apps now — you should see the result of the automation running for real.',
        }
      } catch (err) {
        console.error('test_workflow error:', err.message)

        if (automationId) {
          await logExecution(userId, automationId, {
            mode: 'webhook',
            status: 'error',
            id: null,
          }).catch(() => {})
        }

        return {
          success: false,
          summary: `The test failed: ${err.message}. Check your n8n dashboard for details.`,
        }
      }
    }

    case 'activate_workflow': {
      if (automationId) {
        await supabase
          .from('workflows')
          .update({ status: 'active', stage: 'live' })
          .eq('id', automationId)
          .eq('user_id', userId)
      }
      return { success: true, summary: 'Automation is now live' }
    }

    case 'update_workflow': {
      try {
        const { changes } = input

        const { data: workflow } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', automationId)
          .single()

        if (!workflow?.n8n_workflow_id) {
          return { success: false, summary: 'No workflow found to update.' }
        }

        const { n8nClient } = require('../services/n8n')
        const { data: n8nWorkflow } = await n8nClient.get(
          `/api/v1/workflows/${workflow.n8n_workflow_id}`
        )

        if (!n8nWorkflow) {
          return { success: false, summary: 'Could not fetch workflow from n8n.' }
        }

        const updatedNodes = n8nWorkflow.nodes.map((node) => {
          if (
            node.type === 'n8n-nodes-base.scheduleTrigger' &&
            input.cron_expression
          ) {
            return {
              ...node,
              parameters: {
                ...node.parameters,
                rule: {
                  interval: [
                    {
                      field: 'cronExpression',
                      expression: input.cron_expression,
                    },
                  ],
                },
              },
            }
          }

          if (node.name === 'Send Slack Message') {
            let updatedJsonBody = node.parameters.jsonBody
            try {
              const body = JSON.parse(node.parameters.jsonBody || '{}')
              if (input.channel) body.channel = input.channel
              if (input.message) body.text = input.message
              updatedJsonBody = JSON.stringify(body)
            } catch (e) {
              // keep existing jsonBody if parse fails
            }
            return {
              ...node,
              parameters: { ...node.parameters, jsonBody: updatedJsonBody },
            }
          }

          if (
            node.name === 'Send Gmail' &&
            (input.to || input.subject || input.body)
          ) {
            const toEmail =
              input.to || workflow.details?.to || 'user@example.com'
            const subject =
              input.subject || workflow.details?.subject || 'Update'
            const body = input.body || workflow.details?.body || ''
            const rawEmail = Buffer.from(
              `To: ${toEmail}\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${body}`
            ).toString('base64url')
            return {
              ...node,
              parameters: {
                ...node.parameters,
                jsonBody: JSON.stringify({ raw: rawEmail }),
              },
            }
          }

          return node
        })

        await n8nClient.put(`/api/v1/workflows/${workflow.n8n_workflow_id}`, {
          name: n8nWorkflow.name,
          nodes: updatedNodes,
          connections: n8nWorkflow.connections,
          settings: {
            ...n8nWorkflow.settings,
            executionOrder: 'v1',
            errorWorkflow: 'QhkpkeGqlspl7xXY',
          },
        })

        await n8nClient.post(
          `/api/v1/workflows/${workflow.n8n_workflow_id}/deactivate`
        )

        await new Promise((resolve) => setTimeout(resolve, 500))

        await n8nClient.post(
          `/api/v1/workflows/${workflow.n8n_workflow_id}/activate`
        )

        console.log(
          '✅ Workflow reactivated after update:',
          workflow.n8n_workflow_id
        )

        await supabase
          .from('workflows')
          .update({
            last_message_at: new Date().toISOString(),
          })
          .eq('id', automationId)

        return {
          success: true,
          summary: `Done — ${changes}. The automation has been updated and will run with the new settings.`,
        }
      } catch (err) {
        console.error('update_workflow error:', err)
        return {
          success: false,
          summary: `Could not update the automation: ${err.message}`,
        }
      }
    }

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

function stripAuthUrls(text) {
  if (!text) return text

  return text
    .replace(/Click here to connect your \w+: https?:\/\/[^\s]+/gi, '')
    .replace(/https?:\/\/[^\s]+\/api\/auth\/(slack|google|typeform|airtable|notion)/g, '')
    .trim()
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

function populateSystemPrompt(
  template,
  { connectedPlatforms, automationNames, workflow, automationId, timezone }
) {
  const currentState = workflow
    ? `
Automation ID: ${automationId}
Status: ${workflow.status || 'draft'}
Stage: ${workflow.stage || 'gathering_info'}
N8N Workflow: ${workflow.n8n_workflow_id ? 'Already built - ID: ' + workflow.n8n_workflow_id : 'Not built yet'}
Name: ${workflow.auto_name || 'Untitled'}
`
    : 'None. User is starting fresh.'

  const integrationMetadata = getMetadataForAgent([
    'schedule',
    'typeform',
    'stripe',
    'calendly',
    'google_sheets',
    'gmail',
    'slack',
    'airtable',
    'notion',
  ])

  return template
    .replace('{{USER_CONTEXT}}', 'New user. No previous automations. Name unknown.')
    .replace('{{USER_AUTOMATIONS}}', automationNames.length ? automationNames.join(', ') : 'None yet.')
    .replace('{{CURRENT_STATE}}', currentState)
    .replace('{{CONNECTED_APPS}}', connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None connected yet')
    .replace('{{INTEGRATION_METADATA}}', integrationMetadata)
    .replace('{{TIMEZONE}}', timezone || 'UTC')
}

router.post('/message/stream', async (req, res) => {
  const { userId, automationId: requestAutomationId, message, conversationHistory: requestHistory, timezone } = req.body

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message required' })
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  // Helper to send SSE events
  function sendEvent(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    // Force flush to prevent buffering on Railway/proxies
    if (typeof res.flush === 'function') {
      res.flush()
    }
  }

  try {
    let automationId = requestAutomationId || null
    let conversationHistory = Array.isArray(requestHistory) ? requestHistory : []
    let autoName = null
    let n8nWorkflowId = null
    let workflow = null

    if (automationId) {
      const { data: loadedWorkflow, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', automationId)
        .eq('user_id', userId)
        .single()

      if (!workflowError && loadedWorkflow) {
        workflow = loadedWorkflow
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
      workflow,
      automationId,
      timezone: timezone || 'UTC',
    })

    // Truncate conversation history to last 20 messages
    // This prevents context window bloat and reduces latency/cost
    const truncatedHistory =
      conversationHistory.length > MAX_HISTORY
        ? conversationHistory.slice(-MAX_HISTORY)
        : conversationHistory

    const messages = [
      ...truncatedHistory,
      { role: 'user', content: message },
    ]

    let action = null
    let actionData = null
    let currentWorkflowId = n8nWorkflowId
    let connectedApps = [...connectedPlatforms]
    let replyText = ''
    let savedAutomationId = automationId
    let savedAutoName = autoName

    // Agent loop with streaming
    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      // Use streaming for the Claude API call
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      })

      let iterationText = ''
      let streamedThisIteration = false

      // Stream text chunks to client
      stream.on('text', (text) => {
        if (text) {
          iterationText += text
          replyText += text
          streamedThisIteration = true
          sendEvent('text', { text })
        }
      })

      // Wait for stream to complete
      const response = await stream.finalMessage()

      console.log(`Agent iteration ${i + 1}: stop_reason=${response.stop_reason}`)

      if (response.stop_reason === 'end_turn') {
        break
      }

      if (response.stop_reason === 'tool_use') {
        // Signal to frontend that tools are running
        sendEvent('tool_start', { message: 'Working on it...' })

        messages.push({ role: 'assistant', content: response.content })

        const toolResults = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          const result = await executeTool(
            block.name,
            block.input,
            userId,
            automationId
          )

          console.log(`Tool called: ${block.name}`)
          console.log(`Tool result: ${JSON.stringify(result)}`)

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

        sendEvent('tool_end', {})
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    // Clean up reply text
    replyText = stripAuthUrls(replyText)

    if (!replyText && action === 'request_connection' && actionData?.app) {
      const fallbackText = `I need access to your ${actionData.app} to continue. Click the button below to connect it.`
      sendEvent('text', { text: fallbackText })
      replyText = fallbackText
    }

    // Save conversation to Supabase
    const updatedConversation = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ].slice(-MAX_STORED)

    const updatedStage = determineStage(action, currentWorkflowId)

    if (automationId) {
      const statusUpdate =
        action === 'automation_live' ? { status: 'active' } : {}

      await supabase
        .from('workflows')
        .update({
          conversation: updatedConversation,
          last_message_at: new Date().toISOString(),
          stage: updatedStage || 'gathering_info',
          ...statusUpdate,
        })
        .eq('id', automationId)
        .eq('user_id', userId)
    } else {
      savedAutoName = generateAutoName(message)

      const { data: newWorkflow } = await supabase
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

      if (newWorkflow) {
        savedAutomationId = newWorkflow.id
        savedAutoName = newWorkflow.auto_name
      }
    }

    // Send final done event with all state
    sendEvent('done', {
      action,
      actionData,
      updatedState: {
        connectedApps,
        currentWorkflowId,
        stage: updatedStage,
        automationId: savedAutomationId,
        autoName: savedAutoName,
      }
    })

    res.end()

  } catch (err) {
    console.error('Stream error:', err)
    sendEvent('error', { message: err.message })
    res.end()
  }
})

router.post('/message', async (req, res) => {
  const { userId, automationId: requestAutomationId, message, conversationHistory: requestHistory, timezone } =
    req.body

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message required' })
  }

  try {
    let automationId = requestAutomationId || null
    let conversationHistory = Array.isArray(requestHistory) ? requestHistory : []
    let autoName = null
    let n8nWorkflowId = null
    let workflow = null

    if (automationId) {
      const { data: loadedWorkflow, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', automationId)
        .eq('user_id', userId)
        .single()

      if (workflowError) {
        console.error('Workflow load error:', workflowError.message)
      } else if (loadedWorkflow) {
        workflow = loadedWorkflow
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
      workflow,
      automationId,
      timezone: timezone || 'UTC',
    })

    // Truncate conversation history to last 20 messages
    // This prevents context window bloat and reduces latency/cost
    const truncatedHistory =
      conversationHistory.length > MAX_HISTORY
        ? conversationHistory.slice(-MAX_HISTORY)
        : conversationHistory

    const messages = [
      ...truncatedHistory,
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
        model: 'claude-sonnet-4-6',
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

          const result = await executeTool(
            block.name,
            block.input,
            userId,
            automationId
          )

          console.log(`Tool called: ${block.name}`)
          console.log(`Tool input: ${JSON.stringify(block.input)}`)
          console.log(`Tool result: ${JSON.stringify(result)}`)

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

    if (!replyText && response.stop_reason !== 'end_turn' && iterations >= MAX_AGENT_ITERATIONS) {
      return res.status(500).json({ error: 'Agent exceeded maximum iterations' })
    }

    replyText = stripAuthUrls(replyText)

    if (!replyText && action === 'request_connection' && actionData?.app) {
      replyText = `I need access to your ${actionData.app} to continue. Click the button below to connect it — takes about 30 seconds.`
    }

    const updatedConversation = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ].slice(-MAX_STORED)

    const updatedStage = determineStage(action, currentWorkflowId)
    let savedAutomationId = automationId
    let savedAutoName = autoName

    if (automationId) {
      const statusUpdate =
        action === 'automation_live' ? { status: 'active' } : {}

      const { error: updateError } = await supabase
        .from('workflows')
        .update({
          conversation: updatedConversation,
          last_message_at: new Date().toISOString(),
          stage: updatedStage || 'gathering_info',
          ...statusUpdate,
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

router.patch('/profile/timezone', async (req, res) => {
  const { userId, timezone } = req.body
  if (!userId || !timezone) {
    return res.status(400).json({ error: 'userId and timezone required' })
  }

  try {
    await supabase
      .from('profiles')
      .update({ timezone })
      .eq('id', userId)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/usage', async (req, res) => {
  const { userId } = req.query

  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'plan_id, runs_used, test_runs_used, topup_runs, billing_period_start, cancel_at_period_end, current_period_end, timezone'
      )
      .eq('id', userId)
      .single()

    if (error || !profile) {
      console.log('Usage: no profile for user', userId, error?.message)
      return res.json({
        plan: 'free',
        planName: 'Free',
        runsUsed: 0,
        testRunsUsed: 0,
        runsLimit: 50,
        runsRemaining: 50,
        billingPeriodStart: new Date().toISOString().split('T')[0],
        daysUntilReset: 30,
        status: 'safe',
        percentUsed: 0,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        timezone: 'UTC',
      })
    }

    const billingStart = profile.billing_period_start
      ? new Date(profile.billing_period_start)
      : new Date()
    const now = new Date()
    const daysSinceReset = Math.floor(
      (now - billingStart) / (1000 * 60 * 60 * 24)
    )

    if (daysSinceReset >= 30) {
      await supabase
        .from('profiles')
        .update({
          runs_used: 0,
          test_runs_used: 0,
          topup_runs: 0,
          billing_period_start: now.toISOString().split('T')[0],
        })
        .eq('id', userId)

      profile.runs_used = 0
      profile.test_runs_used = 0
      profile.topup_runs = 0
      profile.billing_period_start = now.toISOString().split('T')[0]
      console.log('✅ Monthly runs reset for user:', userId)
    }

    const planInfo = resolvePlanInfo(profile)
    const topupRuns = profile.topup_runs || 0
    const runsLimit = planInfo.runsLimit + topupRuns
    const runsUsed = profile.runs_used || 0
    const testRunsUsed = profile.test_runs_used || 0
    const billingStartForCalc = profile.billing_period_start
      ? new Date(profile.billing_period_start)
      : new Date()
    const daysSinceResetCalc = Math.floor(
      (now - billingStartForCalc) / (1000 * 60 * 60 * 24)
    )
    const daysUntilReset = Math.max(0, 30 - daysSinceResetCalc)
    const runsRemaining = Math.max(0, runsLimit - runsUsed)
    const percentUsed =
      runsLimit > 0 ? Math.round((runsUsed / runsLimit) * 100) : 0

    const dailyRate = daysSinceResetCalc > 0 ? runsUsed / daysSinceResetCalc : 0
    const projectedDeficit = runsRemaining - dailyRate * daysUntilReset
    const daysUntilEmpty =
      dailyRate > 0 ? Math.floor(runsRemaining / dailyRate) : 999

    let status = 'safe'
    if (runsUsed >= runsLimit) {
      status = 'limit_reached'
    } else if (projectedDeficit < 0 && daysUntilEmpty <= 2) {
      status = 'critical'
    } else if (projectedDeficit < 0) {
      status = 'warning'
    }

    res.json({
      plan: planInfo.id,
      planName: planInfo.name,
      runsUsed,
      testRunsUsed,
      runsLimit,
      topupRuns,
      runsRemaining,
      billingPeriodStart:
        profile.billing_period_start ||
        new Date().toISOString().split('T')[0],
      daysUntilReset,
      daysUntilEmpty: daysUntilEmpty < 999 ? daysUntilEmpty : null,
      status,
      percentUsed,
      dailyRate: Math.round(dailyRate * 10) / 10,
      cancelAtPeriodEnd: profile.cancel_at_period_end || false,
      currentPeriodEnd: profile.current_period_end || null,
      timezone: profile.timezone || 'UTC',
    })
  } catch (err) {
    console.error('Usage error:', err)
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

    const { ensureWorkflowCredentialUrls } = require('../services/workflowBuilder')
    for (const row of data || []) {
      if (row.n8n_workflow_id) {
        ensureWorkflowCredentialUrls(userId, row.n8n_workflow_id).catch(() => {})
      }
    }

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

    if (data.n8n_workflow_id) {
      const { ensureWorkflowCredentialUrls } = require('../services/workflowBuilder')
      await ensureWorkflowCredentialUrls(userId, data.n8n_workflow_id)
    }

    res.json({ automation: data })
  } catch (err) {
    console.error('Get automation error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/automations/:id/history', async (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const { data: workflow } = await supabase
      .from('workflows')
      .select('n8n_workflow_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!workflow?.n8n_workflow_id) {
      return res.json({ executions: [] })
    }

    const { n8nClient } = require('../services/n8n')
    const response = await n8nClient.get('/api/v1/executions', {
      params: {
        workflowId: workflow.n8n_workflow_id,
        limit: 20,
        includeData: false,
      },
    })

    const executions = (response.data?.data || []).map((exec) => ({
      id: exec.id,
      status: exec.status === 'success' ? 'success' : 'error',
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt,
      duration:
        exec.stoppedAt && exec.startedAt
          ? Math.round(
              (new Date(exec.stoppedAt) - new Date(exec.startedAt)) / 1000
            )
          : null,
      mode: exec.mode,
    }))

    res.json({ executions })
  } catch (err) {
    console.error('Get history error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.patch('/automations/:id/rename', async (req, res) => {
  const { id } = req.params
  const { userId, name } = req.body

  if (!userId || !name) {
    return res.status(400).json({ error: 'userId and name required' })
  }

  try {
    const { error } = await supabase
      .from('workflows')
      .update({ auto_name: name.trim() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error

    res.json({ success: true })
  } catch (err) {
    console.error('Rename error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/automations/:id', async (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  console.log('Delete request for automation:', id, 'user:', userId)

  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('n8n_workflow_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    console.log('Workflow found:', workflow)

    if (fetchError || !workflow) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    if (workflow.n8n_workflow_id) {
      try {
        const { n8nClient } = require('../services/n8n')
        const result = await n8nClient.delete(
          `/api/v1/workflows/${workflow.n8n_workflow_id}`
        )
        console.log('n8n delete result:', result.data)
      } catch (err) {
        console.error('n8n delete error (continuing):', err.message)
      }
    }

    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('Supabase delete error:', error)
      throw error
    }

    console.log('Supabase delete complete')
    res.json({ success: true })
  } catch (err) {
    console.error('Delete automation error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.patch('/automations/:id/pause', async (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const { data: workflow } = await supabase
      .from('workflows')
      .select('n8n_workflow_id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!workflow) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    const currentStatus = workflow.status
    const isPaused = currentStatus === 'paused'
    const newStatus = isPaused ? 'active' : 'paused'

    console.log('Pause toggle:', { currentStatus, isPaused, newStatus })

    if (workflow.n8n_workflow_id) {
      try {
        const { n8nClient } = require('../services/n8n')
        if (isPaused) {
          await n8nClient.post(
            `/api/v1/workflows/${workflow.n8n_workflow_id}/activate`
          )
          console.log('✅ n8n workflow activated:', workflow.n8n_workflow_id)
        } else {
          await n8nClient.post(
            `/api/v1/workflows/${workflow.n8n_workflow_id}/deactivate`
          )
          console.log('✅ n8n workflow deactivated:', workflow.n8n_workflow_id)
        }
      } catch (err) {
        console.error('n8n pause/resume error:', err.response?.data || err.message)
      }
    }

    const { error: updateError } = await supabase
      .from('workflows')
      .update({ status: newStatus })
      .eq('id', id)
      .eq('user_id', userId)

    if (updateError) {
      console.error('Supabase pause update error:', updateError)
      throw updateError
    }

    res.json({ success: true, status: newStatus })
  } catch (err) {
    console.error('Pause automation error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
