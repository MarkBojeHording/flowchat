const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const ws = require('ws')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

// Webhook receiver — called by Typeform on every form submission
router.post('/webhook/:userId', async (req, res) => {
  const { userId } = req.params
  const payload = req.body

  // Respond immediately — Typeform requires response within 10 seconds
  res.status(200).json({ received: true })

  try {
    const formId = payload.form_response?.form_id
    const submittedAt = payload.form_response?.submitted_at
    const answers = payload.form_response?.answers || []

    // Extract common fields
    const emailAnswer = answers.find(a => a.type === 'email')
    const textAnswers = answers.filter(a => a.type === 'text' || a.type === 'short_text')

    const normalizedData = {
      form_id: formId,
      submitted_at: submittedAt,
      submitter_email: emailAnswer?.email || null,
      submitter_name: textAnswers[0]?.text || null,
      all_answers: JSON.stringify(answers),
      raw: payload
    }

    // Find active Typeform → Sheets workflows for this user
    const { data: workflows } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_app', 'typeform')
      .eq('status', 'active')

    if (!workflows || workflows.length === 0) {
      console.log(`No active Typeform workflows for user ${userId}`)
      return
    }

    // Trigger each matching workflow via its test webhook URL
    for (const workflow of workflows) {
      if (!workflow.webhook_url) continue

      await axios.post(workflow.webhook_url, normalizedData)
      console.log(`✅ Triggered workflow ${workflow.id} for Typeform submission`)

      // Log execution
      await supabase.from('executions').insert({
        user_id: userId,
        workflow_id: workflow.id,
        n8n_execution_id: null,
        status: 'success',
        mode: 'production',
        is_test: false,
        details: {
          type: 'typeform',
          form_id: formId,
          submitted_at: submittedAt
        }
      })
    }

  } catch (err) {
    console.error('Typeform webhook processing error:', err.message)
  }
})

// Get user's Typeform forms (for the agent to list available forms)
router.get('/forms/:userId', async (req, res) => {
  const { userId } = req.params
  const apiKey = req.headers['x-api-key']

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { data: account } = await supabase
      .from('platform_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'typeform')
      .single()

    if (!account) {
      return res.status(404).json({ error: 'Typeform not connected' })
    }

    const formsRes = await axios.get('https://api.typeform.com/forms', {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    const forms = formsRes.data.items.map(f => ({
      id: f.id,
      title: f.title,
      response_count: f._links?.responses
    }))

    res.json({ forms })

  } catch (err) {
    console.error('Typeform forms fetch error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
