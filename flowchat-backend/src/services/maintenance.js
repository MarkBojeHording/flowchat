const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const ws = require('ws')
const { callWithTokenRefresh } = require('../integrations/core/execute')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const n8nBaseUrl = process.env.N8N_BASE_URL || 'https://n8n.flowchat.now'
const n8nApiKey = process.env.N8N_API_KEY

async function checkAndReactivateWorkflows() {
  console.log('🔧 Maintenance: checking workflow activation status...')

  try {
    const { data: workflows } = await supabase
      .from('workflows')
      .select('id, n8n_workflow_id, auto_name, user_id, status')
      .eq('status', 'active')
      .not('n8n_workflow_id', 'is', null)

    if (!workflows?.length) {
      console.log('No active workflows to check')
      return
    }

    console.log(`Checking ${workflows.length} active workflows...`)

    let reactivated = 0
    let alreadyActive = 0

    for (const workflow of workflows) {
      try {
        const res = await fetch(
          `${n8nBaseUrl}/api/v1/workflows/${workflow.n8n_workflow_id}`,
          { headers: { 'X-N8N-API-KEY': n8nApiKey } }
        )

        if (!res.ok) {
          console.log(`⚠️ Workflow ${workflow.n8n_workflow_id} not found in n8n`)
          continue
        }

        const n8nWorkflow = await res.json()

        if (!n8nWorkflow.active) {
          await fetch(
            `${n8nBaseUrl}/api/v1/workflows/${workflow.n8n_workflow_id}/activate`,
            {
              method: 'POST',
              headers: { 'X-N8N-API-KEY': n8nApiKey },
            }
          )
          console.log(`✅ Reactivated workflow: ${workflow.auto_name}`)
          reactivated++
        } else {
          alreadyActive++
        }
      } catch (err) {
        console.error(`Failed to check workflow ${workflow.n8n_workflow_id}:`, err.message)
      }
    }

    console.log(`✅ Maintenance complete: ${alreadyActive} active, ${reactivated} reactivated`)
  } catch (err) {
    console.error('Maintenance checkAndReactivateWorkflows error:', err)
  }
}

async function refreshGoogleTokens() {
  console.log('🔧 Maintenance: refreshing Google tokens...')

  try {
    const { data: accounts } = await supabase
      .from('platform_accounts')
      .select('user_id, access_token, refresh_token, email')
      .eq('platform', 'google')
      .not('refresh_token', 'is', null)

    if (!accounts?.length) {
      console.log('No Google accounts to refresh')
      return
    }

    console.log(`Refreshing ${accounts.length} Google tokens...`)

    let refreshed = 0
    let failed = 0

    for (const account of accounts) {
      try {
        await callWithTokenRefresh(
          account.user_id,
          'google',
          async (token) => token,
          { refreshBeforeRequest: true }
        )
        refreshed++
      } catch (err) {
        console.error(`Failed to refresh token for ${account.email}:`, err.message)
        failed++
      }
    }

    console.log(`✅ Token refresh complete: ${refreshed} refreshed, ${failed} failed`)
  } catch (err) {
    console.error('Maintenance refreshGoogleTokens error:', err)
  }
}

async function refreshTypeformTokens() {
  console.log('🔧 Maintenance: refreshing Typeform tokens...')

  try {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()

    const { data: accounts } = await supabase
      .from('platform_accounts')
      .select('user_id, access_token, refresh_token, email, updated_at')
      .eq('platform', 'typeform')
      .not('refresh_token', 'is', null)
      .lt('updated_at', sixDaysAgo)

    if (!accounts?.length) {
      console.log('No Typeform accounts need proactive refresh')
      return
    }

    console.log(`Proactively refreshing ${accounts.length} Typeform tokens...`)

    let refreshed = 0
    let failed = 0

    for (const account of accounts) {
      try {
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

        await supabase
          .from('platform_accounts')
          .update({
            access_token: refreshRes.data.access_token,
            refresh_token: refreshRes.data.refresh_token || account.refresh_token,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', account.user_id)
          .eq('platform', 'typeform')

        refreshed++
      } catch (err) {
        console.error(`Failed to refresh Typeform token for ${account.email || account.user_id}:`, err.message)
        failed++
      }
    }

    console.log(`✅ Typeform token refresh complete: ${refreshed} refreshed, ${failed} failed`)
  } catch (err) {
    console.error('Maintenance refreshTypeformTokens error:', err)
  }
}

async function sendDailyDigest() {
  console.log('🔧 Maintenance: generating daily digest...')

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: executions } = await supabase
      .from('executions')
      .select('status, mode')
      .gte('ran_at', yesterday)

    const { data: workflows } = await supabase
      .from('workflows')
      .select('status')

    const { data: userData } = await supabase.auth.admin.listUsers()

    const totalRuns = executions?.length || 0
    const successRuns = executions?.filter((e) => e.status === 'success').length || 0
    const failedRuns = executions?.filter((e) => e.status === 'error').length || 0
    const activeWorkflows = workflows?.filter((w) => w.status === 'active').length || 0
    const brokenWorkflows = workflows?.filter((w) => w.status === 'broken').length || 0
    const totalUsers = userData?.users?.length || 0

    const { Resend } = require('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'Flowchat <notifications@flowchat.now>',
      to: 'contact@flowchat.now',
      subject: `Flowchat Daily Digest — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      html: `
<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
  <h2 style="color:#00d4aa;">⚡ Flowchat Daily Digest</h2>
  <p style="color:#666;">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <tr style="background:#f5f5f5;">
      <td style="padding:10px;font-weight:bold;">Users</td>
      <td style="padding:10px;">${totalUsers}</td>
    </tr>
    <tr>
      <td style="padding:10px;font-weight:bold;">Active workflows</td>
      <td style="padding:10px;">${activeWorkflows}</td>
    </tr>
    <tr style="background:#f5f5f5;">
      <td style="padding:10px;font-weight:bold;">Broken workflows</td>
      <td style="padding:10px;color:${brokenWorkflows > 0 ? 'red' : 'green'}">${brokenWorkflows}</td>
    </tr>
    <tr>
      <td style="padding:10px;font-weight:bold;">Runs (24h)</td>
      <td style="padding:10px;">${totalRuns}</td>
    </tr>
    <tr style="background:#f5f5f5;">
      <td style="padding:10px;font-weight:bold;">Successful runs</td>
      <td style="padding:10px;color:green;">${successRuns}</td>
    </tr>
    <tr>
      <td style="padding:10px;font-weight:bold;">Failed runs</td>
      <td style="padding:10px;color:${failedRuns > 0 ? 'red' : 'green'}">${failedRuns}</td>
    </tr>
  </table>

  <a href="https://flowchat.now/admin" 
     style="display:inline-block;background:#00d4aa;color:#0f0f1a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
    View admin dashboard →
  </a>
</div>
      `,
    })

    console.log('✅ Daily digest sent')
  } catch (err) {
    console.error('Failed to send daily digest:', err)
  }
}

async function runMaintenance() {
  console.log('🔧 Starting daily maintenance...')
  const start = Date.now()

  await checkAndReactivateWorkflows()
  await refreshGoogleTokens()
  await refreshTypeformTokens()
  await sendDailyDigest()

  console.log(`✅ Daily maintenance complete in ${Date.now() - start}ms`)
}

module.exports = {
  runMaintenance,
  checkAndReactivateWorkflows,
  refreshGoogleTokens,
  refreshTypeformTokens,
}
