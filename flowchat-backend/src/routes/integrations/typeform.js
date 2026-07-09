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

function extractAnswer(answer) {
  console.log('extractAnswer called with type:', answer?.type)
  if (!answer) return ''

  switch (answer.type) {
    // Text-based answers
    case 'text':
      console.log('extractAnswer text:', answer.text)
      return answer.text || ''

    // Email
    case 'email':
      return answer.email || ''

    // Phone number
    case 'phone_number':
      return answer.phone_number || ''

    // Numbers — rating, opinion_scale, nps, number fields
    case 'number':
      return answer.number != null ? answer.number.toString() : ''

    // Boolean — yes_no, legal, checkbox fields
    case 'boolean':
      return answer.boolean === true ? 'Yes' : answer.boolean === false ? 'No' : ''

    // Single choice — multiple_choice, dropdown, picture_choice (single)
    case 'choice':
      return answer.choice?.label || answer.choice?.other || ''

    // Multiple choices — picture_choice (multi), ranking
    case 'choices':
      if (answer.choices?.labels?.length > 0) {
        return answer.choices.labels.join(', ')
      }
      if (answer.choices?.other) {
        return answer.choices.other
      }
      return ''

    // Date
    case 'date':
      return answer.date || ''

    // File upload
    case 'file_url':
      return answer.file_url || ''

    // URL / website
    case 'url':
      return answer.url || ''

    // Payment
    case 'payment':
      if (answer.payment) {
        return `${answer.payment.amount} ${answer.payment.currency}`
      }
      return ''

    // Matrix — returns object with row/column selections
    // Stored as JSON string since it's multi-dimensional
    case 'matrix':
      return answer.matrix ? JSON.stringify(answer.matrix) : ''

    // Ranking — ordered list of choices
    case 'ranking':
      if (answer.choices?.labels?.length > 0) {
        return answer.choices.labels.join(' > ')
      }
      return ''

    // Fallback — stringify whatever is there
    default:
      // Try common value properties in order
      return answer.text
        || answer.email
        || answer.phone_number
        || (answer.number != null ? answer.number.toString() : '')
        || (answer.boolean != null ? (answer.boolean ? 'Yes' : 'No') : '')
        || answer.choice?.label
        || answer.choices?.labels?.join(', ')
        || answer.date
        || answer.file_url
        || answer.url
        || ''
  }
}

