const N8N_BACKEND_URL = 'https://flowchat-production-376f.up.railway.app'

function getInternalApiKey() {
  return process.env.INTERNAL_API_KEY || ''
}

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ''

function normalizeActionEvent(event) {
  const normalized = event?.toLowerCase().replace(/\s+/g, '_') || ''
  const compact = normalized.replace(/_/g, '')
  const aliases = {
    sendmessage: 'send_message',
    appendrow: 'append_row',
    sendemail: 'send_email',
  }
  return aliases[compact] || normalized
}

function credentialsUrl(userId, platform) {
  return `${N8N_BACKEND_URL}/api/auth/credentials/${userId}/${platform}`
}

function patchCredentialUrlsInWorkflow(workflow, userId) {
  let patched = false

  for (const node of workflow?.nodes || []) {
    const url = node.parameters?.url
    if (
      typeof url !== 'string' ||
      !url.includes('/api/auth/credentials/') ||
      (!url.includes('localhost') && !url.includes('127.0.0.1'))
    ) {
      continue
    }

    const match = url.match(/\/api\/auth\/credentials\/[^/]+\/([^/?]+)/)
    const platform = match?.[1] || 'slack'
    node.parameters.url = credentialsUrl(userId, platform)
    patched = true
    console.log('Patched credential URL in node:', node.name, '→', node.parameters.url)
  }

  return patched
}

async function ensureWorkflowCredentialUrls(userId, n8nWorkflowId) {
  if (!n8nWorkflowId) return false

  const { getWorkflow, updateWorkflow } = require('./n8n')

  try {
    const n8nWorkflow = await getWorkflow(n8nWorkflowId)
    if (!patchCredentialUrlsInWorkflow(n8nWorkflow, userId)) {
      return false
    }

    await updateWorkflow(n8nWorkflowId, n8nWorkflow)
    console.log('Patched localhost credential URLs in workflow:', n8nWorkflowId)
    return true
  } catch (err) {
    console.error('ensureWorkflowCredentialUrls failed:', err.message)
    return false
  }
}

function createTestWebhookPath(userId) {
  return `flowchat-test-${userId}-${Date.now()}`
}

function testWebhookNode(testWebhookPath) {
  return {
    id: 'test-webhook',
    name: 'Test Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    position: [250, 500],
    parameters: {
      path: testWebhookPath,
      httpMethod: 'GET',
      responseMode: 'onReceived',
      responseData: 'firstEntryJson',
    },
  }
}

function fetchCredentialsNode(id, name, userId, platform, position) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 3,
    position,
    parameters: {
      method: 'GET',
      url: credentialsUrl(userId, platform),
      authentication: 'none',
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'x-api-key', value: INTERNAL_API_KEY }],
      },
      options: {},
    },
  }
}

function notifySuccessNode(userId, lastNodePosition, lastActionNodeName) {
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  let jsonBody
  if (lastActionNodeName === 'Send Slack Message') {
    jsonBody = `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "slack_message", channel: $("Send Slack Message").item.json.channel, message: $("Send Slack Message").item.json.text } }) }}`
  } else if (lastActionNodeName === 'Send Gmail') {
    jsonBody = `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "gmail", to: $("Send Gmail").item.json.to, subject: $("Send Gmail").item.json.subject } }) }}`
  } else {
    jsonBody = `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode }) }}`
  }

  return {
    id: 'notify-success',
    name: 'Notify Flowchat',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [lastNodePosition[0] + 250, lastNodePosition[1]],
    parameters: {
      method: 'POST',
      url: `${backendUrl}/api/executions/log`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'x-api-key',
            value: process.env.INTERNAL_API_KEY || 'flowchat_internal_2026',
          },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody,
      options: {},
    },
  }
}

function wireNotifySuccess(nodes, connections, lastActionNodeName, userId) {
  const lastActionNode = nodes.find((n) => n.name === lastActionNodeName)
  if (!lastActionNode) return

  const notifyNode = notifySuccessNode(userId, lastActionNode.position, lastActionNodeName)
  nodes.push(notifyNode)

  const respondNode = nodes.find((n) => n.name === 'Respond to Webhook')
  if (respondNode) {
    respondNode.position = [notifyNode.position[0] + 250, notifyNode.position[1]]
  }

  const nextNode =
    connections[lastActionNodeName]?.main?.[0]?.[0]?.node || 'Respond to Webhook'
  connections[lastActionNodeName] = {
    main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
  }
  connections['Notify Flowchat'] = {
    main: [[{ node: nextNode, type: 'main', index: 0 }]],
  }
}

