const axios = require('axios')

module.exports = {
  capabilities: ['webhook'],

  // Normalize raw Calendly invitee.created payload
  // into Flowchat standard format
  normalize(payload) {
    const p = payload.payload || payload
    const startTime = p.calendar_event?.start_time || p.scheduled_event?.start_time
    const endTime = p.calendar_event?.end_time || p.scheduled_event?.end_time
    const eventTypeName = p.event_type?.name || p.scheduled_event?.name || ''

    // Extract Q&A answers
    const answers = (p.questions_and_answers || []).map(qa => ({
      question: qa.question,
      answer: qa.answer
    }))

    return {
      event_type: eventTypeName,
      submitted_at: p.created_at || new Date().toISOString(),
      submitter_name: p.name || null,
      submitter_email: p.email || null,
      start_time: startTime || null,
      end_time: endTime || null,
      cancel_url: p.cancel_url || null,
      reschedule_url: p.reschedule_url || null,
      answers,
      column_values: [
        p.name || '',
        p.email || '',
        startTime || '',
        eventTypeName
      ],
      column_headers: [
        'Name',
        'Email',
        'Meeting Time',
        'Event Type'
      ],
      raw: payload
    }
  },

  // Fetch user's event types from Calendly
  // These are what the user selects as "which meeting type triggers this"
  async fetchResources(userId, token) {
    // First get the current user's URI
    const meRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const userUri = meRes.data.resource?.uri
    if (!userUri) throw new Error('Could not get Calendly user URI')

    // Then get their event types
    const res = await axios.get('https://api.calendly.com/event_types', {
      params: { user: userUri, active: true },
      headers: { Authorization: `Bearer ${token}` }
    })

    return (res.data.collection || []).map(et => ({
      id: et.uri,  // Calendly uses URIs as IDs
      title: et.name,
      type: 'event_type',
      slug: et.slug
    }))
  },

  // Calendly does not support historical sync
  // (no API to list past invitees without event URIs)
  async syncHistorical() {
    return []
  },

  // Register webhook subscription with Calendly
  async registerWebhook(userId, resourceId, token, callbackUrl) {
    // Get user URI and org URI first
    const meRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const userUri = meRes.data.resource?.uri
    const orgUri = meRes.data.resource?.current_organization

    await axios.post(
      'https://api.calendly.com/webhook_subscriptions',
      {
        url: callbackUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: orgUri,
        user: userUri,
        scope: 'user'
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
    console.log(`[calendly/${userId}] Webhook registered`)
  },

  // Deregister webhook subscription
  async deregisterWebhook(userId, resourceId, token) {
    // List subscriptions and find the one pointing to our URL
    const meRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const orgUri = meRes.data.resource?.current_organization

    const listRes = await axios.get('https://api.calendly.com/webhook_subscriptions', {
      params: { organization: orgUri, scope: 'user' },
      headers: { Authorization: `Bearer ${token}` }
    })

    const subs = listRes.data.collection || []
    for (const sub of subs) {
      if (sub.callback_url?.includes('flowchat')) {
        await axios.delete(sub.uri, {
          headers: { Authorization: `Bearer ${token}` }
        })
        console.log(`[calendly/${userId}] Webhook deregistered: ${sub.uri}`)
      }
    }
  }
}
