const express = require('express')
const router = express.Router()
const { google } = require('googleapis')
const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

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
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  console.log('Redirect URI from env:', redirectUri)
  console.log('Raw env:', JSON.stringify(process.env.GOOGLE_REDIRECT_URI))

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

router.get('/google/debug', (req, res) => {
  const oauth2Client = getOAuthClient()

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
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

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
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

    console.log('✅ Google OAuth successful for user:', userId)

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
    } else {
      console.log('✅ Google tokens saved for Supabase user:', userId)
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
    const slackUserId = data.authed_user?.id

    console.log('✅ Slack OAuth successful')
    console.log('Team:', teamName)
    console.log('Slack user ID:', slackUserId)
    console.log('Supabase user ID:', supabaseUserId)

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
    } else {
      console.log('✅ Slack tokens saved to Supabase')
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

    // For Google: automatically refresh the token
    if (platform === 'google' && data.refresh_token) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        )
        oauth2Client.setCredentials({
          refresh_token: data.refresh_token
        })

        const { credentials } = await oauth2Client.refreshAccessToken()
        const newAccessToken = credentials.access_token

        // Save the new token to Supabase
        await supabase
          .from('platform_accounts')
          .update({
            access_token: newAccessToken,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('platform', platform)

        console.log('✅ Google token refreshed for user:', userId)

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

module.exports = router
