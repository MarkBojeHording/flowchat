const axios = require('axios')

const n8nClient = axios.create({
  baseURL: process.env.N8N_BASE_URL,
  headers: {
    'X-N8N-API-KEY': process.env.N8N_API_KEY,
    'Content-Type': 'application/json'
  }
})

async function getWorkflows() {
  const res = await n8nClient.get('/api/v1/workflows')
  return res.data
}

async function testConnection() {
  try {
    const workflows = await getWorkflows()
    console.log('✅ n8n connection successful')
    console.log('Workflows:', workflows)
    return true
  } catch (err) {
    console.error('❌ n8n connection failed:', err.message)
    return false
  }
}

async function createWorkflow(workflowData) {
  const res = await n8nClient.post('/api/v1/workflows', workflowData)
  return res.data
}

async function activateWorkflow(workflowId) {
  const res = await n8nClient.post(`/api/v1/workflows/${workflowId}/activate`)
  return res.data
}

async function deleteWorkflow(workflowId) {
  const res = await n8nClient.delete(`/api/v1/workflows/${workflowId}`)
  return res.data
}

module.exports = {
  n8nClient,
  getWorkflows,
  testConnection,
  createWorkflow,
  activateWorkflow,
  deleteWorkflow,
}
