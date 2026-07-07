const axios = require('axios')

function extractAnswer(answer) {
  if (!answer) return ''
  switch (answer.type) {
    case 'text': return answer.text || ''
    case 'email': return answer.email || ''
    case 'phone_number': return answer.phone_number || ''
    case 'number': return answer.number != null ? answer.number.toString() : ''
    case 'boolean': return answer.boolean === true ? 'Yes' : answer.boolean === false ? 'No' : ''
    case 'choice': return answer.choice?.label || answer.choice?.other || ''
    case 'choices': return answer.choices?.labels?.join(', ') || answer.choices?.other || ''
    case 'date': return answer.date || ''
    case 'file_url': return answer.file_url || ''
    case 'url': return answer.url || ''
    case 'payment': return answer.payment ? `${answer.payment.amount} ${answer.payment.currency}` : ''
    case 'ranking': return answer.choices?.labels?.join(' > ') || ''
    default:
      return answer.text || answer.email || answer.phone_number ||
        (answer.number != null ? answer.number.toString() : '') ||
        answer.choice?.label || answer.choices?.labels?.join(', ') ||
        answer.date || answer.file_url || answer.url || ''
  }
}

module.exports = {
  capabilities: ['webhook', 'historical_sync'],
  extractAnswer,

  normalize(payload) {
    const response = payload.form_response
    const answers = response?.answers || []
    const answersMap = {}
    for (const answer of answers) {
      answersMap[answer.field.id] = answer
    }
    return {
      form_id: response?.form_id,
      submitted_at: response?.submitted_at,
      submitter_email: answers.find(a => a.type === 'email')?.email || null,
      submitter_name: answers.find(a => a.type === 'text')?.text || null,
      answers_map: answersMap,
      raw: payload
    }
  },

  async fetchResources(userId, token) {
    const res = await axios.get('https://api.typeform.com/forms', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return (res.data.items || []).map(f => ({
      id: f.id,
      title: f.title,
      type: 'form'
    }))
  },

  async fetchFields(resourceId, token) {
    const res = await axios.get(
      `https://api.typeform.com/forms/${resourceId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return (res.data.fields || []).map(f => ({
      id: f.id,
      title: f.title,
      type: f.type
    }))
  },

  async syncHistorical(userId, resourceId, fieldMapping, token) {
    const res = await axios.get(
      `https://api.typeform.com/forms/${resourceId}/responses?page_size=1000`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return (res.data.items || []).map(response => {
      const answersMap = {}
      for (const answer of (response.answers || [])) {
        answersMap[answer.field.id] = answer
      }
      return [
        response.submitted_at || '',
        ...fieldMapping.map(f => extractAnswer(answersMap[f.id]))
      ]
    })
  },

  async registerWebhook(userId, resourceId, token, callbackUrl) {
    const tag = `flowchat-${userId}-${resourceId}`
    await axios.put(
      `https://api.typeform.com/forms/${resourceId}/webhooks/${tag}`,
      { url: callbackUrl, enabled: true, verify_ssl: true },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    console.log(`[typeform/${userId}] Webhook registered for form ${resourceId}`)
  },

  async deregisterWebhook(userId, resourceId, token) {
    const tag = `flowchat-${userId}-${resourceId}`
    await axios.delete(
      `https://api.typeform.com/forms/${resourceId}/webhooks/${tag}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    console.log(`[typeform/${userId}] Webhook deregistered for form ${resourceId}`)
  }
}
