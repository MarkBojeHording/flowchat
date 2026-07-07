const axios = require('axios')

module.exports = {
  async sendEmail({ to, subject, body, accessToken }) {
    const message = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain', '', body].join('\n')
    const encoded = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: encoded },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  }
}
