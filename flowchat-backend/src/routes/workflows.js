const express = require('express')
const router = express.Router()
const { createWorkflow, activateWorkflow } = require('../services/n8n')
const { buildWorkflow, getWebhookUrl } = require('../services/workflowBuilder')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

router.post('/create', async (req, res) => {
  const { userId, userEmail, automation } = req.body

  if (!userId || !userEmail || !automation) {
    return res.status(400).json({ error: 'userId, userEmail, and automation required' })
  }

  try {
    console.log('Creating automation for user:', userId)
    console.log('Automation:', JSON.stringify(automation))

    const workflowData = buildWorkflow(userId, userEmail, {
      trigger_app: automation.trigger_app,
      trigger_event: automation.trigger_event,
      action_app: automation.action_app,
      action_event: automation.action_event,
      details: automation.details || {},
    })

    const created = await createWorkflow(workflowData)
    await activateWorkflow(created.id)

    const webhookUrl = getWebhookUrl(created)

    const { error: dbError } = await supabase.from('workflows').insert({
      user_id: userId,
      n8n_workflow_id: created.id,
      name: workflowData.name,
      description: automation.description || null,
      status: 'active',
      trigger_app: automation.trigger_app,
      action_apps: automation.action_app ? [automation.action_app] : [],
      webhook_url: webhookUrl || null,
    })

    if (dbError) {
      console.error('Supabase insert error:', dbError)
      return res.status(500).json({ error: dbError.message })
    }

    res.json({ success: true, workflowId: created.id, webhookUrl: webhookUrl || null })
  } catch (err) {
    console.error('Create workflow error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
