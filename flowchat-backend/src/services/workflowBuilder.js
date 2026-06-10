const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3456'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ''

function credentialsUrl(userId, platform) {
  return `${BACKEND_URL}/api/auth/credentials/${userId}/${platform}`
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

function buildScheduleSlackWorkflow(userId, details) {
  const nodes = [
    {
      id: 'schedule-trigger',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        rule: {
          interval: [
            {
              field: 'cronExpression',
              expression: details.cron_expression || '0 9 * * 1',
            },
          ],
        },
      },
    },
    fetchCredentialsNode(
      'fetch-slack-creds',
      'Fetch Slack Credentials',
      userId,
      'slack',
      [500, 300]
    ),
    {
      id: 'send-slack-message',
      name: 'Send Slack Message',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 3,
      position: [750, 300],
      parameters: {
        method: 'POST',
        url: 'https://slack.com/api/chat.postMessage',
        authentication: 'none',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $json.access_token }}',
            },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        bodyParameters: {
          parameters: [
            { name: 'channel', value: details.slack_channel || '#general' },
            {
              name: 'text',
              value: details.message_text || 'Automation triggered',
            },
          ],
        },
        options: {},
      },
    },
  ]

  const connections = {
    'Schedule Trigger': {
      main: [[{ node: 'Fetch Slack Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Slack Credentials': {
      main: [[{ node: 'Send Slack Message', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Schedule → Slack',
    nodes,
    connections,
  }
}

function buildTypeformSheetsWorkflow(userId, details) {
  const webhookPath = `flowchat-${userId}-${Date.now()}`

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        path: webhookPath,
        responseMode: 'onReceived',
        responseData: 'firstEntryJson',
      },
    },
    fetchCredentialsNode(
      'fetch-google-creds',
      'Fetch Google Credentials',
      userId,
      'google',
      [500, 300]
    ),
    {
      id: 'append-to-sheets',
      name: 'Append to Google Sheets',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 3,
      position: [750, 300],
      parameters: {
        method: 'POST',
        url: `https://sheets.googleapis.com/v4/spreadsheets/{{ $json.sheet_id }}/values/${encodeURIComponent(details.sheet_name || 'Sheet1')}:append?valueInputOption=USER_ENTERED`,
        authentication: 'none',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $json.access_token }}',
            },
          ],
        },
        sendBody: true,
        contentType: 'json',
        body: {
          values: [
            [
              "={{ $('Typeform Trigger').item.json.form_response.answers[0].text }}",
              '={{ new Date().toISOString() }}',
            ],
          ],
        },
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Append to Google Sheets', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Google Sheet',
    nodes,
    connections,
    webhookPath,
  }
}

function buildScheduleGmailWorkflow(userId, details) {
  const toEmail = details.to_email || 'user@example.com'
  const subject = details.subject || 'Automated message'
  const messageText =
    details.message_text || 'This is an automated message from Flowchat'

  const nodes = [
    {
      id: 'schedule-trigger',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        rule: {
          interval: [
            {
              field: 'cronExpression',
              expression: details.cron_expression || '0 9 * * 1',
            },
          ],
        },
      },
    },
    fetchCredentialsNode(
      'fetch-google-creds',
      'Fetch Google Credentials',
      userId,
      'google',
      [500, 300]
    ),
    {
      id: 'send-gmail',
      name: 'Send Gmail',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 3,
      position: [750, 300],
      parameters: {
        method: 'POST',
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        authentication: 'none',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $json.access_token }}',
            },
          ],
        },
        sendBody: true,
        contentType: 'json',
        bodyParameters: {
          parameters: [
            {
              name: 'raw',
              value: `={{ Buffer.from('To: ${toEmail}\\r\\nSubject: ${subject}\\r\\nContent-Type: text/plain\\r\\n\\r\\n${messageText}').toString('base64url') }}`,
            },
          ],
        },
        options: {},
      },
    },
  ]

  const connections = {
    'Schedule Trigger': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Send Gmail', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Schedule → Gmail',
    nodes,
    connections,
  }
}

function buildWorkflow(userId, userEmail, spec) {
  const {
    trigger_app,
    trigger_event,
    action_app,
    action_event,
    details = {},
  } = spec

  let workflow

  if (
    trigger_app === 'schedule' &&
    action_app === 'slack' &&
    action_event === 'send_message'
  ) {
    workflow = buildScheduleSlackWorkflow(userId, details)
  } else if (
    trigger_app === 'typeform' &&
    action_app === 'google_sheets' &&
    action_event === 'append_row'
  ) {
    workflow = buildTypeformSheetsWorkflow(userId, details)
  } else if (
    trigger_app === 'schedule' &&
    action_app === 'gmail' &&
    action_event === 'send_email'
  ) {
    workflow = buildScheduleGmailWorkflow(userId, details)
  } else {
    throw new Error(
      `Unsupported automation: ${trigger_app}/${trigger_event} → ${action_app}/${action_event}`
    )
  }

  return {
    name: `${userEmail} — ${workflow.humanName}`,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: 'v1' },
  }
}

function getWebhookUrl(workflow) {
  const nodes = workflow?.nodes || []
  const webhookNode = nodes.find(
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
}
