'use strict'

const Anthropic = require('@anthropic-ai/sdk')
const { getMetadataForAgent } = require('./integrations')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const N8N_BACKEND_URL = 'https://flowchat-production-376f.up.railway.app'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ''
const N8N_BASE_URL = (process.env.N8N_BASE_URL || '').replace(/\/$/, '')

const BUILDER_SYSTEM_PROMPT = `You are an expert n8n workflow builder for Flowchat.

Your job is to generate valid n8n workflow JSON based on an automation specification.

## Architecture rules

Every workflow you generate MUST follow this pattern:

1. TRIGGER NODE — what starts the workflow
   - Schedule: use n8n-nodes-base.scheduleTrigger
   - Webhook (Typeform, Stripe, Calendly): use n8n-nodes-base.webhook

2. TEST WEBHOOK NODE — always include alongside the main trigger
   - type: n8n-nodes-base.webhook
   - name: "Test Webhook"
   - httpMethod: GET
   - Both the main trigger AND Test Webhook connect to the next node

3. CREDENTIAL FETCH NODE(S) — one per external app used
   - type: n8n-nodes-base.httpRequest
   - Makes GET request to: CREDENTIALS_BASE_URL/userId/platform
   - Sends header: x-api-key: INTERNAL_API_KEY
   - The response contains access_token

4. ACTION NODE(S) — what the workflow does
   - type: n8n-nodes-base.httpRequest
   - Uses the access_token from the credential fetch node
   - Authorization header: Bearer {{ $json.access_token }}

## Node positioning
- Trigger nodes: position [250, 300]
- Test webhook: position [250, 500]  
- First credential fetch: position [500, 300]
- First action: position [750, 300]
- Additional parallel actions: increment Y by 200 each

## API endpoints for each app

Slack — send message:
  POST https://slack.com/api/chat.postMessage
  Body: { channel: "#channelname", text: "message" }
  Platform key: slack

Gmail — send email:
  POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  Body: { raw: base64url encoded email }
  Platform key: google

Google Sheets — append row:
  POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED
  Body: { values: [[col1, col2, ...]] }
  Platform key: google

Airtable — create record:
  POST https://api.airtable.com/v0/{baseId}/{tableId}
  Body: { fields: { field1: value1 } }
  Platform key: airtable

Notion — create page:
  POST https://api.notion.com/v1/pages
  Body: { parent: { database_id: "..." }, properties: {} }
  Platform key: notion

## Schedule cron expressions
Every Monday at 9am: 0 9 * * 1
Every Friday at 4pm: 0 16 * * 5
Every day at 9am: 0 9 * * *
Every hour: 0 * * * *
First of month at 9am: 0 9 1 * *

## Important rules
- ALWAYS include a Test Webhook node
- ALWAYS fetch credentials before calling any external API
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
Internal API key header value: ${INTERNAL_API_KEY}
Test webhook path to use: ${testWebhookPath}
N8N base URL: ${N8N_BASE_URL}

Integration metadata for reference:
${integrationMetadata}
`

  console.log('Builder Agent generating workflow for:', trigger_app, '→', actionList.map(a => a.app).join(', '))

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: BUILDER_SYSTEM_PROMPT,
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

  // Ensure testWebhookPath is set
  const finalTestWebhookPath = workflowJson.testWebhookPath || testWebhookPath

  return {
    workflow: {
      name: `${userEmail} — ${trigger_app} → ${actionList.map(a => a.app).join(' + ')}`,
      nodes: workflowJson.nodes,
      connections: workflowJson.connections,
      settings: { executionOrder: 'v1' },
    },
    testWebhookPath: finalTestWebhookPath,
  }
}

module.exports = { buildWorkflowWithAI }
