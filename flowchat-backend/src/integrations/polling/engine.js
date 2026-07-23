const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const ws = require('ws')
const { callWithTokenRefresh } = require('../core/execute')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const googleSheetsPoller = require('./google_sheets')
const gmailPoller = require('./gmail')

const POLLERS = {
  google_sheets_new_row: googleSheetsPoller,
  gmail_new_email: gmailPoller,
}

async function runPolling() {
  console.log('[polling] Starting polling run...')

  // Get all active polling workflows
  const { data: workflows } = await supabase
    .from('workflows')
    .select('*')
    .eq('status', 'active')
    .not('trigger_config->poll_type', 'is', null)

  if (!workflows?.length) {
    console.log('[polling] No polling workflows found')
    return
  }

  console.log(`[polling] Checking ${workflows.length} polling workflows`)

  for (const workflow of workflows) {
    try {
      await pollWorkflow(workflow)
    } catch (err) {
      console.error(`[polling] Error polling workflow ${workflow.id}:`, err.message)
    }
  }

  console.log('[polling] Polling run complete')
}

async function pollWorkflow(workflow) {
  const config = workflow.trigger_config
  const pollType = config?.poll_type
  const poller = POLLERS[pollType]

  if (!poller) {
    console.log(`[polling] Unknown poll type: ${pollType}`)
    return
  }

  const platform = pollType.startsWith('gmail') ? 'google' : 'google'

  try {
    let result

    if (pollType === 'google_sheets_new_row') {
      result = await callWithTokenRefresh(workflow.user_id, platform, async (token) => {
        return googleSheetsPoller.checkNewRows({
          sheetId: config.sheet_id,
          sheetTab: config.sheet_tab || 'Sheet1',
          lastRow: workflow.poll_cursor?.last_row || 1,
          accessToken: token
        })
      })

      if (result.newRows.length > 0) {
        console.log(`[polling/${workflow.id}] Found ${result.newRows.length} new rows`)
        for (const row of result.newRows) {
          const normalized = googleSheetsPoller.normalize(row, Object.keys(row))
          await triggerWorkflow(workflow, normalized)
        }
      }

      // Update cursor
      await supabase
        .from('workflows')
        .update({
          poll_cursor: { last_row: result.newLastRow },
          last_polled_at: new Date().toISOString()
        })
        .eq('id', workflow.id)

    } else if (pollType === 'gmail_new_email') {
      result = await callWithTokenRefresh(workflow.user_id, platform, async (token) => {
        return gmailPoller.checkNewEmails({
          lastHistoryId: workflow.poll_cursor?.history_id,
          labelIds: config.label_ids || ['INBOX'],
          accessToken: token
        })
      })

      if (result.newEmails.length > 0) {
        console.log(`[polling/${workflow.id}] Found ${result.newEmails.length} new emails`)
        for (const email of result.newEmails) {
          const normalized = gmailPoller.normalize(email)
          await triggerWorkflow(workflow, normalized)
        }
      }

      // Update cursor
      await supabase
        .from('workflows')
        .update({
          poll_cursor: { history_id: result.newHistoryId },
          last_polled_at: new Date().toISOString()
        })
        .eq('id', workflow.id)
    }

  } catch (err) {
    console.error(`[polling/${workflow.id}] Poll failed:`, err.message)
  }
}

async function triggerWorkflow(workflow, normalizedData) {
  try {
    await axios.post(workflow.webhook_url, normalizedData)
    console.log(`[polling/${workflow.id}] Triggered webhook`)

    await supabase.from('executions').insert({
      user_id: workflow.user_id,
      workflow_id: workflow.id,
      status: 'triggered',
      mode: 'production',
      details: {
        source: 'polling',
        poll_type: workflow.trigger_config?.poll_type
      }
    })
  } catch (err) {
    console.error(`[polling/${workflow.id}] Trigger failed:`, err.message)
  }
}

module.exports = { runPolling }
