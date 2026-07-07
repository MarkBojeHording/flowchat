const express = require('express')
const router = express.Router()
const { getPlatform } = require('../index')
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const ws = require('ws')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

router.post('/:platform/:userId', async (req, res) => {
  const { platform, userId } = req.params
  res.status(200).json({ received: true })

  try {
    const handler = getPlatform(platform)
    const normalized = handler.normalize(req.body)
    const resourceId = normalized.form_id

    console.log(`[webhook/${platform}/${userId}] Received, resource: ${resourceId}`)

    const { data: allWorkflows } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_app', platform)
      .eq('status', 'active')

    const workflows = (allWorkflows || []).filter(w =>
      w.trigger_config?.form_id === resourceId ||
      w.trigger_config?.resource_id === resourceId
    )

    if (!workflows.length) {
      console.log(`[webhook/${platform}/${userId}] No matching workflows for ${resourceId}`)
      return
    }

    for (const workflow of workflows) {
      try {
        const fieldMapping = workflow.trigger_config?.field_mapping || []
        if (fieldMapping.length > 0 && normalized.answers_map) {
          normalized.column_values = fieldMapping.map(f =>
            handler.extractAnswer ? handler.extractAnswer(normalized.answers_map[f.id]) : ''
          )
          normalized.column_headers = fieldMapping.map(f => f.title)
        }

        await axios.post(workflow.webhook_url, normalized)
        console.log(`[webhook/${platform}/${userId}] Triggered workflow ${workflow.id}`)

        await supabase.from('executions').insert({
          user_id: userId,
          workflow_id: workflow.id,
          status: 'triggered',
          mode: 'production',
          details: { platform, resource_id: resourceId }
        })
      } catch (err) {
        console.error(`[webhook/${platform}/${userId}] Failed workflow ${workflow.id}:`, err.message)
      }
    }
  } catch (err) {
    console.error(`[webhook/${platform}/${userId}] Error:`, err.message)
  }
})

module.exports = router