async function refreshTypeformAccessToken(userId, account) {
  console.log(`[typeform/${userId}] Token expired, refreshing...`)
  const refreshRes = await axios.post(
    'https://api.typeform.com/oauth/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
      client_id: process.env.TYPEFORM_CLIENT_ID,
      client_secret: process.env.TYPEFORM_CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  const accessToken = refreshRes.data.access_token
  await supabase
    .from('platform_accounts')
    .update({
      access_token: accessToken,
      refresh_token: refreshRes.data.refresh_token || account.refresh_token,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'typeform')
  console.log(`[typeform/${userId}] Token refreshed successfully`)
  return accessToken
}

async function callWithTypeformToken(userId, account, apiCall) {
  let accessToken = account.access_token
  try {
    return await apiCall(accessToken)
  } catch (err) {
    if (err.response?.status === 403 && account.refresh_token) {
      accessToken = await refreshTypeformAccessToken(userId, account)
      account.access_token = accessToken
      return await apiCall(accessToken)
    }
    throw err
  }
}

// Webhook receiver — called by Typeform on every form submission
router.post('/webhook/:userId', async (req, res) => {
  const { userId } = req.params
  const payload = req.body

  // Respond immediately — Typeform requires response within 10 seconds
  res.status(200).json({ received: true })

  try {
    const formResponse = payload.form_response
    const answers = formResponse?.answers || []
    const submittedAt = formResponse?.submitted_at || new Date().toISOString()
    const formId = formResponse?.form_id

    // Find active Typeform → Sheets workflows for this user
    const { data: workflows } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_app', 'typeform')
      .eq('status', 'active')

    // Filter by form_id from trigger_config
    const matchingWorkflows = workflows?.filter(w =>
      w.trigger_config?.form_id === formId
    ) || []

    if (matchingWorkflows.length === 0) {
      console.log(`No active Typeform workflows for user ${userId} form ${formId}`)
      return
    }

    const answersMap = {}
    for (const answer of answers) {
      answersMap[answer.field.id] = answer
    }

    const emailAnswer = answers.find(a => a.type === 'email')
    const nameAnswer = answers.find(a =>
      a.type === 'text' || a.field?.type === 'short_text'
    )

    for (const workflow of matchingWorkflows) {
      if (!workflow.webhook_url) continue

      const fieldMapping = workflow.trigger_config?.field_mapping || []

      let columns = []
      if (fieldMapping.length > 0) {
        columns = fieldMapping.map(f => ({
          title: f.title,
          value: extractAnswer(answersMap[f.id])
        }))
      } else {
        columns = answers.map(a => ({
          title: a.field?.id || 'field',
          value: extractAnswer(a)
        }))
      }

      const normalizedData = {
        form_id: formId,
        submitted_at: submittedAt,
        submitter_email: emailAnswer?.email || null,
        submitter_name: nameAnswer?.text || null,
        columns: columns,
        column_values: columns.map(c => c.value),
        column_headers: columns.map(c => c.title),
        all_answers: JSON.stringify(answers)
      }

      await axios.post(workflow.webhook_url, normalizedData)
      console.log(`✅ Triggered workflow ${workflow.id} for Typeform submission`)

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
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'typeform')
      .single()

    if (!account) {
      return res.status(404).json({ error: 'Typeform not connected' })
    }

    const formsRes = await callWithTypeformToken(userId, account, (token) =>
      axios.get('https://api.typeform.com/forms', {
        headers: { Authorization: `Bearer ${token}` },
      })
    )

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
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'typeform')
      .single()

    if (!account) {
      return res.status(404).json({ error: 'Typeform not connected' })
    }

    const fetchFields = (token) =>
      axios.get(`https://api.typeform.com/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

    const formRes = await callWithTypeformToken(userId, account, fetchFields)

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

  console.log('sync called with fieldMapping:', JSON.stringify(fieldMapping?.slice(0, 2)))
  console.log('sync sheetId:', sheetId, 'sheetTab:', sheetTab)

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { data: tfAccount } = await supabase
      .from('platform_accounts')
      .select('access_token, refresh_token')
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

    const responsesRes = await callWithTypeformToken(userId, tfAccount, (token) =>
      axios.get(
        `https://api.typeform.com/forms/${formId}/responses?page_size=1000`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
    )

    const responses = responsesRes.data.items || []

    if (responses.length === 0) {
      return res.json({ success: true, imported: 0 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single()

    const userTimezone = profile?.timezone || 'UTC'

    const formatTimestamp = (isoString) => {
      if (!isoString) return ''
      try {
        return new Date(isoString).toLocaleString('en-GB', {
          timeZone: userTimezone,
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return isoString
      }
    }

    const headers = ['Submitted At', ...fieldMapping.map(f => f.title)]

    const rows = responses.map(response => {
      const answersMap = {}
      for (const answer of (response.answers || [])) {
        answersMap[answer.field.id] = answer
      }

      if (responses.length > 0) {
        console.log('First response answersMap keys:', Object.keys(answersMap))
        console.log('fieldMapping IDs:', fieldMapping.map(f => f.id))
      }

      return [
        formatTimestamp(response.submitted_at),
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

async function deregisterTypeformWebhook(userId, formId, accessToken) {
  try {
    const { data: account } = await supabase
      .from('platform_accounts')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'typeform')
      .single()

    const accountForRefresh = account || {
      access_token: accessToken,
      refresh_token: null,
    }
    if (!accountForRefresh.access_token) {
      accountForRefresh.access_token = accessToken
    }

    const tag = `flowchat-${userId}-${formId}`
    await callWithTypeformToken(userId, accountForRefresh, (token) =>
      axios.delete(`https://api.typeform.com/forms/${formId}/webhooks/${tag}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    console.log(`✅ Typeform webhook deregistered for form ${formId}`)
  } catch (err) {
    console.error('Typeform webhook deregister error:', err.response?.data || err.message)
  }
}

module.exports = router
module.exports.deregisterTypeformWebhook = deregisterTypeformWebhook
module.exports.refreshTypeformAccessToken = refreshTypeformAccessToken
