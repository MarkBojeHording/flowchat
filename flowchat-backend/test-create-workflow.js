require('dotenv').config()
const { createWorkflow, activateWorkflow, deleteWorkflow } = require('./src/services/n8n')

async function run() {
  console.log('Creating test workflow...')

  // A simple workflow with one webhook trigger node
  const workflow = {
    name: 'Test Workflow - Flowchat',
    nodes: [
      {
        id: 'webhook-node',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          path: 'test-flowchat',
          responseMode: 'onReceived',
          responseData: 'firstEntryJson'
        }
      },
      {
        id: 'set-node',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        typeVersion: 1,
        position: [500, 300],
        parameters: {
          values: {
            string: [
              {
                name: 'message',
                value: 'Hello from Flowchat!'
              }
            ]
          }
        }
      }
    ],
    connections: {
      'Webhook': {
        main: [[{ node: 'Set', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1'
    }
  }

  try {
    const created = await createWorkflow(workflow)
    console.log('✅ Workflow created:', created.id, created.name)

    const activated = await activateWorkflow(created.id)
    console.log('✅ Workflow activated:', activated.active ?? true)

    console.log('Cleaning up...')
    await deleteWorkflow(created.id)
    console.log('✅ Workflow deleted')
  } catch (err) {
    console.error('❌ Failed:', err.response?.data ?? err.message)
    process.exit(1)
  }
}

run()
