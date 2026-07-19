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
    createevent: 'create_event',
    createcontact: 'create_contact',
    createfolder: 'create_folder',
    createdocument: 'create_document',
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
  const sheetTab = details.sheet_tab || details.sheetTab || 'Sheet1'
  const webhookPath = `flowchat-typeform-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
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
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {}
      }
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [512, 304],
      parameters: {
        jsCode: `
// Get data from whichever trigger fired
const body = $input.first().json.body || $input.first().json;

// Extract column values — use column_values if present,
// otherwise fall back to basic fields
let columnValues = body.column_values || [];
let columnHeaders = body.column_headers || [];

if (columnValues.length === 0) {
  columnValues = [
    body.submitter_name || '',
    body.submitter_email || '',
    body.submitted_at || ''
  ];
  columnHeaders = ['Name', 'Email', 'Submitted At'];
}

return [{
  json: {
    submitted_at: body.submitted_at || new Date().toISOString(),
    column_values: columnValues,
    column_headers: columnHeaders,
    row: columnValues
  }
}];
`
      }
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
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
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetTab}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{
            name: 'Authorization',
            value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}'
          }]
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({\"values\": [$('Set Submission Data').item.json.row]}) }}",
        options: {}
      }
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ 
  userId: "${userId}", 
  n8nWorkflowId: $workflow.id, 
  status: "success", 
  mode: $execution.mode, 
  details: { 
    type: "typeform_to_sheets", 
    submitted_at: $("Set Submission Data").item.json.submitted_at,
    columns: $("Set Submission Data").item.json.column_values.length
  } 
}) }}`,
        options: {}
      }
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {}
      }
    }
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]]
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]]
    },
    'Set Submission Data': {
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

function buildTypeformCalendarWorkflow(userId, details) {
  const calendarId = details.calendar_id || details.calendarId || 'primary'
  const durationMinutes = Number(details.duration_minutes || details.durationMinutes || 60)
  const timezone = details.timezone || 'UTC'
  const titleTemplate =
    details.event_title_template ||
    details.eventTitleTemplate ||
    'New submission from {{name}}'
  const inviteSubmitter =
    details.invite_submitter === true || details.inviteSubmitter === true
  const webhookPath = `flowchat-typeform-calendar-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [512, 304],
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const name = body.submitter_name || '';
const email = body.submitter_email || '';
const phone = (() => {
  const headers = body.column_headers || [];
  const values = body.column_values || [];
  const idx = headers.findIndex((h) => /phone/i.test(String(h || '')));
  return idx >= 0 ? (values[idx] || '') : '';
})();
const submittedAt = body.submitted_at || new Date().toISOString();
const start = new Date(submittedAt);
const end = new Date(start.getTime() + ${durationMinutes} * 60 * 1000);

let summary = ${JSON.stringify(titleTemplate)};
summary = summary
  .replace(/\\{\\{name\\}\\}/gi, name || 'Unknown')
  .replace(/\\{\\{email\\}\\}/gi, email || '');

const descriptionParts = [];
if (email) descriptionParts.push('Email: ' + email);
if (phone) descriptionParts.push('Phone: ' + phone);

return [{
  json: {
    submitted_at: submittedAt,
    submitter_name: name,
    submitter_email: email,
    submitter_phone: phone,
    summary,
    description: descriptionParts.join('\\n'),
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    timezone: ${JSON.stringify(timezone)},
    invite_email: ${inviteSubmitter ? 'email' : "''"},
  }
}];
`,
      },
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/google`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-calendar-event',
      name: 'Create Calendar Event',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}',
            },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  summary: $("Set Submission Data").item.json.summary,
  description: $("Set Submission Data").item.json.description,
  start: {
    dateTime: $("Set Submission Data").item.json.startDateTime,
    timeZone: $("Set Submission Data").item.json.timezone
  },
  end: {
    dateTime: $("Set Submission Data").item.json.endDateTime,
    timeZone: $("Set Submission Data").item.json.timezone
  },
  attendees: $("Set Submission Data").item.json.invite_email
    ? [{ email: $("Set Submission Data").item.json.invite_email }]
    : []
}) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  userId: "${userId}",
  n8nWorkflowId: $workflow.id,
  status: "success",
  mode: $execution.mode,
  details: {
    type: "typeform_to_calendar",
    calendar_id: ${JSON.stringify(calendarId)},
    summary: $("Set Submission Data").item.json.summary,
    submitted_at: $("Set Submission Data").item.json.submitted_at
  }
}) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Set Submission Data': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Create Calendar Event', type: 'main', index: 0 }]],
    },
    'Create Calendar Event': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Google Calendar',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildTypeformContactsWorkflow(userId, details) {
  const webhookPath = `flowchat-typeform-contacts-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [512, 304],
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const name = body.submitter_name || '';
const email = body.submitter_email || '';
const phone = (() => {
  const headers = body.column_headers || [];
  const values = body.column_values || [];
  const idx = headers.findIndex((h) => /phone/i.test(String(h || '')));
  return idx >= 0 ? (values[idx] || '') : '';
})();
const company = (() => {
  const headers = body.column_headers || [];
  const values = body.column_values || [];
  const idx = headers.findIndex((h) => /company|organization|business/i.test(String(h || '')));
  return idx >= 0 ? (values[idx] || '') : '';
})();

const parts = String(name || '').trim().split(/\\s+/).filter(Boolean);
const givenName = parts[0] || name || 'Unknown';
const familyName = parts.slice(1).join(' ') || '';

return [{
  json: {
    submitted_at: body.submitted_at || new Date().toISOString(),
    submitter_name: name,
    submitter_email: email,
    submitter_phone: phone,
    company,
    givenName,
    familyName,
  }
}];
`,
      },
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/google`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-contact',
      name: 'Create Google Contact',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: 'https://people.googleapis.com/v1/people:createContact',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}',
            },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  names: [{
    givenName: $("Set Submission Data").item.json.givenName,
    familyName: $("Set Submission Data").item.json.familyName
  }],
  emailAddresses: $("Set Submission Data").item.json.submitter_email
    ? [{ value: $("Set Submission Data").item.json.submitter_email }]
    : [],
  phoneNumbers: $("Set Submission Data").item.json.submitter_phone
    ? [{ value: $("Set Submission Data").item.json.submitter_phone }]
    : [],
  organizations: $("Set Submission Data").item.json.company
    ? [{ name: $("Set Submission Data").item.json.company }]
    : []
}) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  userId: "${userId}",
  n8nWorkflowId: $workflow.id,
  status: "success",
  mode: $execution.mode,
  details: {
    type: "typeform_to_contacts",
    name: $("Set Submission Data").item.json.submitter_name,
    email: $("Set Submission Data").item.json.submitter_email
  }
}) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Set Submission Data': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Create Google Contact', type: 'main', index: 0 }]],
    },
    'Create Google Contact': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Google Contacts',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildTypeformDriveFolderWorkflow(userId, details) {
  const nameTemplate =
    details.name_template ||
    details.nameTemplate ||
    details.folder_name ||
    'Submission from {{submitter_name}}'
  const parentFolderId =
    details.parent_folder_id || details.parentFolderId || null
  const webhookPath = `flowchat-typeform-drive-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [512, 304],
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const name = body.submitter_name || '';
const email = body.submitter_email || '';

let folderName = ${JSON.stringify(nameTemplate)};
folderName = folderName
  .replace(/\\{\\{submitter_name\\}\\}/gi, name || 'Unknown')
  .replace(/\\{\\{name\\}\\}/gi, name || 'Unknown')
  .replace(/\\{\\{email\\}\\}/gi, email || '')
  .replace(/\\{\\{submitted_at\\}\\}/gi, body.submitted_at || new Date().toISOString());

return [{
  json: {
    submitted_at: body.submitted_at || new Date().toISOString(),
    submitter_name: name,
    submitter_email: email,
    folder_name: folderName,
  }
}];
`,
      },
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/google`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-drive-folder',
      name: 'Create Drive Folder',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: 'https://www.googleapis.com/drive/v3/files',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}',
            },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: parentFolderId
          ? `={{ JSON.stringify({
  name: $("Set Submission Data").item.json.folder_name,
  mimeType: "application/vnd.google-apps.folder",
  parents: [${JSON.stringify(parentFolderId)}]
}) }}`
          : `={{ JSON.stringify({
  name: $("Set Submission Data").item.json.folder_name,
  mimeType: "application/vnd.google-apps.folder"
}) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  userId: "${userId}",
  n8nWorkflowId: $workflow.id,
  status: "success",
  mode: $execution.mode,
  details: {
    type: "typeform_to_drive_folder",
    folder_name: $("Set Submission Data").item.json.folder_name,
    submitted_at: $("Set Submission Data").item.json.submitted_at
  }
}) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Set Submission Data': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Create Drive Folder', type: 'main', index: 0 }]],
    },
    'Create Drive Folder': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Google Drive',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildTypeformDocsWorkflow(userId, details) {
  const docTitle =
    details.doc_title ||
    details.docTitle ||
    details.name_template ||
    details.nameTemplate ||
    'New Document'
  const webhookPath = `flowchat-typeform-docs-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')
  const safeDocTitle = String(docTitle).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [512, 304],
      parameters: {
        values: {
          string: [
            {
              name: 'submitter_name',
              value:
                '={{ $json.body?.submitter_name || $json.submitter_name || "" }}',
            },
            {
              name: 'submitter_email',
              value:
                '={{ $json.body?.submitter_email || $json.submitter_email || "" }}',
            },
            {
              name: 'submitted_at',
              value:
                '={{ $json.body?.submitted_at || $json.submitted_at || new Date().toISOString() }}',
            },
          ],
        },
        options: {},
      },
    },
    {
      id: 'fetch-google-creds',
      name: 'Fetch Google Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/google`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-doc',
      name: 'Create Google Doc',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value:
                "=Bearer {{ $('Fetch Google Credentials').item.json.access_token }}",
            },
            {
              name: 'Content-Type',
              value: 'multipart/related; boundary=flowchat_boundary',
            },
          ],
        },
        sendBody: true,
        specifyBody: 'string',
        body: `=--flowchat_boundary\r\nContent-Type: application/json\r\n\r\n{"name":"${safeDocTitle} - {{ $('Set Submission Data').item.json.submitter_name }}","mimeType":"application/vnd.google-apps.document"}\r\n--flowchat_boundary\r\nContent-Type: text/html\r\n\r\n<h1>${safeDocTitle}</h1><p>Submitted by: {{ $('Set Submission Data').item.json.submitter_name }}</p><p>Email: {{ $('Set Submission Data').item.json.submitter_email }}</p><p>Date: {{ $('Set Submission Data').item.json.submitted_at }}</p>\r\n--flowchat_boundary--`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "typeform_to_google_docs", doc_title: ${JSON.stringify(docTitle)} } }) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Set Submission Data': {
      main: [[{ node: 'Fetch Google Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Google Credentials': {
      main: [[{ node: 'Create Google Doc', type: 'main', index: 0 }]],
    },
    'Create Google Doc': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Google Docs',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildNotionFormatAnswersCode() {
  return `
const body = $input.first().json.body || $input.first().json;

let columnValues = body.column_values || [];
let columnHeaders = body.column_headers || [];

if (columnValues.length === 0 && body.columns && Array.isArray(body.columns)) {
  columnHeaders = body.columns.map((c) => c.title || c.name || '');
  columnValues = body.columns.map((c) => c.value ?? '');
}

if (columnValues.length === 0) {
  const skip = new Set(['column_values', 'column_headers', 'columns', 'all_answers', 'body']);
  const entries = Object.entries(body).filter(([k, v]) => !skip.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'));
  columnHeaders = entries.map(([k]) => k);
  columnValues = entries.map(([, v]) => String(v ?? ''));
}

const trigger_data = {};
columnHeaders.forEach((header, i) => {
  if (header) trigger_data[header] = columnValues[i] ?? '';
});
columnValues.forEach((value, i) => {
  trigger_data['answer_' + i] = value ?? '';
});
if (body.submitter_name) trigger_data.submitter_name = body.submitter_name;
if (body.submitter_email) trigger_data.submitter_email = body.submitter_email;
if (body.submitted_at) trigger_data.submitted_at = body.submitted_at;

return [{
  json: {
    submitted_at: body.submitted_at || new Date().toISOString(),
    column_values: columnValues,
    column_headers: columnHeaders,
    trigger_data,
  }
}];
`
}

function buildTriggerNotionWorkflow(userId, details, options = {}) {
  const {
    triggerName = 'Typeform Trigger',
    humanName = 'Typeform → Notion',
    pathPrefix = 'flowchat-typeform-notion',
    notifyType = 'typeform_to_notion',
  } = options

  const databaseId = details.database_id || details.databaseId
  const fieldMapping = details.field_mapping || details.fieldMapping || []
  const webhookPath = `${pathPrefix}-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')
  const fieldMappingJson = JSON.stringify(fieldMapping)

  const nodes = [
    {
      id: 'main-trigger',
      name: triggerName,
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'format-answers',
      name: 'Format Answers',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [512, 304],
      parameters: {
        jsCode: buildNotionFormatAnswersCode(),
      },
    },
    {
      id: 'fetch-notion-creds',
      name: 'Fetch Notion Token',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/notion`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-notion-row',
      name: 'Create Notion Row',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/actions/notion/${userId}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ database_id: ${JSON.stringify(databaseId || '')}, field_mapping: ${fieldMappingJson}, trigger_data: $("Format Answers").item.json.trigger_data }) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  userId: "${userId}",
  n8nWorkflowId: $workflow.id,
  status: "success",
  mode: $execution.mode,
  details: {
    type: "${notifyType}",
    page_id: $("Create Notion Row").item.json.page_id,
    submitted_at: $("Format Answers").item.json.submitted_at,
    columns: $("Format Answers").item.json.column_values.length
  }
}) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    [triggerName]: {
      main: [[{ node: 'Format Answers', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Format Answers', type: 'main', index: 0 }]],
    },
    'Format Answers': {
      main: [[{ node: 'Fetch Notion Token', type: 'main', index: 0 }]],
    },
    'Fetch Notion Token': {
      main: [[{ node: 'Create Notion Row', type: 'main', index: 0 }]],
    },
    'Create Notion Row': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName,
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildTypeformNotionWorkflow(userId, details) {
  const databaseId = details.database_id || details.databaseId
  const rawMapping = details.field_mapping || details.fieldMapping || []
  const fieldMapping = rawMapping.map((f, i) => {
    const rawId = f.typeform_id || f.id || f.sourceField || `idx_${i}`
    return {
      typeform_id: String(rawId).replace(/[^a-zA-Z0-9_]/g, '_'),
      notion_field: f.notion_field || f.notionColumn || f.name,
      notion_type: f.notion_type || f.notionType || 'rich_text',
    }
  }).filter((f) => f.notion_field)

  const webhookPath = `flowchat-typeform-${userId}-${Date.now()}`
  const testWebhookPath = `flowchat-test-${userId}-${Date.now() + 1}`
  const backendUrl = (process.env.BACKEND_URL || N8N_BACKEND_URL).replace(/\/$/, '')

  const assignments = fieldMapping.map((f, i) => ({
    id: `field-${f.typeform_id}`,
    name: `field_${f.typeform_id}`,
    value: `={{ $json.body?.column_values?.[${i}] || $json.column_values?.[${i}] || '' }}`,
    type: 'string',
  }))

  assignments.unshift({
    id: 'submitted-at',
    name: 'submitted_at',
    value: '={{ $json.body?.submitted_at || $json.submitted_at || new Date().toISOString() }}',
    type: 'string',
  })

  const notionPropertiesJs = fieldMapping.map((f) => {
    const fieldRef = `$('Set Submission Data').item.json.field_${f.typeform_id}`
    const key = JSON.stringify(f.notion_field)
    if (f.notion_type === 'title') {
      return `${key}: { title: [{ text: { content: String(${fieldRef} || '') } }] }`
    }
    return `${key}: { rich_text: [{ text: { content: String(${fieldRef} || '') } }] }`
  }).join(',\n')

  const nodes = [
    {
      id: 'typeform-trigger',
      name: 'Typeform Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 200],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [256, 400],
      parameters: {
        httpMethod: 'POST',
        path: testWebhookPath,
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'set-data',
      name: 'Set Submission Data',
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [512, 304],
      parameters: {
        values: {
          string: assignments.map((a) => ({
            name: a.name,
            value: a.value,
          })),
        },
        options: {},
      },
    },
    {
      id: 'fetch-notion-creds',
      name: 'Fetch Notion Credentials',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [768, 304],
      parameters: {
        url: `${backendUrl}/api/auth/credentials/${userId}/notion`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        options: {},
      },
    },
    {
      id: 'create-notion-page',
      name: 'Create Notion Page',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1024, 304],
      parameters: {
        method: 'POST',
        url: 'https://api.notion.com/v1/pages',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: "=Bearer {{ $('Fetch Notion Credentials').item.json.access_token }}",
            },
            { name: 'Notion-Version', value: '2022-06-28' },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'string',
        body: `={{ JSON.stringify({ parent: { database_id: "${databaseId}" }, properties: { ${notionPropertiesJs} } }) }}`,
        options: {},
      },
    },
    {
      id: 'notify-success',
      name: 'Notify Flowchat',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 304],
      parameters: {
        method: 'POST',
        url: `${backendUrl}/api/executions/log`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'x-api-key', value: getInternalApiKey() }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ userId: "${userId}", n8nWorkflowId: $workflow.id, status: "success", mode: $execution.mode, details: { type: "typeform_to_notion", database_id: "${databaseId}", submitted_at: $("Set Submission Data").item.json.submitted_at } }) }}`,
        options: {},
      },
    },
    {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1536, 304],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ success: true }) }}',
        options: {},
      },
    },
  ]

  const connections = {
    'Typeform Trigger': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Test Webhook': {
      main: [[{ node: 'Set Submission Data', type: 'main', index: 0 }]],
    },
    'Set Submission Data': {
      main: [[{ node: 'Fetch Notion Credentials', type: 'main', index: 0 }]],
    },
    'Fetch Notion Credentials': {
      main: [[{ node: 'Create Notion Page', type: 'main', index: 0 }]],
    },
    'Create Notion Page': {
      main: [[{ node: 'Notify Flowchat', type: 'main', index: 0 }]],
    },
    'Notify Flowchat': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  }

  return {
    humanName: 'Typeform → Notion',
    nodes,
    connections,
    webhookPath,
    testWebhookPath,
  }
}

function buildAnyTriggerNotionWorkflow(userId, details) {
  return buildTriggerNotionWorkflow(userId, details, {
    triggerName: 'Webhook Trigger',
    humanName: 'Any Trigger → Notion',
    pathPrefix: 'flowchat-any-notion',
    notifyType: 'any_trigger_to_notion',
  })
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

  const isTypeformToCalendar =
    triggerApp === 'typeform' &&
    (actionApp === 'google_calendar' ||
      actionApp === 'calendar' ||
      action_app?.toLowerCase() === 'google calendar') &&
    (!actionEvent || actionEvent === 'create_event')

  const isTypeformToContacts =
    triggerApp === 'typeform' &&
    (actionApp === 'google_contacts' || actionApp === 'contacts') &&
    (!actionEvent || actionEvent === 'create_contact')

  const isTypeformToDriveFolder =
    triggerApp === 'typeform' &&
    (actionApp === 'google_drive' || actionApp === 'drive') &&
    (actionEvent === 'create_folder' || !actionEvent)

  const isTypeformToDocs =
    triggerApp === 'typeform' &&
    (actionApp === 'google_docs' ||
      actionApp === 'google_drive_docs' ||
      action_app?.toLowerCase() === 'google docs' ||
      (actionApp === 'google_drive' && actionEvent === 'create_document'))

  const isTypeformToNotion =
    triggerApp === 'typeform' &&
    actionApp === 'notion' &&
    (!actionEvent || actionEvent === 'create_row')

  const isAnyTriggerToNotion =
    (triggerApp === 'any_trigger' || triggerApp === 'webhook' || triggerApp === 'any') &&
    actionApp === 'notion' &&
    (!actionEvent || actionEvent === 'create_row')

  const hasTemplate =
    (triggerApp === 'schedule' &&
      actionApp === 'slack' &&
      actionEvent === 'send_message') ||
    isTypeformToSheets ||
    isTypeformToCalendar ||
    isTypeformToContacts ||
    isTypeformToDriveFolder ||
    isTypeformToDocs ||
    isTypeformToNotion ||
    isAnyTriggerToNotion ||
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
    } else if (isTypeformToCalendar) {
      workflow = buildTypeformCalendarWorkflow(userId, details)
    } else if (isTypeformToContacts) {
      workflow = buildTypeformContactsWorkflow(userId, details)
    } else if (isTypeformToDocs) {
      workflow = buildTypeformDocsWorkflow(userId, details)
    } else if (isTypeformToDriveFolder) {
      workflow = buildTypeformDriveFolderWorkflow(userId, details)
    } else if (isTypeformToNotion) {
      workflow = buildTypeformNotionWorkflow(userId, details)
    } else if (isAnyTriggerToNotion) {
      workflow = buildAnyTriggerNotionWorkflow(userId, details)
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
