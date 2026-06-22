const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

function getAppName(nodeName) {
  if (!nodeName) return 'connected app'
  if (nodeName.includes('Slack')) return 'Slack'
  if (nodeName.includes('Google') || nodeName.includes('Sheets')) return 'Google Sheets'
  if (nodeName.includes('Gmail')) return 'Gmail'
  if (nodeName.includes('Typeform')) return 'Typeform'
  if (nodeName.includes('Airtable')) return 'Airtable'
  if (nodeName.includes('Notion')) return 'Notion'
  return 'connected app'
}

function classifyError(errorMessage, lastNodeExecuted) {
  const msg = (errorMessage || '').toLowerCase()
  const appName = getAppName(lastNodeExecuted)

  if (msg.includes('401') || msg.includes('unauthorized') ||
      msg.includes('token expired') || msg.includes('invalid_grant')) {
    return {
      type: 'auth_expired',
      userMessage: `Your ${appName} connection expired — this happens occasionally.`,
      fixAction: 'reconnect',
      fixLabel: `Reconnect ${appName} →`,
      shouldNotify: true,
    }
  }

  if (msg.includes('404') || msg.includes('not found') ||
      msg.includes('no spreadsheet')) {
    return {
      type: 'resource_missing',
      userMessage: `Something was deleted or moved. ${appName} couldn't find the file or channel it was looking for.`,
      fixAction: 'chat',
      fixLabel: 'Tell me what changed →',
      shouldNotify: true,
    }
  }

  if (msg.includes('429') || msg.includes('rate limit') ||
      msg.includes('too many requests')) {
    return {
      type: 'rate_limit',
      userMessage: `${appName} is temporarily busy. I'll retry automatically.`,
      fixAction: 'auto_retry',
      shouldNotify: false,
    }
  }

  if (msg.includes('timeout') || msg.includes('econnrefused') ||
      msg.includes('network')) {
    return {
      type: 'network',
      userMessage: 'There was a temporary connection issue. I\'ll retry automatically.',
      fixAction: 'auto_retry',
      shouldNotify: false,
    }
  }

  if (msg.includes('403') || msg.includes('forbidden') ||
      msg.includes('permission')) {
    return {
      type: 'permission',
      userMessage: `Flowchat no longer has permission to access your ${appName}. You may have removed access.`,
      fixAction: 'reconnect',
      fixLabel: `Reconnect ${appName} →`,
      shouldNotify: true,
    }
  }

  return {
    type: 'unknown',
    userMessage: null,
    fixAction: null,
    shouldNotify: false,
  }
}

// POST /api/executions/error - called by n8n error workflow
router.post('/error', async (req, res) => {
  const apiKey = req.headers['x-api-key']
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = req.body
    const workflowName = payload.workflow?.name || ''
    const errorMessage = payload.execution?.error?.message || ''
    const lastNodeExecuted = payload.execution?.lastNodeExecuted || ''

    console.log('Error received from n8n:', workflowName, errorMessage)

    // Extract user email from workflow name format: "email — automation name"
    const parts = workflowName.split(' — ')
    if (parts.length < 2) {
      console.log('Could not parse workflow name:', workflowName)
      return res.json({ received: true })
    }

    const userEmail = parts[0].trim()
    const automationName = parts.slice(1).join(' — ').trim()

    // Look up user in Supabase
    const { data: userData } = await supabase.auth.admin.listUsers()
    const user = userData?.users?.find(u => u.email === userEmail)

    if (!user) {
      console.log('User not found for email:', userEmail)
      return res.json({ received: true })
    }

    // Look up workflow in Supabase
    const { data: workflow } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', `%${automationName}%`)
      .single()

    if (!workflow) {
      console.log('Workflow not found:', automationName)
      return res.json({ received: true })
    }

    // Classify the error
    const classification = classifyError(errorMessage, lastNodeExecuted)

    // Increment consecutive failures
    const consecutiveFailures = (workflow.consecutive_failures || 0) + 1

    await supabase
      .from('workflows')
      .update({
        consecutive_failures: consecutiveFailures,
        last_error_type: classification.type,
        last_error_at: new Date().toISOString(),
        last_error_message: errorMessage,
      })
      .eq('id', workflow.id)

    console.log(`Workflow ${workflow.id} has ${consecutiveFailures} consecutive failures`)

    // Notify if threshold reached
    if (
      classification.shouldNotify &&
      consecutiveFailures >= 3 &&
      !workflow.notification_sent_at &&
      workflow.status !== 'paused'
    ) {
      // Mark as broken and set notification sent
      await supabase
        .from('workflows')
        .update({
          status: 'broken',
          notification_sent_at: new Date().toISOString(),
        })
        .eq('id', workflow.id)

      console.log(`✅ Automation marked as broken, notification needed for: ${userEmail}`)
      // TODO: Send email notification
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Error handler error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/executions/admin - admin overview (protected)
router.get('/admin', async (req, res) => {
  const apiKey = req.headers['x-api-key']
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get all workflows with user info
    const { data: workflows } = await supabase
      .from('workflows')
      .select('*')
      .order('last_message_at', { ascending: false })

    // Get user count
    const { data: userData } = await supabase.auth.admin.listUsers()
    const users = userData?.users || []

    // Get execution counts
    const { data: executions } = await supabase
      .from('executions')
      .select('status, ran_at')
      .gte('ran_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const successCount = executions?.filter(e => e.status === 'success').length || 0
    const failureCount = executions?.filter(e => e.status === 'error').length || 0

    const brokenWorkflows = workflows?.filter(w => w.status === 'broken') || []
    const activeWorkflows = workflows?.filter(w => w.status === 'active') || []

    res.json({
      users: users.length,
      totalWorkflows: workflows?.length || 0,
      activeWorkflows: activeWorkflows.length,
      brokenWorkflows: brokenWorkflows.length,
      executions24h: {
        success: successCount,
        failures: failureCount,
      },
      recentFailures: brokenWorkflows.map(w => ({
        id: w.id,
        name: w.name,
        userId: w.user_id,
        lastErrorType: w.last_error_type,
        lastErrorMessage: w.last_error_message,
        consecutiveFailures: w.consecutive_failures,
        lastErrorAt: w.last_error_at,
      })),
    })
  } catch (err) {
    console.error('Admin overview error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