function buildScheduleSlackWorkflow(userId, details) {
  const testWebhookPath = createTestWebhookPath(userId)
  const channel = details.channel || details.slack_channel || '#general'
  const message = details.message || details.reminder_message || details.message_text || 'Reminder from Flowchat'

  const nodes = [
    {
      id: 'schedule-trigger',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [256, 304],
      parameters: {
        rule: {
          interval: [{ field: 'cronExpression', expression: details.cron_expression || '0 16 * * 5' }]
        }
      }
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 512],
      webhookId: testWebhookPath,
      parameters: {
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {}
      }
    },
    {
      id: 'fetch-slack-creds',
      name: 'Fetch Slack Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [512, 304],
      parameters: {
        url: credentialsUrl(userId, 'slack'),
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }]
        },
        options: {}
      }
    },
    {
      id: 'send-slack-message',
      name: 'Send Slack Message',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [752, 304],
      parameters: {
        method: 'POST',
        url: 'https://slack.com/api/chat.postMessage',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: '=Bearer {{ $json.access_token }}' },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: JSON.stringify({ channel, text: message }),
        options: {}
      }
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1008, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {}
      }
    }
  ]

  const connections = {
    'Schedule Trigger': { main: [[{ node: 'Fetch Slack Credentials', type: 'main', index: 0 }]] },
    'Test Webhook': { main: [[{ node: 'Fetch Slack Credentials', type: 'main', index: 0 }]] },
    'Fetch Slack Credentials': { main: [[{ node: 'Send Slack Message', type: 'main', index: 0 }]] },
    'Send Slack Message': { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] }
  }

  wireNotifySuccess(nodes, connections, 'Send Slack Message', userId)

  return { humanName: 'Schedule → Slack', nodes, connections, testWebhookPath }
}

function buildTypeformSheetsWorkflow(userId, details) {
  const sheetId = details.sheet_id || details.sheetId || details.spreadsheet_id
  const sheetTab = details.sheet_tab || details.sheetTab || details.sheet_name?.replace(/\s*\(ID:\s*[^)]+\)\s*$/, '').trim() || 'Sheet1'
  const webhookPath = `flowchat-typeform-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 304],
      parameters: {
        path: webhookPath,
        responseMode: 'responseNode',
        options: {}
      }
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 512],
      parameters: {
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {}
      }
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [512, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/google`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }]
        },
        options: {}
      }
    },
    {
      id: 'append-to-sheets',
      name: 'Append to Google Sheets',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [752, 304],
      parameters: {
        method: 'POST',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetTab)}!A1:append?valueInputOption=USER_ENTERED`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{
            name: 'Authorization',
            value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}'
          }]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={"values":[["={{ $("Typeform Trigger").item.json.submitter_name }}","={{ $("Typeform Trigger").item.json.submitter_email }}","={{ $("Typeform Trigger").item.json.submitted_at }}"]]}',
        options: {}
      }
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1002, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "typeform_to_sheets", submitted_at: $("Typeform Trigger").item.json.submitted_at } }) }}`,
        options: {}
      }
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1252, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {}
      }
    }
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]]
    },
    'Test Webhook': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]]
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Append to Google Sheets', type: 'main', index: 0 }]]
    },
    'Append to Google Sheets': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]]
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
    }
  }

  return {
    humanName: 'Typeform → Google Sheet',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildScheduleGmailWorkflow(userId, details) {
  console.log('buildScheduleGmailWorkflow details:', JSON.stringify(details))

  const testWebhookPath = createTestWebhookPath(userId)
  const toEmail = details.to_email || details.to || details.email || 'user@example.com'
  const subject = details.subject || 'Automated message'
  const messageText = details.message_text || details.message || details.body || 'Automated message from Flowchat'
  const cronExpression = details.cron_expression || '0 9 * * 1'

  // Pre-encode email at build time — no n8n expressions needed
  const rawEmail = Buffer.from(
    `To: ${toEmail}\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${messageText}`
  ).toString('base64url')

  const nodes = [
    {
      id: 'schedule-trigger',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [256, 304],
      parameters: {
        rule: {
          interval: [{ field: 'cronExpression', expression: cronExpression }]
        }
      }
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 512],
      webhookId: testWebhookPath,
      parameters: {
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {}
      }
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [512, 304],
      parameters: {
        url: credentialsUrl(userId, 'google'),
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }]
        },
        options: {}
      }
    },
    {
      id: 'send-gmail',
      name: 'Send Gmail',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [752, 304],
      parameters: {
        method: 'POST',
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: '=Bearer {{ $json.access_token }}' }
          ]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: JSON.stringify({ raw: rawEmail }),
        options: {}
      }
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1008, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {}
      }
    }
  ]

  const connections = {
    'Schedule Trigger': { main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]] },
    'Test Webhook': { main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]] },
    'Fetch Google Credentials': { main: [[{ node: 'Send Gmail', type: 'main', index: 0 }]] },
    'Send Gmail': { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] }
  }

  wireNotifySuccess(nodes, connections, 'Send Gmail', userId)

  return { humanName: 'Schedule → Gmail', nodes, connections, testWebhookPath }
}

