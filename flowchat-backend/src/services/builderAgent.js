'use strict'

const Anthropic = require('@anthropic-ai/sdk')
const { getMetadataForAgent } = require('./integrations')
const triggerSchemas = require('../data/trigger-schemas')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const N8N_BACKEND_URL = 'https://flowchat-production-376f.up.railway.app'
const N8N_BASE_URL = (process.env.N8N_BASE_URL || '').replace(/\/$/, '')

const BUILDER_SYSTEM_PROMPT = `You are an expert n8n workflow builder for Flowchat.

Your job is to generate valid n8n workflow JSON based on an automation specification.

## Architecture rules

Every workflow you generate MUST follow this pattern:

1. TRIGGER NODE — what starts the workflow
   - Schedule: use n8n-nodes-base.scheduleTrigger, typeVersion: 1.2
   - Webhook (Typeform, Stripe, Calendly): use n8n-nodes-base.webhook, typeVersion: 2
     - responseMode: "responseNode"
     - webhookId: same as path value

2. TEST WEBHOOK NODE — always include alongside the main trigger
   - type: n8n-nodes-base.webhook, typeVersion: 2
   - name: "Test Webhook"
   - webhookId: same as path value
   - responseMode: "responseNode"
   - Both the main trigger AND Test Webhook connect to the next node

3. CREDENTIAL FETCH NODE(S) — one per external app used
   - type: n8n-nodes-base.httpRequest, typeVersion: 4.2
   - Makes GET request to: CREDENTIALS_BASE_URL/userId/platform
   - Sends header: x-api-key: INTERNAL_API_KEY
   - The response contains access_token

4. ACTION NODE(S) — what the workflow does
   - type: n8n-nodes-base.httpRequest, typeVersion: 4.2
   - Uses the access_token from the credential fetch node
   - Authorization header value MUST be: =Bearer {{ $json.access_token }}
   - For POST requests with JSON bodies use:
     sendBody: true, specifyBody: "json", jsonBody: JSON.stringify({ ... })
   - Do NOT use contentType, bodyParameters, or body — always use specifyBody + jsonBody

5. RESPOND TO WEBHOOK — always required after the last action node
   - type: n8n-nodes-base.respondToWebhook, typeVersion: 1.1
   - name: "Respond to Webhook"
   - respondWith: "json"
   - responseBody: "={{ JSON.stringify({ success: true }) }}"
   - Connect the last action node to Respond to Webhook

## Node positioning
- Trigger nodes: position [256, 304]
- Test webhook: position [256, 512]
- First credential fetch: position [512, 304]
- First action: position [752, 304]
- Respond to Webhook: position [1008, 304]
- Additional parallel actions: increment Y by 200 each

## API endpoints for each app

Slack — send message:
  POST https://slack.com/api/chat.postMessage
  typeVersion: 4.2, specifyBody: "json", jsonBody: JSON.stringify({ channel, text })
  Platform key: slack

Gmail — send email:
  POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  typeVersion: 4.2, specifyBody: "json", jsonBody: JSON.stringify({ raw: base64urlEncodedEmail })
  Platform key: google

Google Sheets — append row:
  POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED
  typeVersion: 4.2, specifyBody: "json", jsonBody: JSON.stringify({ values: [[col1, col2, ...]] })
  Platform key: google

Airtable — create record:
  POST https://api.airtable.com/v0/{baseId}/{tableId}
  typeVersion: 4.2, specifyBody: "json", jsonBody: JSON.stringify({ fields: { field1: value1 } })
  Platform key: airtable

Notion — create page:
  POST https://api.notion.com/v1/pages
  typeVersion: 4.2, specifyBody: "json", jsonBody: JSON.stringify({ parent: { database_id: "..." }, properties: {} })
  Platform key: notion

## Schedule cron expressions
Every Monday at 9am: 0 9 * * 1
Every Friday at 4pm: 0 16 * * 5
Every day at 9am: 0 9 * * *
Every hour: 0 * * * *
First of month at 9am: 0 9 1 * *

## Typeform → Google Sheets workflow structure

When building a Typeform → Google Sheets automation, use this exact 
node structure:

Trigger node — Webhook (receives data from Flowchat's Typeform receiver):
{
  id: 'typeform-trigger',
  name: 'Typeform Trigger',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [256, 304],
  parameters: {
    path: \`flowchat-typeform-\${userId}-\${Date.now()}\`,
    responseMode: 'responseNode',
    options: {}
  }
}

Fetch Google Credentials node:
{
  id: 'fetch-google-creds',
  name: 'Fetch Google Credentials',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [512, 304],
  parameters: {
    url: \`\${BACKEND_URL}/api/auth/credentials/\${userId}/google\`,
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: 'x-api-key', value: INTERNAL_API_KEY }]
    },
    options: {}
  }
}

Append to Google Sheets node — uses trigger data dynamically:
{
  id: 'append-sheets',
  name: 'Append to Google Sheets',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [752, 304],
  parameters: {
    method: 'POST',
    url: \`https://sheets.googleapis.com/v4/spreadsheets/\${SHEET_ID}/values/\${SHEET_NAME}!A1:append?valueInputOption=USER_ENTERED\`,
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: 'Authorization', value: '=Bearer {{ $("Fetch Google Credentials").item.json.access_token }}' }]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: \`={
      "values": [[
        "{{ $("Typeform Trigger").item.json.submitter_name }}",
        "{{ $("Typeform Trigger").item.json.submitter_email }}",
        "{{ $("Typeform Trigger").item.json.submitted_at }}"
      ]]
    }\`,
    options: {}
  }
}

Notify Flowchat node — same pattern as all other workflows:
{
  id: 'notify-success',
  name: 'Notify Flowchat',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1002, 304],
  parameters: {
    method: 'POST',
    url: \`\${BACKEND_URL}/api/executions/log\`,
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: 'x-api-key', value: INTERNAL_API_KEY }]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: \`={{ JSON.stringify({ 
      userId: "\${userId}", 
      n8nWorkflowId: $workflow.id, 
      status: "success",
      mode: $execution.mode,
      details: { 
        type: "typeform_to_sheets",
        form_id: $("Typeform Trigger").item.json.form_id,
        submitted_at: $("Typeform Trigger").item.json.submitted_at
      }
    }) }}\`,
    options: {}
  }
}

Respond to Webhook node:
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

Connections:
Typeform Trigger → Fetch Google Credentials → Append to Google Sheets → Notify Flowchat → Respond to Webhook

## Important rules
- ALWAYS include a Test Webhook node
- ALWAYS fetch credentials before calling any external API
- ALWAYS add a Respond to Webhook node connected after the last action node
- NEVER hardcode access tokens
- Use n8n expressions like {{ $json.access_token }} to reference previous node output
- For multiple actions, connect them in sequence after the credential fetch
- Return ONLY valid JSON — no markdown, no explanation, no backticks

## Output format
Return a JSON object with this exact structure:
{
  "nodes": [...],
  "connections": {...},
  "testWebhookPath": "flowchat-test-userId-timestamp"
}
`

