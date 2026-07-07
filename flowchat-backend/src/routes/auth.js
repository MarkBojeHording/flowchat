const express = require('express')
const router = express.Router()
const { google } = require('googleapis')
const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')
const { sendWelcomeEmail } = require('../services/email')
const { callWithTokenRefresh } = require('../integrations/core/execute')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
)

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.events',
]

router.get('/google/debug', (req, res) => {
  const oauth2Client = getOAuthClient()

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_OAUTH_SCOPES,
    prompt: 'consent'
  })

  res.json({
    url,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...'
  })
})

// Step 1: Redirect user to Google OAuth
router.get('/google', (req, res) => {
  const { userId } = req.query
  const oauth2Client = getOAuthClient()

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_OAUTH_SCOPES,
    prompt: 'consent',
    state: userId || ''
  })

  res.redirect(url)
})

// Step 2: Handle Google OAuth callback
router.get('/callback/google', async (req, res) => {
  const { code, error, state: userId } = req.query

  if (error) {
    return res.status(400).json({ error })
  }

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    const { data: existingAccount } = await supabase
      .from('platform_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'google')
      .single()

    const { error: dbError } = await supabase
      .from('platform_accounts')
      .upsert({
        user_id: userId,
        platform: 'google',
        email: userInfo.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,platform' })

    if (dbError) {
      console.error('❌ Supabase save error:', dbError)
    } else if (!existingAccount) {
      await sendWelcomeEmail({
        email: userInfo.email,
        user_metadata: { full_name: userInfo.name },
      })
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/dashboard?connected=google`)

  } catch (err) {
    console.error('OAuth error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Slack OAuth - Step 1: Redirect to Slack
router.get('/slack', (req, res) => {
  const { userId } = req.query

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    scope: 'chat:write,channels:read,users:read',
    redirect_uri: process.env.SLACK_REDIRECT_URI,
    response_type: 'code',
    state: userId || ''
  })

  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`)
})

// Slack OAuth - Step 2: Handle callback
router.get('/callback/slack', async (req, res) => {
  const { code, error, state: supabaseUserId } = req.query

  if (error) {
    return res.status(400).json({ error })
  }

  try {
    // Exchange code for token
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI
      }
    })

    const data = response.data

    if (!data.ok) {
      throw new Error(data.error)
    }

    const accessToken = data.access_token
    const teamName = data.team?.name

    // Save to Supabase
    const { error: dbError } = await supabase
      .from('platform_accounts')
      .upsert({
        user_id: supabaseUserId,
        platform: 'slack',
        email: teamName,
        access_token: accessToken,
        refresh_token: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,platform' })

    if (dbError) {
      console.error('❌ Supabase save error:', dbError)
    }

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?connected=slack`)

  } catch (err) {
    console.error('Slack OAuth error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/credentials/:userId/:platform', async (req, res) => {
  const { userId, platform } = req.params
  const apiKey = req.headers['x-api-key']

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('access_token, refresh_token, email')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Credentials not found' })
    }

    if (platform === 'google' && data.refresh_token) {
      try {
        const newAccessToken = await callWithTokenRefresh(
          userId,
          'google',
          async (token) => token,
          { refreshBeforeRequest: true }
        )

        return res.json({
          access_token: newAccessToken,
          refresh_token: data.refresh_token,
          email: data.email
        })
      } catch (refreshErr) {
        console.error('❌ Google token refresh failed:', refreshErr.message)
        // Fall through to return existing token
      }
    }

    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      email: data.email
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── TYPEFORM OAUTH ───────────────────────────────────────────

// Step 1: Redirect user to Typeform OAuth
router.get('/typeform', (req, res) => {
  const { userId, formId } = req.query
  const state = Buffer.from(JSON.stringify({ userId, formId })).toString('base64')

  const params = new URLSearchParams({
    client_id: process.env.TYPEFORM_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/callback/typeform`,
    scope: 'offline accounts:read forms:read responses:read webhooks:read webhooks:write workspaces:read',
    state
  })

  res.redirect(`https://api.typeform.com/oauth/authorize?${params.toString()}`)
})

// Step 2: Handle Typeform OAuth callback
router.get('/callback/typeform', async (req, res) => {
  const { code, state, error } = req.query

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=typeform_denied`)
  }

  try {
    const { userId, formId } = JSON.parse(Buffer.from(state, 'base64').toString())

    // Exchange code for tokens
    const tokenRes = await axios.post('https://api.typeform.com/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.TYPEFORM_CLIENT_ID,
        client_secret: process.env.TYPEFORM_CLIENT_SECRET,
        redirect_uri: `${process.env.BACKEND_URL}/api/auth/callback/typeform`
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    const { access_token, refresh_token } = tokenRes.data

    // Get user info
    const meRes = await axios.get('https://api.typeform.com/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    const email = meRes.data.email

    // Save tokens to Supabase
    await supabase.from('platform_accounts').upsert({
      user_id: userId,
      platform: 'typeform',
      email,
      access_token,
      refresh_token: refresh_token || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,platform' })

    console.log(`✅ Typeform OAuth successful for user ${userId}`)

    // If formId passed, register webhook on that form
    if (formId) {
      await registerTypeformWebhook(userId, formId, access_token)
    }

    res.redirect(`${process.env.FRONTEND_URL}/dashboard?typeform=connected`)

  } catch (err) {
    console.error('Typeform OAuth error:', err.response?.data || err.message)
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=typeform_failed`)
  }
})

// Helper: Register webhook on a Typeform form
async function registerTypeformWebhook(userId, formId, accessToken) {
  try {
    const tag = `flowchat-${userId}-${formId}`
    const webhookUrl = `${process.env.BACKEND_URL}/api/integrations/typeform/webhook/${userId}`

    await axios.put(
      `https://api.typeform.com/forms/${formId}/webhooks/${tag}`,
      {
        url: webhookUrl,
        enabled: true,
        verify_ssl: true
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    console.log(`✅ Typeform webhook registered for form ${formId}`)
  } catch (err) {
    console.error('Typeform webhook registration error:', err.response?.data || err.message)
  }
}

module.exports = router
module.exports.registerTypeformWebhook = registerTypeformWebhook