async function buildWorkflow(userId, userEmail, spec) {
  const {
    trigger_app,
    trigger_event,
    action_app,
    action_event,
    details = {},
  } = spec

  const triggerApp = trigger_app?.toLowerCase().replace(/\s+/g, '_')
  const actionApp = action_app?.toLowerCase().replace(/\s+/g, '_')
  const actionEvent = normalizeActionEvent(action_event)

  console.log('Template check:', triggerApp, actionApp, actionEvent)

  const isTypeformToSheets =
    triggerApp === 'typeform' &&
    (actionApp === 'google_sheets' || actionApp === 'sheets' || action_app?.toLowerCase() === 'google sheets')

  const hasTemplate =
    (triggerApp === 'schedule' &&
      actionApp === 'slack' &&
      actionEvent === 'send_message') ||
    isTypeformToSheets ||
    (triggerApp === 'schedule' &&
      actionApp === 'gmail' &&
      actionEvent === 'send_email')

  if (hasTemplate) {
    console.log('Using hardcoded template for:', triggerApp, '→', actionApp)
    let workflow

    if (triggerApp === 'schedule' && actionApp === 'slack') {
      workflow = buildScheduleSlackWorkflow(userId, details)
    } else if (isTypeformToSheets) {
      workflow = buildTypeformSheetsWorkflow(userId, details)
    } else if (triggerApp === 'schedule' && actionApp === 'gmail') {
      workflow = buildScheduleGmailWorkflow(userId, details)
    }

    return {
      workflow: {
        name: `${userEmail} — ${workflow.humanName}`,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: {
          executionOrder: 'v1',
          errorWorkflow: 'QhkpkeGqlspl7xXY',
        },
      },
      testWebhookPath: workflow.testWebhookPath,
    }
  }

  console.log(
    'No template found for:',
    trigger_app,
    '→',
    action_app,
    '— using Builder Agent'
  )
  const { buildWorkflowWithAI } = require('./builderAgent')
  return await buildWorkflowWithAI(userId, userEmail, spec)
}

function getWebhookUrl(workflow) {
  const nodes = workflow?.nodes || []
  const webhookNode =
    nodes.find((node) => node.name === 'Test Webhook') ||
    nodes.find(
      (node) =>
        node.type === 'n8n-nodes-base.webhook' ||
        node.name === 'Typeform Trigger'
    )

  if (!webhookNode) return null

  const webhookPath = webhookNode.parameters?.path
  if (!webhookPath) return null

  const baseUrl = (process.env.N8N_BASE_URL || '').replace(/\/$/, '')
  if (!baseUrl) return null

  return `${baseUrl}/webhook/${webhookPath}`
}

module.exports = {
  buildWorkflow,
  getWebhookUrl,
  patchCredentialUrlsInWorkflow,
  ensureWorkflowCredentialUrls,
  N8N_BACKEND_URL,
}
