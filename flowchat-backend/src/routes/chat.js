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

const PROMPTS_DIR = path.join(__dirname, '../prompts')
const AGENT_PROMPT_PATH = path.join(PROMPTS_DIR, 'agent.txt')
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
    description: 'Fetch real data from connected apps. Always call this before asking the user to pick anything. Each app type returns a list with exact IDs in parentheses - copy these IDs character-for-character when using them in subsequent calls.',
    input_schema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          enum: [
            'sheets',
            'sheet_tabs',
            'slack',
            'typeform_forms',
            'typeform_fields',
            'typeform_response_count'
          ],
          description: 'What to fetch. Use sheet_tabs only after getting sheet_id from sheets. Use typeform_fields only after getting form_id from typeform_forms. Use typeform_response_count after build succeeds.'
        },
        form_id: {
          type: 'string',
          description: 'Required for typeform_fields and typeform_response_count. Copy the exact ID from typeform_forms result - the string between "(ID: " and ")". Example: from "My new form (ID: HPExk4sV)" copy exactly "HPExk4sV" - every character including hyphens and underscores.'
        },
        sheet_id: {
          type: 'string',
          description: 'Required for sheet_tabs. Copy the exact ID from sheets result - the string between "(ID: " and ")". Example: from "Mark Tester (ID: 1G5Zx-0cuvlbyJ0R1_cHLHIEOOWp5-ZKoDXO4HwVJcZ8)" copy exactly "1G5Zx-0cuvlbyJ0R1_cHLHIEOOWp5-ZKoDXO4HwVJcZ8" - every character.'
        }
      },
      required: ['app']
    }
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
  {
    name: 'fix_workflow',
    description:
      'Fix a specific issue in the broken workflow. Use this to update a channel, sheet, email recipient, or other configuration.',
    input_schema: {
      type: 'object',
      properties: {
        change_type: {
          type: 'string',
          enum: ['channel', 'sheet', 'email_recipient', 'email_subject', 'message', 'cron'],
          description: 'What to change',
        },
        new_value: {
          type: 'string',
          description: 'The new value to set',
        },
        explanation: {
          type: 'string',
          description: 'Plain English explanation of what was changed',
        },
      },
      required: ['change_type', 'new_value', 'explanation'],
    },
  },
  {
    name: 'request_reconnection',
    description:
      'Request the user to reconnect an app. Use when auth has expired or permissions were removed.',
    input_schema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          enum: ['google', 'slack', 'typeform', 'airtable', 'stripe', 'calendly'],
          description: 'The app that needs reconnection',
        },
        reason: {
          type: 'string',
          description: 'Plain English reason why reconnection is needed',
        },
      },
      required: ['app', 'reason'],
    },
  },
  {
    name: 'test_fixed_workflow',
    description: 'Test the workflow after a fix to confirm it works.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'mark_resolved',
    description:
      'Mark the automation as resolved after successfully fixing it. Reactivates the workflow and resets error state.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Plain English summary of what was fixed',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'sync_historical_data',
    description:
      'Import existing Typeform responses into the connected Google Sheet',
    input_schema: {
      type: 'object',
      properties: {
        form_id: { type: 'string' },
        sheet_id: { type: 'string' },
        sheet_tab: { type: 'string' },
        field_mapping: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
      },
      required: ['form_id', 'sheet_id'],
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

async function waitForExecution(workflowId, timeoutMs = 15000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      const res = await axios.get(
        `${process.env.BACKEND_URL}/api/n8n/executions?workflowId=${workflowId}&limit=1`,
        { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
      )

      const executions = res.data?.data || []
      const latest = executions[0]

      if (!latest) continue
      if (latest.status === 'running') continue

      return {
        success: latest.status === 'success',
        status: latest.status,
        executionId: latest.id,
        error: latest.data?.resultData?.error?.message || null
      }
    } catch (err) {
      console.error('Execution poll error:', err.message)
    }
  }

  return { success: false, status: 'timeout', error: 'Execution timed out' }
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

        if (app === 'sheets') {
          try {
            const { data: account } = await supabase
              .from('platform_accounts')
              .select('access_token, refresh_token')
              .eq('user_id', userId)
              .eq('platform', 'google')
              .single()

            if (!account) {
              return { result: 'Google account not connected.' }
            }

            let accessToken = account.access_token

            const fetchSheets = async (token) => {
              return axios.get(
                'https://www.googleapis.com/drive/v3/files',
                {
                  params: {
                    q: "mimeType='application/vnd.google-apps.spreadsheet'",
                    fields: 'files(id,name)',
                    pageSize: 20
                  },
                  headers: { Authorization: `Bearer ${token}` }
                }
              )
            }

            let sheetsRes
            try {
              sheetsRes = await fetchSheets(accessToken)
            } catch (err) {
              if (err.response?.status === 401 && account.refresh_token) {
                console.log('Google token expired, refreshing...')

                const refreshRes = await axios.post(
                  'https://oauth2.googleapis.com/token',
                  new URLSearchParams({
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    refresh_token: account.refresh_token,
                    grant_type: 'refresh_token'
                  }).toString(),
                  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                )

                accessToken = refreshRes.data.access_token

                await supabase
                  .from('platform_accounts')
                  .update({
                    access_token: accessToken,
                    updated_at: new Date().toISOString()
                  })
                  .eq('user_id', userId)
                  .eq('platform', 'google')

                console.log('✅ Google token refreshed successfully')
                sheetsRes = await fetchSheets(accessToken)
              } else {
                throw err
              }
            }

            const files = sheetsRes.data.files || []
            if (files.length === 0) {
              return { result: 'No Google Sheets found in your account.' }
            }

            return {
              result: files.map(f => `${f.name} (ID: ${f.id})`).join('\n')
            }

          } catch (err) {
            console.error('Sheets fetch error:', err.response?.data || err.message)
            return { result: 'Could not fetch Google Sheets. Please try again.' }
          }
        }

        if (app === 'sheet_tabs') {
          console.log('sheet_tabs input:', JSON.stringify(input))
          try {
            const { sheet_id } = input
            if (!sheet_id) {
              return { result: 'No sheet_id provided.' }
            }

            const { data: account } = await supabase
              .from('platform_accounts')
              .select('access_token, refresh_token')
              .eq('user_id', userId)
              .eq('platform', 'google')
              .single()

            if (!account) {
              return { result: 'Google account not connected.' }
            }

            let accessToken = account.access_token

            const fetchTabs = async (token) => {
              return axios.get(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}`,
                {
                  params: { fields: 'sheets.properties.title' },
                  headers: { Authorization: `Bearer ${token}` }
                }
              )
            }

            let res
            try {
              res = await fetchTabs(accessToken)
            } catch (err) {
              if (err.response?.status === 401 && account.refresh_token) {
                const refreshRes = await axios.post(
                  'https://oauth2.googleapis.com/token',
                  new URLSearchParams({
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    refresh_token: account.refresh_token,
                    grant_type: 'refresh_token'
                  }).toString(),
                  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                )
                accessToken = refreshRes.data.access_token
                await supabase
                  .from('platform_accounts')
                  .update({ access_token: accessToken, updated_at: new Date().toISOString() })
                  .eq('user_id', userId)
                  .eq('platform', 'google')
                res = await fetchTabs(accessToken)
              } else {
                throw err
              }
            }

            const tabs = res.data.sheets?.map(s => s.properties.title) || []
            if (tabs.length === 0) {
              return { result: 'No tabs found in this sheet.' }
            }
            if (tabs.length === 1) {
              return { result: `This sheet has one tab: ${tabs[0]}`, tabs }
            }
            return {
              result: tabs.map((t, i) => `${i + 1}. ${t}`).join('\n'),
              tabs
            }

          } catch (err) {
            console.error('sheet_tabs error:', err.response?.data || err.message)
            return { result: 'Could not fetch sheet tabs. Please type the tab name.' }
          }
        }

        if (app === 'typeform_forms') {
          try {
            const response = await axios.get(
              `${process.env.BACKEND_URL}/api/integrations/typeform/forms/${userId}`,
              { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
            )
            const forms = response.data.forms || []
            if (forms.length === 0) {
              return { result: 'No Typeform forms found. The user may need to create a form first.' }
            }
            return {
              result: forms.map(f => `${f.title} (ID: ${f.id})`).join('\n')
            }
          } catch (err) {
            return { result: 'Could not fetch Typeform forms. User may need to reconnect Typeform.' }
          }
        }

        if (app === 'typeform_fields') {
          console.log('typeform_fields params:', JSON.stringify(input))
          try {
            const form_id = input?.form_id || input?.formId
            if (!form_id) {
              return { result: 'No form_id provided — please pass form_id parameter.' }
            }

            const response = await axios.get(
              `${process.env.BACKEND_URL}/api/integrations/typeform/fields/${userId}/${form_id}`,
              { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
            )

            const fields = response.data.fields || []
            if (fields.length === 0) {
              return { result: 'No fields found on this form.' }
            }

            return {
              result: fields.map((f, i) => `${i + 1}. ${f.title} (ID: ${f.id}, type: ${f.type})`).join('\n'),
              fields: fields
            }
          } catch (err) {
            console.error('typeform_fields error:', err.response?.data || err.message)
            return { result: 'Could not fetch form fields.' }
          }
        }

        if (app === 'typeform_response_count') {
          try {
            const form_id = input?.form_id || input?.formId
            if (!form_id) {
              return { result: 'No form_id provided - please pass form_id parameter.' }
            }

            const { data: account } = await supabase
              .from('platform_accounts')
              .select('access_token')
              .eq('user_id', userId)
              .eq('platform', 'typeform')
              .single()

            if (!account?.access_token) {
              return { result: 'Typeform account not connected.' }
            }

            const response = await axios.get(
              `https://api.typeform.com/forms/${form_id}/responses?page_size=1`,
              { headers: { Authorization: `Bearer ${account.access_token}` } }
            )

            const count = response.data?.total_items ?? response.data?.items?.length ?? 0
            return {
              result: `This form has ${count} existing response${count === 1 ? '' : 's'}.`,
              count,
            }
          } catch (err) {
            console.error('typeform_response_count error:', err.response?.data || err.message)
            return { result: 'Could not fetch existing response count.' }
          }
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

    case 'request_app_connection': {
      const app = (input.app || '').toLowerCase()

      if (app === 'typeform') {
        const formId = input.formId || input.form_id
        let url = `${process.env.BACKEND_URL}/api/auth/typeform?userId=${encodeURIComponent(userId)}`
        if (formId) {
          url += `&formId=${encodeURIComponent(formId)}`
        }
        return {
          app: 'typeform',
          url,
          message: 'I need access to your Typeform account to set this up — click below to connect it, it takes about 30 seconds.',
        }
      }

      return {
        app: input.app,
        url: `${process.env.BACKEND_URL}/api/auth/${input.app}?userId=${encodeURIComponent(userId)}`,
        message: `Click below to connect ${input.app}`,
      }
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

        // Parse sheet_id from details
        if (!detailsObj.sheet_id) {
          const nameToCheck = detailsObj.sheet_name || detailsObj.spreadsheet || ''
          const match = nameToCheck.match(/\(ID:\s*([^)]+)\)/)
          if (match) {
            detailsObj.sheet_id = match[1].trim()
          }
        }

        // If still no sheet_id, fetch it from Google Drive
        if (!detailsObj.sheet_id && (detailsObj.spreadsheet || detailsObj.sheet_name)) {
          try {
            const sheetName = detailsObj.spreadsheet || detailsObj.sheet_name
            const { data: account } = await supabase
              .from('platform_accounts')
              .select('access_token')
              .eq('user_id', userId)
              .eq('platform', 'google')
              .single()

            if (account) {
              const sheetsRes = await axios.get(
                'https://www.googleapis.com/drive/v3/files',
                {
                  params: {
                    q: `mimeType='application/vnd.google-apps.spreadsheet' and name='${sheetName.replace(/'/g, "\\'")}'`,
                    fields: 'files(id,name)',
                    pageSize: 5
                  },
                  headers: { Authorization: `Bearer ${account.access_token}` }
                }
              )
              const files = sheetsRes.data.files || []
              if (files.length > 0) {
                detailsObj.sheet_id = files[0].id
                console.log(`✅ Resolved sheet_id for "${sheetName}": ${detailsObj.sheet_id}`)
              }
            }
          } catch (err) {
            console.error('Sheet ID lookup error:', err.message)
          }
        }

        // Parse form_id from details
        if (!detailsObj.form_id && !detailsObj.typeform_form_id) {
          const formNameToCheck = detailsObj.form_name || detailsObj.typeform_form || detailsObj.form || ''
          const formMatch = formNameToCheck.match(/\(ID:\s*([^)]+)\)/)
          if (formMatch) {
            detailsObj.form_id = formMatch[1].trim()
          }
        }

        // Parse field_mapping from details
        // Agent passes it as array of {id, title, type}
        let typeformTriggerConfig = null
        if (detailsObj.field_mapping && Array.isArray(detailsObj.field_mapping)) {
          typeformTriggerConfig = {
            form_id: detailsObj.form_id || detailsObj.typeform_form_id,
            field_mapping: detailsObj.field_mapping
          }
        }

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

        const triggerApp = trigger_app?.toLowerCase().replace(/\s+/g, '_')
        let webhookUrl = testWebhookUrl
        let triggerConfig = {}

        if (triggerApp === 'typeform') {
          const typeformTriggerNode = workflowData.nodes?.find(
            (node) => node.name === 'Typeform Trigger'
          )
          const webhookPath = typeformTriggerNode?.parameters?.path

          if (webhookPath) {
            webhookUrl = `${process.env.N8N_BASE_URL.replace(/\/$/, '')}/webhook/${webhookPath}`
          }

          triggerConfig = typeformTriggerConfig || {
            form_id: detailsObj.form_id || detailsObj.typeform_form_id
          }
        }

        const workflowName = `${userEmail} — ${trigger_app} → ${action_app}`

        if (automationId) {
          const { error: updateError } = await supabase
            .from('workflows')
            .update({
              n8n_workflow_id: created.id,
              name: workflowName,
              status: 'active',
              stage: 'live',
              webhook_url: webhookUrl,
              test_webhook_url: testWebhookUrl,
              trigger_app,
              action_apps: [action_app],
              trigger_config: triggerConfig,
            })
            .eq('id', automationId)
            .eq('user_id', userId)

          if (updateError) {
            console.error('Failed to update workflow in Supabase:', updateError)
          }
        } else {
          console.error('build_workflow: no automationId — could not save workflow to Supabase')
        }

        if (trigger_app === 'typeform') {
          try {
            const formId = detailsObj.form_id || detailsObj.typeform_form_id

            if (!formId) {
              console.error('No form_id in details for Typeform webhook registration:', detailsObj)
            } else {
              const { data: tfAccount } = await supabase
                .from('platform_accounts')
                .select('access_token')
                .eq('user_id', userId)
                .eq('platform', 'typeform')
                .single()

              if (tfAccount) {
                const { registerTypeformWebhook } = require('./auth')
                await registerTypeformWebhook(userId, formId, tfAccount.access_token)
                console.log(`✅ Typeform webhook registered for form ${formId}`)

                if (automationId) {
                  await supabase
                    .from('workflows')
                    .update({ trigger_config: triggerConfig })
                    .eq('id', automationId)
                }
              }
            }
          } catch (err) {
            console.error('Typeform webhook registration error:', err.message)
          }
        }

        return {
          success: true,
          workflowId: created.id,
          summary: 'Automation built and activated successfully.',
        }
      } catch (err) {
        console.error('build_workflow error:', err.response?.data || err.message)
        console.error('build_workflow stack:', err.stack)
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
          .select('*')
          .eq('id', automationId)
          .single()

        if (!workflow) {
          return { success: false, summary: 'Automation not found' }
        }

        if (!workflow.n8n_workflow_id) {
          return {
            success: false,
            summary: 'No n8n workflow linked. Please rebuild this automation.',
          }
        }

        let testUrl = workflow.test_webhook_url || workflow.webhook_url

        // For Typeform workflows, get the test webhook URL from n8n if not stored
        if (workflow.trigger_app === 'typeform' && workflow.n8n_workflow_id && !workflow.test_webhook_url) {
          const n8nRes = await axios.get(
            `${process.env.BACKEND_URL}/api/n8n/workflows/${workflow.n8n_workflow_id}`,
            { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
          )
          const nodes = n8nRes.data?.nodes || []
          const testNode = nodes.find(n => n.name === 'Test Webhook')
          if (testNode?.parameters?.path) {
            testUrl = `${process.env.N8N_BASE_URL.replace(/\/$/, '')}/webhook/${testNode.parameters.path}`
          }
        }

        if (!testUrl) {
          return {
            success: false,
            summary: 'No test webhook found. Please rebuild this automation.',
          }
        }

        const testPayload = {
          submitter_name: 'Test User',
          submitter_email: 'test@flowchat.now',
          submitted_at: new Date().toISOString(),
          form_id: workflow.trigger_config?.form_id || 'test'
        }

        await axios.post(testUrl, testPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        })

        const result = await waitForExecution(workflow.n8n_workflow_id)

        if (result.success) {
          await logExecution(userId, workflow.id, {
            mode: 'webhook',
            status: 'success',
            id: result.executionId,
          })

          return {
            success: true,
            summary: 'Test completed successfully — check your sheet for a new row.',
          }
        }

        await logExecution(userId, workflow.id, {
          mode: 'webhook',
          status: 'error',
          id: result.executionId,
        }).catch(() => {})

        return {
          success: false,
          summary: `Test failed: ${result.error || result.status || 'unknown error'}`,
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

        return { success: false, summary: `The test failed: ${err.message}` }
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

    case 'fix_workflow': {
      try {
        const { change_type, new_value, explanation } = input

        const { data: workflow } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', automationId)
          .single()

        if (!workflow?.n8n_workflow_id) {
          return { success: false, message: 'Workflow not found' }
        }

        const workflowRes = await fetch(
          `${process.env.N8N_BASE_URL}/api/v1/workflows/${workflow.n8n_workflow_id}`,
          { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } }
        )
        const n8nWorkflow = await workflowRes.json()

        const updatedNodes = n8nWorkflow.nodes.map((node) => {
          if (change_type === 'channel' && node.name === 'Send Slack Message') {
            const body = JSON.parse(node.parameters.jsonBody || '{}')
            body.channel = new_value.startsWith('#') ? new_value : `#${new_value}`
            return {
              ...node,
              parameters: { ...node.parameters, jsonBody: JSON.stringify(body) },
            }
          }
          if (change_type === 'message' && node.name === 'Send Slack Message') {
            const body = JSON.parse(node.parameters.jsonBody || '{}')
            body.text = new_value
            return {
              ...node,
              parameters: { ...node.parameters, jsonBody: JSON.stringify(body) },
            }
          }
          if (change_type === 'email_recipient' && node.name === 'Send Gmail') {
            const rawEmail = Buffer.from(
              `To: ${new_value}\r\nSubject: Update\r\nContent-Type: text/plain\r\n\r\nUpdate`
            ).toString('base64url')
            return {
              ...node,
              parameters: {
                ...node.parameters,
                jsonBody: JSON.stringify({ raw: rawEmail }),
              },
            }
          }
          if (change_type === 'cron' && node.type === 'n8n-nodes-base.scheduleTrigger') {
            return {
              ...node,
              parameters: {
                rule: {
                  interval: [{ field: 'cronExpression', expression: new_value }],
                },
              },
            }
          }
          return node
        })

        await fetch(
          `${process.env.N8N_BASE_URL}/api/v1/workflows/${workflow.n8n_workflow_id}`,
          {
            method: 'PUT',
            headers: {
              'X-N8N-API-KEY': process.env.N8N_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: n8nWorkflow.name,
              nodes: updatedNodes,
              connections: n8nWorkflow.connections,
              settings: {
                ...n8nWorkflow.settings,
                errorWorkflow: 'QhkpkeGqlspl7xXY',
              },
            }),
          }
        )

        await fetch(
          `${process.env.N8N_BASE_URL}/api/v1/workflows/${workflow.n8n_workflow_id}/activate`,
          {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY },
          }
        )

        return { success: true, message: explanation }
      } catch (err) {
        console.error('fix_workflow error:', err)
        return { success: false, message: err.message }
      }
    }

    case 'request_reconnection': {
      const { app, reason } = input
      const normalizedApp = (app || '').toLowerCase()
      let reconnectUrl = `${process.env.BACKEND_URL}/api/auth/${normalizedApp}?userId=${encodeURIComponent(userId)}`
      if (normalizedApp === 'typeform' && (input.formId || input.form_id)) {
        reconnectUrl += `&formId=${encodeURIComponent(input.formId || input.form_id)}`
      }
      return {
        success: true,
        action: 'request_connection',
        app,
        url: reconnectUrl,
        message: reason,
      }
    }

    case 'test_fixed_workflow': {
      try {
        const { data: workflow } = await supabase
          .from('workflows')
          .select('webhook_url')
          .eq('id', automationId)
          .single()

        if (!workflow?.webhook_url) {
          return { success: false, message: 'No test webhook found' }
        }

        const testRes = await fetch(workflow.webhook_url, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })

        if (testRes.ok) {
          return {
            success: true,
            message: 'Test successful — the automation is working correctly.',
          }
        }
        return { success: false, message: 'Test failed — there may still be an issue.' }
      } catch (err) {
        return { success: false, message: `Test failed: ${err.message}` }
      }
    }

    case 'mark_resolved': {
      try {
        const { summary } = input

        await supabase
          .from('workflows')
          .update({
            status: 'active',
            consecutive_failures: 0,
            last_error_type: null,
            last_error_at: null,
            last_error_message: null,
            notification_sent_at: null,
          })
          .eq('id', automationId)
          .eq('user_id', userId)

        return { success: true, summary }
      } catch (err) {
        return { success: false, message: err.message }
      }
    }

    case 'sync_historical_data': {
      try {
        const { form_id, sheet_id, sheet_tab, field_mapping } = input

        const response = await axios.post(
          `${process.env.BACKEND_URL}/api/integrations/typeform/sync/${userId}/${form_id}`,
          {
            sheetId: sheet_id,
            sheetTab: sheet_tab || 'Sheet1',
            fieldMapping: field_mapping || []
          },
          { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
        )

        const { imported } = response.data
        return {
          success: true,
          summary: `Imported ${imported} existing response${imported !== 1 ? 's' : ''} into your sheet.`
        }
      } catch (err) {
        console.error('sync_historical_data error:', err.message)
        return { success: false, summary: 'Could not import existing responses.' }
      }
    }

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

// Auto-detect quick reply opportunities from tool results
// When get_user_resources returns a list, construct quick_replies
function extractQuickReplies(lastToolName, lastToolResult) {
  if (lastToolName !== 'get_user_resources') return null

  const result = lastToolResult?.result
  if (!result || typeof result !== 'string') return null

  // Parse numbered or bulleted lists from tool results
  const lines = result.split('\n').filter(l => l.trim())

  // Check if result looks like a list
  const listPattern = /^(\d+\.\s+|[-•*]\s+)/
  const listItems = lines.filter(l => listPattern.test(l.trim()))

  if (listItems.length < 2) return null

  // Extract labels — remove numbering and ID suffixes for display
  const options = listItems.map(item => {
    const cleaned = item.replace(listPattern, '').trim()
    // For display, show just the name without the (ID: xxx) part
    const label = cleaned.replace(/\s*\(ID:[^)]+\)/i, '').trim()
    // For value, use the full string so IDs are preserved
    const value = label
    return { label, value }
  })

  // Cap at 8 options, add "See more" if needed
  if (options.length > 8) {
    return options.slice(0, 7).concat([{ label: 'See more...', value: 'show_more' }])
  }

  return options.length >= 2 ? options : null
}

