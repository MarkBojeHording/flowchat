const axios = require('axios')

module.exports = {
  async sendEmail({ to, subject, body, html, accessToken }) {
    // Build email with HTML support
    const isHtml = html || (body && body.includes('<'))
    const contentType = isHtml ? 'text/html' : 'text/plain'
    const content = html || body || ''

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      'MIME-Version: 1.0',
      '',
      content
    ].join('\n')

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: encoded },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  },

  async createDraft({ to, subject, body, html, accessToken }) {
    const contentType = html ? 'text/html' : 'text/plain'
    const content = html || body || ''
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      'MIME-Version: 1.0',
      '',
      content
    ].join('\n')
    const encoded = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const res = await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      { message: { raw: encoded } },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return res.data
  },

  async addLabel({ messageId, labelIds, accessToken }) {
    const res = await axios.post(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      { addLabelIds: labelIds },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return res.data
  },

  async listLabels(accessToken) {
    const res = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/labels',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return (res.data.labels || [])
      .filter(l => l.type === 'user') // only user-created labels
      .map(l => ({ id: l.id, title: l.name }))
  },

  async searchMessages({ query, maxResults = 10, accessToken }) {
    const res = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        params: { q: query, maxResults },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return res.data.messages || []
  },

  async replyToEmail({ threadId, messageId, to, subject, body, accessToken }) {
    const message = [
      `To: ${to}`,
      `Subject: Re: ${subject.replace(/^Re: /i, '')}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      `Thread-Id: ${threadId}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ].join('\n')
    const encoded = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: encoded, threadId },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  }
}
