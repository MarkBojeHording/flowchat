const axios = require('axios')

module.exports = {
  // Check for new emails since last historyId
  async checkNewEmails({ lastHistoryId, labelIds = ['INBOX'], accessToken }) {
    try {
      if (!lastHistoryId) {
        // First run — get current historyId as starting point
        const profileRes = await axios.get(
          'https://gmail.googleapis.com/gmail/v1/users/me/profile',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        return {
          newEmails: [],
          newHistoryId: profileRes.data.historyId
        }
      }

      const res = await axios.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/history`,
        {
          params: {
            startHistoryId: lastHistoryId,
            historyTypes: 'messageAdded',
            labelId: labelIds[0] || 'INBOX'
          },
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )

      const history = res.data.history || []
      const newHistoryId = res.data.historyId || lastHistoryId
      const messageIds = []

      for (const item of history) {
        for (const msg of (item.messagesAdded || [])) {
          messageIds.push(msg.message.id)
        }
      }

      if (messageIds.length === 0) {
        return { newEmails: [], newHistoryId }
      }

      // Fetch details for each new message
      const emails = await Promise.all(
        messageIds.slice(0, 10).map(id => this.getEmailDetails(id, accessToken))
      )

      return { newEmails: emails.filter(Boolean), newHistoryId }
    } catch (err) {
      if (err.response?.status === 404) {
        // History expired — reset
        const profileRes = await axios.get(
          'https://gmail.googleapis.com/gmail/v1/users/me/profile',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        return { newEmails: [], newHistoryId: profileRes.data.historyId }
      }
      throw err
    }
  },

  async getEmailDetails(messageId, accessToken) {
    try {
      const res = await axios.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          params: { format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] },
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )
      const headers = {}
      for (const h of (res.data.payload?.headers || [])) {
        headers[h.name] = h.value
      }
      return {
        id: messageId,
        from: headers.From || '',
        to: headers.To || '',
        subject: headers.Subject || '',
        date: headers.Date || '',
        snippet: res.data.snippet || ''
      }
    } catch {
      return null
    }
  },

  normalize(email) {
    // Extract email address from "Name <email>" format
    const emailMatch = email.from.match(/<(.+)>/)
    const fromEmail = emailMatch ? emailMatch[1] : email.from
    const fromName = email.from.replace(/<.+>/, '').trim()

    return {
      submitted_at: email.date || new Date().toISOString(),
      submitter_email: fromEmail,
      submitter_name: fromName,
      column_values: [fromEmail, fromName, email.subject, email.snippet],
      column_headers: ['From Email', 'From Name', 'Subject', 'Preview'],
      raw: email
    }
  }
}
