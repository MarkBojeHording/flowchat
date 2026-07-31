const axios = require('axios')

module.exports = {
  capabilities: ['webhook'],

  normalize(payload) {
    const p = payload.payload || payload
    const startTime = p.scheduled_event?.start_time || p.calendar_event?.start_time
    const endTime = p.scheduled_event?.end_time || p.calendar_event?.end_time
    const eventTypeName = p.scheduled_event?.name || p.event_type?.name || ''
    // Event type URI used by webhook receiver to match trigger_config.form_id
    const eventTypeUri =
      p.scheduled_event?.event_type ||
      p.event_type?.uri ||
      null
    const answers = (p.questions_and_answers || [])
      .map((qa) => `${qa.question}: ${qa.answer}`)
      .join('; ')

    return {
      event_type: eventTypeName,
      form_id: eventTypeUri,
      submitted_at: p.created_at || new Date().toISOString(),
      submitter_name: p.name || null,
      submitter_email: p.email || null,
      start_time: startTime || null,
      end_time: endTime || null,
      column_values: [
        p.name || '',
        p.email || '',
        startTime || '',
        eventTypeName,
        answers,
      ],
      column_headers: ['Name', 'Email', 'Meeting Time', 'Event Type', 'Answers'],
      raw: payload,
    }
  },

  async fetchResources(userId, token) {
    const meRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const userUri = meRes.data.resource.uri
    const res = await axios.get('https://api.calendly.com/event_types', {
      params: { user: userUri, active: true },
      headers: { Authorization: `Bearer ${token}` },
    })
    return (res.data.collection || []).map((et) => ({
      id: et.uri,
      title: et.name,
      type: 'event_type',
    }))
  },

  async syncHistorical() {
    return []
  },

  async registerWebhook(userId, resourceUri, token, callbackUrl, orgUri, userUri) {
    try {
      let resolvedOrgUri = orgUri
      let resolvedUserUri = userUri

      if (!resolvedOrgUri || !resolvedUserUri) {
        const meRes = await axios.get('https://api.calendly.com/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        resolvedUserUri = resolvedUserUri || meRes.data.resource?.uri
        resolvedOrgUri = resolvedOrgUri || meRes.data.resource?.current_organization
      }

      const res = await axios.post(
        'https://api.calendly.com/webhook_subscriptions',
        {
          url: callbackUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: resolvedOrgUri,
          user: resolvedUserUri,
          scope: 'user',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      return { webhook_uri: res.data.resource.uri }
    } catch (err) {
      if (err.response?.status === 403) {
        const paidPlanError = new Error(
          'Calendly webhooks require a paid Calendly plan'
        )
        paidPlanError.type = 'requires_paid_plan'
        paidPlanError.message =
          'Calendly webhooks require a paid Calendly plan'
        throw paidPlanError
      }
      throw err
    }
  },

  async deregisterWebhook(userId, webhookUri, token) {
    if (webhookUri) {
      await axios.delete(webhookUri, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return
    }

    // Fallback: list and delete Flowchat subscriptions
    const meRes = await axios.get('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const orgUri = meRes.data.resource?.current_organization

    const listRes = await axios.get(
      'https://api.calendly.com/webhook_subscriptions',
      {
        params: { organization: orgUri, scope: 'user' },
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    const subs = listRes.data.collection || []
    for (const sub of subs) {
      if (sub.callback_url?.includes('flowchat')) {
        await axios.delete(sub.uri, {
          headers: { Authorization: `Bearer ${token}` },
        })
        console.log(`[calendly/${userId}] Webhook deregistered: ${sub.uri}`)
      }
    }
  },
}