// Also handle yes/no confirmations
// When the agent asks a confirmation question, add standard buttons
function detectConfirmationButtons(replyText) {
  const confirmPatterns = [
    /does this look right/i,
    /does that work/i,
    /should i use/i,
    /would you like me to/i,
    /shall i/i,
  ]

  const testPatterns = [
    /run a.*test/i,
    /quick test/i,
    /test.*now/i,
  ]

  const syncPatterns = [
    /import them now/i,
    /existing responses/i,
    /import.*responses/i,
  ]

  if (testPatterns.some(p => p.test(replyText))) {
    return [
      { label: 'Yes, test it', value: 'Yes, test it' },
      { label: 'Skip for now', value: 'Skip for now' }
    ]
  }

  if (syncPatterns.some(p => p.test(replyText))) {
    return [
      { label: 'Yes, import them', value: 'Yes, import them' },
      { label: 'No thanks', value: 'No thanks' }
    ]
  }

  if (confirmPatterns.some(p => p.test(replyText))) {
    return [
      { label: 'Looks good', value: 'Looks good' },
      { label: 'Change something', value: 'Change something' }
    ]
  }

  return null
}

function applyAutoQuickReplies({ agentReply, lastToolName, lastToolResult, action, actionData }) {
  let quickReplyOptions = null

  if (lastToolName && lastToolResult) {
    quickReplyOptions = extractQuickReplies(lastToolName, lastToolResult)
  }

  if (!quickReplyOptions && agentReply) {
    quickReplyOptions = detectConfirmationButtons(agentReply)
  }

  if (quickReplyOptions) {
    return {
      action: 'quick_replies',
      actionData: { options: quickReplyOptions },
    }
  }

  return { action, actionData }
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

  const responsePayload = {
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

  if (action === 'quick_replies' && actionData?.options) {
    responsePayload.action = 'quick_replies'
    responsePayload.actionData = actionData
  }

  return responsePayload
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

function buildCurrentState(workflow, automationId) {
  return workflow
    ? `
Automation ID: ${automationId}
Status: ${workflow.status || 'draft'}
Stage: ${workflow.stage || 'gathering_info'}
N8N Workflow: ${workflow.n8n_workflow_id ? 'Already built - ID: ' + workflow.n8n_workflow_id : 'Not built yet'}
Name: ${workflow.auto_name || 'Untitled'}
`
    : 'None. User is starting fresh.'
}

function populateLegacySystemPrompt(
  template,
  { connectedPlatforms, automationNames, workflow, automationId, timezone, userId }
) {
  const currentState = buildCurrentState(workflow, automationId)

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
    .replace('{{USER_ID}}', userId || '')
    .replace('{{USER_AUTOMATIONS}}', automationNames.length ? automationNames.join(', ') : 'None yet.')
    .replace('{{CURRENT_STATE}}', currentState)
    .replace('{{CONNECTED_APPS}}', connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None connected yet')
    .replace('{{INTEGRATION_METADATA}}', integrationMetadata)
    .replace('{{TIMEZONE}}', timezone || 'UTC')
}

function buildContextSection({
  connectedPlatforms,
  automationNames,
  workflow,
  automationId,
  timezone,
  userId,
}) {
  const currentState = workflow
    ? buildCurrentState(workflow, automationId).trim()
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

  return [
    '## Integration metadata',
    integrationMetadata,
    '',
    '## Current user context',
    `User ID: ${userId || ''}`,
    `Connected apps: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None connected yet'}`,
    `Timezone: ${timezone || 'UTC'}`,
    'Current automation:',
    currentState,
    `Their other automations: ${automationNames.length ? automationNames.join(', ') : 'None yet.'}`,
  ].join('\n')
}

function normalizeAppForPromptModule(app) {
  const value = (app || '').toLowerCase().trim()
  if (!value) return null

  if (value === 'google_sheets' || value === 'google sheets') return 'google-sheets'
  return value.replace(/_/g, '-').replace(/\s+/g, '-')
}

function extractConversationText(conversationHistory, message) {
  const historyText = (conversationHistory || [])
    .map((entry) => {
      if (typeof entry?.content === 'string') return entry.content
      return extractTextFromContent(entry?.content)
    })
    .join('\n')

  return `${historyText}\n${message || ''}`.toLowerCase()
}

function inferPromptApps({
  workflow,
  conversationHistory,
  message,
}) {
  const workflowTrigger = normalizeAppForPromptModule(workflow?.trigger_app)
  const workflowAction = normalizeAppForPromptModule(
    Array.isArray(workflow?.action_apps) ? workflow.action_apps[0] : workflow?.action_app
  )

  if (workflowTrigger || workflowAction) {
    return { triggerApp: workflowTrigger, actionApp: workflowAction }
  }

  const text = extractConversationText(conversationHistory, message)

  const triggerApp = text.includes('typeform')
    ? 'typeform'
    : /\bschedule\b|\bdaily\b|\bweekly\b|\bevery day\b|\bevery monday\b/.test(text)
      ? 'schedule'
      : null

  const actionApp = text.includes('google sheets') || text.includes('google sheet')
    ? 'google-sheets'
    : text.includes('slack')
      ? 'slack'
      : text.includes('gmail') || text.includes('send an email') || text.includes('send email')
        ? 'gmail'
        : null

  return { triggerApp, actionApp }
}

function buildSystemPrompt(triggerApp, actionApp) {
  const readPrompt = (filename) => {
    const filepath = path.join(PROMPTS_DIR, filename)
    if (!fs.existsSync(filepath)) return ''
    return fs.readFileSync(filepath, 'utf8')
  }

  const parts = [
    readPrompt('core-laws.txt'),
    readPrompt('interaction-standards.txt'),
    readPrompt('tools.txt'),
  ]

  const normalizedTrigger = normalizeAppForPromptModule(triggerApp)
  const normalizedAction = normalizeAppForPromptModule(actionApp)

  if (normalizedTrigger) {
    const triggerModule = readPrompt(`modules/${normalizedTrigger}.txt`)
    if (triggerModule) parts.push(triggerModule)
  }
  if (normalizedAction) {
    const actionModule = readPrompt(`modules/${normalizedAction}.txt`)
    if (actionModule && actionModule !== parts[parts.length - 1]) parts.push(actionModule)
  }

  if (normalizedTrigger === 'schedule') {
    const scheduleModule = readPrompt('modules/schedule.txt')
    if (scheduleModule && !parts.includes(scheduleModule)) parts.push(scheduleModule)
  }

  const assembled = parts.filter(Boolean).join('\n\n---\n\n')
  if (assembled.trim()) return assembled
  if (fs.existsSync(AGENT_PROMPT_PATH)) return fs.readFileSync(AGENT_PROMPT_PATH, 'utf8')
  return ''
}

function composeSystemPrompt({
  workflow,
  conversationHistory,
  message,
  connectedPlatforms,
  automationNames,
  automationId,
  timezone,
  userId,
}) {
  const isErrorResolution = workflow?.status === 'broken'

  if (isErrorResolution) {
    const errorTemplate = fs.readFileSync(
      path.join(PROMPTS_DIR, 'error-agent.txt'),
      'utf8'
    )
    return errorTemplate
      .replace('{{AUTOMATION_NAME}}', workflow.auto_name || workflow.name || 'Your automation')
      .replace('{{ERROR_TYPE}}', workflow.last_error_type || 'unknown')
      .replace(
        '{{FAILED_APP}}',
        workflow.last_error_message?.includes('Slack')
          ? 'Slack'
          : workflow.last_error_message?.includes('Gmail')
            ? 'Gmail'
            : workflow.last_error_message?.includes('Sheets')
              ? 'Google Sheets'
              : 'connected app'
      )
      .replace('{{ERROR_MESSAGE}}', workflow.last_error_message || 'Unknown error')
      .replace('{{CONSECUTIVE_FAILURES}}', String(workflow.consecutive_failures || 0))
      .replace(
        '{{LAST_ERROR_AT}}',
        workflow.last_error_at
          ? new Date(workflow.last_error_at).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'recently'
      )
      .replace('{{TIMEZONE}}', timezone || 'UTC')
  }

  const { triggerApp, actionApp } = inferPromptApps({
    workflow,
    conversationHistory,
    message,
  })

  const basePrompt = buildSystemPrompt(triggerApp, actionApp)
  const context = {
    connectedPlatforms,
    automationNames,
    workflow,
    automationId,
    timezone: timezone || 'UTC',
    userId,
  }

  if (basePrompt.includes('{{CURRENT_STATE}}') || basePrompt.includes('{{CONNECTED_APPS}}')) {
    return populateLegacySystemPrompt(basePrompt, context)
  }

  const populatedBase = basePrompt
    .replace(/\{\{USER_ID\}\}/g, userId || '')
    .replace(/\{\{CONNECTED_APPS\}\}/g, connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None connected yet')
    .replace(/\{\{CURRENT_STATE\}\}/g, buildCurrentState(workflow, automationId))
    .replace(/\{\{USER_AUTOMATIONS\}\}/g, automationNames.length ? automationNames.join(', ') : 'None yet.')
    .replace(/\{\{TIMEZONE\}\}/g, timezone || 'UTC')
    .replace(/\{\{INTEGRATION_METADATA\}\}/g, getMetadataForAgent([
      'schedule',
      'typeform',
      'stripe',
      'calendly',
      'google_sheets',
      'gmail',
      'slack',
      'airtable',
      'notion',
    ]))

  return `${populatedBase}\n\n---\n\n${buildContextSection(context)}`
}

function handleToolAction(block, result, state) {
  if (block.name === 'request_app_connection' || block.name === 'request_reconnection') {
    state.action = 'request_connection'
    state.actionData = result
  } else if (block.name === 'test_workflow' || block.name === 'test_fixed_workflow') {
    state.action = 'show_test_result'
    state.actionData = result
  } else if (block.name === 'activate_workflow' || block.name === 'mark_resolved') {
    state.action = 'automation_live'
    state.actionData = result
  } else if (block.name === 'build_workflow') {
    state.currentWorkflowId = result.workflowId
  } else if (block.name === 'check_connected_apps') {
    state.connectedApps = result.connected
  }
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

    const { connectedPlatforms, automationNames } = await loadUserContext(userId)
    const systemPrompt = composeSystemPrompt({
      workflow,
      conversationHistory,
      message,
      connectedPlatforms,
      automationNames,
      automationId,
      timezone: timezone || 'UTC',
      userId,
    })

    const effectiveMessage =
      message === '__error_resolution_start__' && workflow?.status === 'broken'
        ? 'Start the error resolution conversation. Greet the user and explain what went wrong with their automation.'
        : message

    // Truncate conversation history to last 20 messages
    // This prevents context window bloat and reduces latency/cost
    const truncatedHistory =
      conversationHistory.length > MAX_HISTORY
        ? conversationHistory.slice(-MAX_HISTORY)
        : conversationHistory

    const messages = [
      ...truncatedHistory,
      { role: 'user', content: effectiveMessage },
    ]

    let action = null
    let actionData = null
    let currentWorkflowId = n8nWorkflowId
    let connectedApps = [...connectedPlatforms]
    let replyText = ''
    let savedAutomationId = automationId
    let savedAutoName = autoName
    let lastToolName = null
    let lastToolResult = null

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

          lastToolName = block.name
          lastToolResult = result

          console.log(`Tool called: ${block.name}`)
          console.log(`Tool result: ${JSON.stringify(result)}`)

          const toolState = { action, actionData, currentWorkflowId, connectedApps }
          handleToolAction(block, result, toolState)
          action = toolState.action
          actionData = toolState.actionData
          currentWorkflowId = toolState.currentWorkflowId
          connectedApps = toolState.connectedApps

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

    ;({ action, actionData } = applyAutoQuickReplies({
      agentReply: replyText,
      lastToolName,
      lastToolResult,
      action,
      actionData,
    }))

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
    const responsePayload = {
      action,
      actionData,
      updatedState: {
        connectedApps,
        currentWorkflowId,
        stage: updatedStage,
        automationId: savedAutomationId,
        autoName: savedAutoName,
      }
    }

    if (action === 'quick_replies' && actionData?.options) {
      responsePayload.action = 'quick_replies'
      responsePayload.actionData = actionData
    }

    sendEvent('done', responsePayload)

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

    const { connectedPlatforms, automationNames } = await loadUserContext(userId)
    const systemPrompt = composeSystemPrompt({
      workflow,
      conversationHistory,
      message,
      connectedPlatforms,
      automationNames,
      automationId,
      timezone: timezone || 'UTC',
      userId,
    })

    const effectiveMessage =
      message === '__error_resolution_start__' && workflow?.status === 'broken'
        ? 'Start the error resolution conversation. Greet the user and explain what went wrong with their automation.'
        : message

    // Truncate conversation history to last 20 messages
    // This prevents context window bloat and reduces latency/cost
    const truncatedHistory =
      conversationHistory.length > MAX_HISTORY
        ? conversationHistory.slice(-MAX_HISTORY)
        : conversationHistory

    const messages = [
      ...truncatedHistory,
      { role: 'user', content: effectiveMessage },
    ]

    let action = null
    let actionData = null
    let currentWorkflowId = n8nWorkflowId
    let connectedApps = [...connectedPlatforms]
    let response = null
    let iterations = 0
    let replyText = ''
    let toolsWereUsed = false
    let lastToolName = null
    let lastToolResult = null

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

          lastToolName = block.name
          lastToolResult = result

          console.log(`Tool called: ${block.name}`)
          console.log(`Tool input: ${JSON.stringify(block.input)}`)
          console.log(`Tool result: ${JSON.stringify(result)}`)

          const toolState = { action, actionData, currentWorkflowId, connectedApps }
          handleToolAction(block, result, toolState)
          action = toolState.action
          actionData = toolState.actionData
          currentWorkflowId = toolState.currentWorkflowId
          connectedApps = toolState.connectedApps

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

    ;({ action, actionData } = applyAutoQuickReplies({
      agentReply: replyText,
      lastToolName,
      lastToolResult,
      action,
      actionData,
    }))

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

router.patch('/profile/complete-onboarding', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    await supabase
      .from('profiles')
      .update({ first_login: false })
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
        'plan_id, runs_used, test_runs_used, topup_runs, billing_period_start, cancel_at_period_end, current_period_end, timezone, first_login'
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
        first_login: true,
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
      first_login: profile.first_login !== false,
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
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!workflow) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    const { data: executions, error } = await supabase
      .from('executions')
      .select('id, status, mode, ran_at, details, error_message')
      .eq('workflow_id', id)
      .eq('user_id', userId)
      .order('ran_at', { ascending: false })
      .limit(20)

    if (error) throw error

    res.json({
      executions: (executions || []).map((exec) => ({
        id: exec.id,
        status: exec.status,
        mode: exec.mode,
        ran_at: exec.ran_at,
        details: exec.details,
        error_message: exec.error_message,
      })),
    })
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
      .select('n8n_workflow_id, trigger_app, trigger_config')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    console.log('Workflow found:', workflow)

    if (fetchError || !workflow) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    if (workflow.n8n_workflow_id) {
      try {
        await axios.delete(
          `${process.env.BACKEND_URL}/api/n8n/workflows/${workflow.n8n_workflow_id}`,
          { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
        )
      } catch (err) {
        if (err.response?.status !== 404) {
          console.error('n8n delete error:', err.message)
        }
      }
    }

    if (workflow.trigger_app === 'typeform' && workflow.trigger_config?.form_id) {
      try {
        const { data: tfAccount } = await supabase
          .from('platform_accounts')
          .select('access_token')
          .eq('user_id', userId)
          .eq('platform', 'typeform')
          .single()

        if (tfAccount) {
          const { deregisterTypeformWebhook } = require('./integrations/typeform')
          await deregisterTypeformWebhook(
            userId,
            workflow.trigger_config.form_id,
            tfAccount.access_token
          )
        }
      } catch (err) {
        console.error('Typeform webhook deregister error:', err.message)
      }
    }

    await supabase
      .from('executions')
      .delete()
      .eq('workflow_id', id)

    const { error: deleteError } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Supabase delete error:', deleteError)
      return res.status(500).json({ error: deleteError.message })
    }

    console.log('✅ Workflow deleted successfully')

    // If n8n_workflow_id is null, try to find and delete orphaned workflows
    if (!workflow.n8n_workflow_id) {
      try {
        const { data: n8nWorkflows } = await axios.get(
          `${process.env.BACKEND_URL}/api/n8n/workflows`,
          { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
        )

        const { data: trackedWorkflows } = await supabase
          .from('workflows')
          .select('n8n_workflow_id')
          .eq('user_id', userId)
          .not('n8n_workflow_id', 'is', null)

        const trackedIds = trackedWorkflows.map(w => w.n8n_workflow_id)

        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        const userEmail = userData?.user?.email

        const orphans = n8nWorkflows.data?.filter(w =>
          userEmail && w.name.includes(userEmail) && !trackedIds.includes(w.id)
        ) || []

        for (const orphan of orphans) {
          await axios.delete(
            `${process.env.BACKEND_URL}/api/n8n/workflows/${orphan.id}`,
            { headers: { 'x-api-key': process.env.INTERNAL_API_KEY } }
          )
          console.log(`🧹 Deleted orphaned n8n workflow: ${orphan.id}`)
        }
      } catch (err) {
        console.error('Orphan cleanup error:', err.message)
      }
    }

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
