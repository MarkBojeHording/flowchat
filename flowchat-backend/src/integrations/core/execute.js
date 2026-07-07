const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const ws = require('ws')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

function isUnauthorizedError(err) {
  return err?.response?.status === 401
}

async function refreshGoogleAccessToken(userId, refreshToken) {
  console.log('Refreshing Google token...')

  const refreshRes = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const accessToken = refreshRes.data.access_token

  await supabase
    .from('platform_accounts')
    .update({
      access_token: accessToken,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'google')

  console.log('✅ Google token refreshed successfully')
  return accessToken
}

async function callWithTokenRefresh(userId, platform, requestFn, options = {}) {
  const { refreshBeforeRequest = false } = options

  const { data: account, error } = await supabase
    .from('platform_accounts')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single()

  if (error || !account) {
    const err = new Error(`${platform} account not connected`)
    err.code = 'NOT_CONNECTED'
    throw err
  }

  let accessToken = account.access_token

  if (refreshBeforeRequest && platform === 'google' && account.refresh_token) {
    accessToken = await refreshGoogleAccessToken(userId, account.refresh_token)
    return await requestFn(accessToken)
  }

  try {
    return await requestFn(accessToken)
  } catch (err) {
    if (!isUnauthorizedError(err) || !account.refresh_token) {
      throw err
    }

    if (platform !== 'google') {
      throw err
    }

    accessToken = await refreshGoogleAccessToken(userId, account.refresh_token)
    return await requestFn(accessToken)
  }
}

module.exports = { callWithTokenRefresh }
