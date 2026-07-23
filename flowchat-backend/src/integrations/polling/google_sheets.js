const axios = require('axios')

module.exports = {
  // Check for new rows since last poll
  async checkNewRows({ sheetId, sheetTab, lastRow, accessToken }) {
    const range = `${sheetTab}!A:Z`
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const allRows = res.data.values || []
    // Row 1 is headers, data starts at row 2 (index 1)
    // lastRow is 1-indexed count of rows including header
    const newRows = allRows.slice(lastRow) // Everything after last known row

    if (newRows.length === 0) {
      return { newRows: [], newLastRow: lastRow }
    }

    // Get headers from first row
    const headers = allRows[0] || []

    // Convert rows to objects
    const rowObjects = newRows.map((row, i) => {
      const obj = { _row_number: lastRow + i + 1 }
      headers.forEach((header, j) => {
        obj[header] = row[j] || ''
      })
      return obj
    })

    return {
      newRows: rowObjects,
      newLastRow: allRows.length
    }
  },

  // Normalize a sheet row into Flowchat standard format
  normalize(row, headers) {
    return {
      submitted_at: new Date().toISOString(),
      submitter_email: row.Email || row.email || row['Email Address'] || null,
      submitter_name: row.Name || row.name || row['Full Name'] || null,
      column_values: Object.values(row).filter(v => !String(v).startsWith('_')),
      column_headers: headers,
      raw: row
    }
  }
}
