const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const notion = require('../integrations/actions/notion')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/notion/:userId', async (req, res) => {
  const { userId } = req.params
  const apiKey = req.headers['x-api-key']

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { database_id, field_mapping, trigger_data } = req.body || {}

  if (!database_id) {
    return res.status(400).json({ error: 'database_id is required' })
  }
  if (!field_mapping || !Array.isArray(field_mapping)) {
    return res.status(400).json({ error: 'field_mapping must be an array' })
  }
  if (!trigger_data || typeof trigger_data !== 'object') {
    return res.status(400).json({ error: 'trigger_data is required' })
  }

  try {
    const { data: account, error } = await supabase
      .from('platform_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'notion')
      .single()

    if (error || !account?.access_token) {
      return res.status(404).json({ error: 'Notion not connected' })
    }

    const properties = notion.buildProperties(field_mapping, trigger_data)
    const result = await notion.createRow(
      database_id,
      properties,
      account.access_token
    )

    return res.json({ success: true, page_id: result.id })
  } catch (err) {
    console.error('Notion create row failed:', err.response?.data || err.message)
    return res.status(500).json({
      error: 'Failed to create Notion row',
      details: err.response?.data || err.message,
    })
  }
})

module.exports = router