const schemaSection = `

## Trigger data schemas
When the automation passes data from a trigger into an action, use these exact n8n expression paths. Never invent expression paths — only use what is listed here.

### typeform
${Object.entries(triggerSchemas.typeform.fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Note: ${triggerSchemas.typeform.notes}

### stripe
${Object.entries(triggerSchemas.stripe.fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Note: ${triggerSchemas.stripe.notes}

### calendly
${Object.entries(triggerSchemas.calendly.fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Note: ${triggerSchemas.calendly.notes}

### gmail
${Object.entries(triggerSchemas.gmail.fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Note: ${triggerSchemas.gmail.notes}

### google_sheets
${Object.entries(triggerSchemas.google_sheets.fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Note: ${triggerSchemas.google_sheets.notes}

When building a Google Sheets append node, set each column value to the matching trigger field expression above.
When building a Gmail send node, interpolate trigger field expressions directly into the email subject and body before base64 encoding.
When building a Slack message node, interpolate trigger field expressions into the message text.
`

function sanitizeCredentialUrls(nodes, userId) {
  if (!Array.isArray(nodes)) return

  for (const node of nodes) {
    const url = node.parameters?.url
    if (typeof url !== 'string' || !url.includes('/api/auth/credentials/')) continue

    const match = url.match(/\/api\/auth\/credentials\/[^/]+\/([^/?]+)/)
    const platform = match?.[1] || 'slack'
    node.parameters.url = `${N8N_BACKEND_URL}/api/auth/credentials/${userId}/${platform}`
    console.log('Builder Agent credential URL sanitized:', node.parameters.url)
  }
}

