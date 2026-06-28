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

// GET /api/integrations/typeform/fields/:userId/:formId
// Returns form fields (questions) for a given form
router.get('/fields/:userId/:formId', async (req, res) => {
  const { userId, formId } = req.params
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

    const formRes = await axios.get(
      `https://api.typeform.com/forms/${formId}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )

    const fields = (formRes.data.fields || []).map(f => ({
      id: f.id,
      title: f.title,
      type: f.type,
      ref: f.ref
    }))

    res.json({ fields })

  } catch (err) {
    console.error('Typeform fields fetch error:', err.response?.data || err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/integrations/typeform/sync/:userId/:formId
// Imports all historical responses to Google Sheets
router.post('/sync/:userId/:formId', async (req, res) => {
  const { userId, formId } = req.params
  const { sheetId, sheetTab, fieldMapping } = req.body
  const apiKey = req.headers['x-api-key']

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { data: tfAccount } = await supabase
      .from('platform_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'typeform')
      .single()

    if (!tfAccount) {
      return res.status(404).json({ error: 'Typeform not connected' })
    }

    const { data: gAccount } = await supabase
      .from('platform_accounts')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'google')
      .single()

    if (!gAccount) {
      return res.status(404).json({ error: 'Google not connected' })
    }

    const responsesRes = await axios.get(
      `https://api.typeform.com/forms/${formId}/responses?page_size=1000`,
      { headers: { Authorization: `Bearer ${tfAccount.access_token}` } }
    )

    const responses = responsesRes.data.items || []

    if (responses.length === 0) {
      return res.json({ success: true, imported: 0 })
    }

    const headers = ['Submitted At', ...fieldMapping.map(f => f.title)]

    function extractAnswer(answer) {
      if (!answer) return ''
      switch (answer.type) {
        case 'text': return answer.text || ''
        case 'email': return answer.email || ''
        case 'number': return answer.number?.toString() || ''
        case 'boolean': return answer.boolean ? 'Yes' : 'No'
        case 'choice': return answer.choice?.label || ''
        case 'choices': return (answer.choices?.labels || []).join(', ')
        case 'date': return answer.date || ''
        case 'phone_number': return answer.phone_number || ''
        case 'url': return answer.url || ''
        case 'file_url': return answer.file_url || ''
        default: return JSON.stringify(answer) || ''
      }
    }

    const rows = responses.map(response => {
      const answersMap = {}
      for (const answer of (response.answers || [])) {
        answersMap[answer.field.id] = answer
      }

      return [
        response.submitted_at || '',
        ...fieldMapping.map(f => extractAnswer(answersMap[f.id]))
      ]
    })

    const values = [headers, ...rows]

    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetTab}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values },
      {
        headers: {
          Authorization: `Bearer ${gAccount.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    res.json({ success: true, imported: rows.length })

  } catch (err) {
    console.error('Typeform sync error:', err.response?.data || err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
