const axios = require('axios')

module.exports = {
  async appendRow(sheetId, sheetTab, row, accessToken) {
    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetTab}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values: [row] },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
  },

  async writeHeaders(sheetId, sheetTab, headers, accessToken) {
    await axios.put(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetTab}!A1?valueInputOption=USER_ENTERED`,
      { values: [headers] },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
  },

  async getTabs(sheetId, accessToken) {
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
      {
        params: { fields: 'sheets.properties.title' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return (res.data.sheets || []).map(s => s.properties.title)
  }
}