function injectNotifyNode(workflowJson, userId) {
  const nodes = workflowJson.nodes || []

  const lastNode = nodes[nodes.length - 1]
  const lastPos = lastNode?.position || [500, 300]

  const notifyNode = {
    id: 'notify-success',
    name: 'Notify Flowchat',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [lastPos[0] + 250, lastPos[1]],
    parameters: {
      method: 'POST',
      url: `${process.env.BACKEND_URL}/api/executions/log`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-api-key', value: 'flowchat_internal_2026' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: JSON.stringify({
        userId: userId,
        n8nWorkflowId: '={{ $workflow.id }}',
        status: 'success',
        mode: '={{ $execution.mode }}',
      }),
      options: {},
    },
  }

  nodes.push(notifyNode)

  const connections = workflowJson.connections || {}
  if (lastNode && lastNode.name !== 'Notify Flowchat') {
    connections[lastNode.name] = connections[lastNode.name] || { main: [[]] }
    if (!connections[lastNode.name].main) {
      connections[lastNode.name].main = [[]]
    }
    connections[lastNode.name].main[0] = [
      ...(connections[lastNode.name].main[0] || []),
      { node: 'Notify Flowchat', type: 'main', index: 0 },
    ]
  }

  return {
    ...workflowJson,
    nodes,
    connections,
  }
}

async function buildWorkflowWithAI(userId, userEmail, spec) {
  const {
    trigger_app,
    trigger_event,
    action_app,
    action_event,
    actions,
    details = {},
  } = spec

  // Support both single action (action_app/action_event) and 
  // multiple actions (actions array)
  const actionList = actions || [{ app: action_app, event: action_event, details }]

  // Get relevant integration metadata
  const relevantApps = [trigger_app, ...actionList.map(a => a.app)].filter(Boolean)
  const integrationMetadata = getMetadataForAgent(relevantApps)

  const testWebhookPath = `flowchat-test-${userId}-${Date.now()}`
  const credentialsBaseUrl = `${N8N_BACKEND_URL}/api/auth/credentials/${userId}`

  const specDescription = `
Automation spec:
- Trigger: ${trigger_app} (${trigger_event || 'default'})
- Actions: ${actionList.map(a => `${a.app} (${a.event || 'default'})`).join(', ')}
- Details: ${JSON.stringify(details, null, 2)}

User ID: ${userId}
Credentials base URL: ${credentialsBaseUrl}
Internal API key header value: ${process.env.INTERNAL_API_KEY || ''}
Test webhook path to use: ${testWebhookPath}
N8N base URL: ${N8N_BASE_URL}

Integration metadata for reference:
${integrationMetadata}
`

  console.log('Builder Agent generating workflow for:', trigger_app, '→', actionList.map(a => a.app).join(', '))

  const systemPrompt = BUILDER_SYSTEM_PROMPT + schemaSection

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Generate the n8n workflow JSON for this automation:\n\n${specDescription}`,
      }
    ],
  })

  const responseText = response.content[0]?.text || ''
  
  // Clean the response — remove any markdown if present
  const jsonText = responseText
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()

  let workflowJson
  try {
    workflowJson = JSON.parse(jsonText)
  } catch (err) {
    console.error('Builder Agent returned invalid JSON:', jsonText.slice(0, 500))
    throw new Error('Builder Agent failed to generate valid workflow JSON')
  }

  // Validate the response has required fields
  if (!workflowJson.nodes || !workflowJson.connections) {
    throw new Error('Builder Agent returned incomplete workflow JSON')
  }

  sanitizeCredentialUrls(workflowJson.nodes, userId)

  const workflowWithNotify = injectNotifyNode(workflowJson, userId)

  // Ensure testWebhookPath is set
  const finalTestWebhookPath = workflowWithNotify.testWebhookPath || testWebhookPath

  return {
    workflow: {
      name: `${userEmail} — ${trigger_app} → ${actionList.map(a => a.app).join(' + ')}`,
      nodes: workflowWithNotify.nodes,
      connections: workflowWithNotify.connections,
      settings: { executionOrder: 'v1' },
    },
    testWebhookPath: finalTestWebhookPath,
  }
}

module.exports = { buildWorkflowWithAI }
