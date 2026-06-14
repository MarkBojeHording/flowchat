require('dotenv').config()

const { n8nClient } = require('./src/services/n8n')

const WORKFLOW_ID = 'ERCXpSGLpaUGvGCt'

async function tryRequest(label, method, url, data) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`${label}`)
  console.log(`${method.toUpperCase()} ${url}`)
  try {
    const config = { method, url }
    if (data !== undefined) config.data = data
    const res = await n8nClient.request(config)
    console.log('STATUS:', res.status)
    console.log('HEADERS:', JSON.stringify(res.headers, null, 2))
    console.log('BODY:', JSON.stringify(res.data, null, 2))
    return { ok: true, status: res.status, data: res.data }
  } catch (err) {
    const status = err.response?.status
    const body = err.response?.data
    const headers = err.response?.headers
    console.log('ERROR STATUS:', status || 'no response')
    console.log('ERROR HEADERS:', JSON.stringify(headers || {}, null, 2))
    console.log('ERROR BODY:', JSON.stringify(body || err.message, null, 2))
    return { ok: false, status, error: body || err.message }
  }
}

async function main() {
  console.log('N8N_BASE_URL:', process.env.N8N_BASE_URL)
  console.log('API KEY set:', !!process.env.N8N_API_KEY)
  console.log('Workflow ID:', WORKFLOW_ID)

  // Step 1: GET workflows for version info
  const listResult = await tryRequest(
    '1. GET /api/v1/workflows (version check)',
    'get',
    '/api/v1/workflows'
  )

  if (listResult.ok) {
    const workflows = listResult.data?.data || listResult.data
    if (Array.isArray(workflows)) {
      console.log('\nWorkflow count:', workflows.length)
      const target = workflows.find((w) => w.id === WORKFLOW_ID)
      if (target) {
        console.log('Target workflow found in list:', target.name, '- active:', target.active)
      } else {
        console.log('Target workflow NOT found in list. Available IDs:')
        workflows.slice(0, 10).forEach((w) => console.log(' -', w.id, w.name))
      }
    }
  }

  // Step 2: Try each execute endpoint
  const endpoints = [
    ['2. POST /api/v1/workflows/:id/run', 'post', `/api/v1/workflows/${WORKFLOW_ID}/run`, {}],
    ['3. POST /api/v1/workflows/:id/execute', 'post', `/api/v1/workflows/${WORKFLOW_ID}/execute`, {}],
    ['4. POST /api/v1/executions', 'post', '/api/v1/executions', { workflowId: WORKFLOW_ID }],
    ['5. POST /rest/workflows/:id/run', 'post', `/rest/workflows/${WORKFLOW_ID}/run`, {}],
    ['6. POST /rest/workflows/run', 'post', '/rest/workflows/run', { workflowId: WORKFLOW_ID }],
    ['7. GET /api/v1/workflows/:id (confirm exists)', 'get', `/api/v1/workflows/${WORKFLOW_ID}`],
  ]

  const results = []
  for (const [label, method, url, data] of endpoints) {
    const result = await tryRequest(label, method, url, data)
    results.push({ label, method, url, ...result })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log('='.repeat(60))
  for (const r of results) {
    const status = r.ok ? `✅ ${r.status}` : `❌ ${r.status || 'failed'}`
    console.log(`${status} — ${r.method.toUpperCase()} ${r.url}`)
  }
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
