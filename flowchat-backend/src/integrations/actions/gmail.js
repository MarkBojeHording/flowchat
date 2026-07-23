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
  }
}
