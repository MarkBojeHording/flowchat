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
  },

  // Find a row by matching a value in a specific column
  async findRow(sheetId, sheetTab, searchColumn, searchValue, accessToken) {
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetTab}!${searchColumn}:${searchColumn}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const values = res.data.values || []
    const rowIndex = values.findIndex(row => row[0] === searchValue)
    return rowIndex === -1 ? null : rowIndex + 1 // 1-indexed
  },

  // Update a specific row by row number
  async updateRow(sheetId, sheetTab, rowNumber, values, accessToken) {
    const range = `${sheetTab}!A${rowNumber}`
    await axios.put(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      { values: [values] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
  },

  // Find and update a row matching a search value
  async findAndUpdateRow(sheetId, sheetTab, searchColumn, searchValue, newValues, accessToken) {
    const rowNumber = await this.findRow(sheetId, sheetTab, searchColumn, searchValue, accessToken)
    if (!rowNumber) return { found: false }
    await this.updateRow(sheetId, sheetTab, rowNumber, newValues, accessToken)
    return { found: true, rowNumber }
  },

  async readRange({ sheetId, range, accessToken }) {
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return res.data.values || []
  },

  async deleteRow({ sheetId, spreadsheetId, sheetGid, rowIndex, accessToken }) {
    const id = spreadsheetId || sheetId
    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,
      {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetGid || 0,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
  },

  async createSpreadsheet({ title, accessToken }) {
    const res = await axios.post(
      'https://sheets.googleapis.com/v4/spreadsheets',
      { properties: { title } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    return { id: res.data.spreadsheetId, title: res.data.properties.title }
  }
}
