const axios = require('axios')

module.exports = {
  async sendMessage({ channel, text, accessToken }) {
    await axios.post(
      'https://slack.com/api/chat.postMessage',
      { channel, text },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  }
}
