const express = require('express')
const router = express.Router()

// POST /api/polling/run
// Called by n8n every 5 minutes
router.post('/run', async (req, res) => {
  const apiKey = req.headers['x-api-key']
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  res.json({ started: true })

  // Run polling in background
  const { runPolling } = require('../integrations/polling/engine')
  runPolling().catch(err =>
    console.error('[polling] Engine error:', err.message)
  )
})

module.exports = router
