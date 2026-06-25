const express = require('express')
const router = express.Router()
const axios = require('axios')

const n8nClient = axios.create({
  baseURL: process.env.N8N_BASE_URL,
  headers: {
    'X-N8N-API-KEY': process.env.N8N_API_KEY,
    'Content-Type': 'application/json'
  }
})

function requireInternalKey(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

router.use(requireInternalKey)

router.get('/workflows', async (req, res) => {
  try {
    const result = await n8nClient.get('/api/v1/workflows')
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/workflows', async (req, res) => {
  try {
    const result = await n8nClient.post('/api/v1/workflows', req.body)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/workflows/:id', async (req, res) => {
  try {
    const result = await n8nClient.get(`/api/v1/workflows/${req.params.id}`)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/workflows/:id', async (req, res) => {
  try {
    const result = await n8nClient.put(`/api/v1/workflows/${req.params.id}`, req.body)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/workflows/:id/activate', async (req, res) => {
  try {
    const result = await n8nClient.post(`/api/v1/workflows/${req.params.id}/activate`)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/workflows/:id/deactivate', async (req, res) => {
  try {
    const result = await n8nClient.post(`/api/v1/workflows/${req.params.id}/deactivate`)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/executions', async (req, res) => {
  try {
    const params = {}
    if (req.query.workflowId) params.workflowId = req.query.workflowId
    if (req.query.status) params.status = req.query.status
    if (req.query.limit) params.limit = req.query.limit
    const result = await n8nClient.get('/api/v1/executions', { params })
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/executions/:id', async (req, res) => {
  try {
    const result = await n8nClient.get(`/api/v1/executions/${req.params.id}`)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/workflows/:id', async (req, res) => {
  try {
    const result = await n8nClient.delete(`/api/v1/workflows/${req.params.id}`)
    res.json(result.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
