require('dotenv').config()

// Debug check
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing. Add it to flowchat-backend/.env')
  process.exit(1)
}
console.log('API key starts with:', process.env.ANTHROPIC_API_KEY.substring(0, 10))

const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-version': '2023-06-01'
  }
})

const { createWorkflow, activateWorkflow, deleteWorkflow } = require('./src/services/n8n')

const SYSTEM_PROMPT = `You are an automation builder. The user will describe an automation they want in plain English.

Your job is to parse their request and return ONLY a valid JSON object (no markdown, no explanation) with this structure:

{
  "trigger": {
    "app": "typeform|gmail|google_sheets|slack|airtable|webhook",
    "event": "form_response|new_email|new_row|new_message|new_record|webhook",
    "description": "plain English description of the trigger"
  },
  "actions": [
    {
      "app": "gmail|google_sheets|slack|airtable|notion",
      "event": "send_email|append_row|send_message|create_record|create_page",
      "description": "plain English description of this action",
      "params": {}
    }
  ],
  "name": "short automation name",
  "description": "one sentence describing what this automation does"
}

Only include apps from this list: typeform, gmail, google_sheets, slack, airtable, notion, webhook.
Return ONLY the JSON object, nothing else.`

async function interpretRequest(userMessage) {
  console.log('\n📝 User request:', userMessage)
  console.log('🤖 Asking Claude to interpret...\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const raw = response.content[0].text.trim()
  const jsonText = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  const json = JSON.parse(jsonText)
  return json
}

function buildN8nWorkflow(interpretation) {
  // Build a simple n8n workflow from the interpretation
  // For now use a webhook trigger as placeholder for all triggers
  const nodes = [
    {
      id: 'trigger-node',
      name: 'Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        path: `flowchat-${Date.now()}`,
        responseMode: 'onReceived'
      }
    }
  ]

  // Add a Set node for each action as placeholder
  interpretation.actions.forEach((action, idx) => {
    nodes.push({
      id: `action-node-${idx}`,
      name: `${action.app} - ${action.event}`,
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [500 + (idx * 250), 300],
      parameters: {
        values: {
          string: [
            { name: 'app', value: action.app },
            { name: 'event', value: action.event },
            { name: 'description', value: action.description }
          ]
        }
      }
    })
  })

  // Build connections
  const connections = {
    'Trigger': {
      main: [[{ node: nodes[1].name, type: 'main', index: 0 }]]
    }
  }

  for (let i = 1; i < nodes.length - 1; i++) {
    connections[nodes[i].name] = {
      main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]]
    }
  }

  return {
    name: interpretation.name,
    nodes,
    connections,
    settings: { executionOrder: 'v1' }
  }
}

async function run() {
  const userRequest = "When someone fills my Typeform, add them to Google Sheets and send a Slack message to my team"

  try {
    // Step 1: Claude interprets the request
    const interpretation = await interpretRequest(userRequest)
    console.log('✅ Claude interpretation:')
    console.log(JSON.stringify(interpretation, null, 2))

    // Step 2: Build n8n workflow from interpretation
    const workflowData = buildN8nWorkflow(interpretation)
    console.log('\n🔧 Building n8n workflow:', workflowData.name)

    // Step 3: Create and activate in n8n
    const created = await createWorkflow(workflowData)
    console.log('✅ Workflow created in n8n:', created.id)

    const activated = await activateWorkflow(created.id)
    console.log('✅ Workflow activated:', activated.active)

    console.log('\n🎉 Full flow complete!')
    console.log('User said:', userRequest)
    console.log('Automation created:', interpretation.description)

    // Clean up
    await deleteWorkflow(created.id)
    console.log('✅ Test workflow deleted')

  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message)
  }
}

run()
