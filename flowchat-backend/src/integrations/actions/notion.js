const axios = require('axios')

const NOTION_VERSION = '2022-06-28'

module.exports = {
  // Create a new row in a Notion database
  async createRow(databaseId, properties, accessToken) {
    const res = await axios.post(
      'https://api.notion.com/v1/pages',
      {
        parent: { database_id: databaseId },
        properties,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.data
  },

  // List databases the user has shared with Flowchat
  async listDatabases(accessToken) {
    const res = await axios.post(
      'https://api.notion.com/v1/search',
      {
        filter: { value: 'database', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
      }
    )
    return (res.data.results || []).map((db) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled',
      url: db.url,
    }))
  },

  // Get database schema (column names and types)
  async getDatabaseSchema(databaseId, accessToken) {
    const res = await axios.get(
      `https://api.notion.com/v1/databases/${databaseId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': NOTION_VERSION,
        },
      }
    )
    const properties = res.data.properties || {}
    return Object.entries(properties).map(([name, prop]) => ({
      name,
      type: prop.type,
      id: prop.id,
    }))
  },

  // Build Notion properties object from field mapping
  buildProperties(fieldMapping, values) {
    const properties = {}
    for (const field of fieldMapping) {
      const value = values[field.sourceField] || ''
      switch (field.notionType) {
        case 'title':
          properties[field.notionColumn] = {
            title: [{ text: { content: String(value) } }],
          }
          break
        case 'email':
          properties[field.notionColumn] = { email: value || null }
          break
        case 'phone_number':
          properties[field.notionColumn] = { phone_number: value || null }
          break
        case 'rich_text':
          properties[field.notionColumn] = {
            rich_text: [{ text: { content: String(value) } }],
          }
          break
        case 'number':
          properties[field.notionColumn] = { number: parseFloat(value) || null }
          break
        case 'url':
          properties[field.notionColumn] = { url: value || null }
          break
        case 'date':
          properties[field.notionColumn] = value
            ? { date: { start: value } }
            : null
          break
        case 'select':
          properties[field.notionColumn] = value
            ? { select: { name: value } }
            : null
          break
        default:
          properties[field.notionColumn] = {
            rich_text: [{ text: { content: String(value) } }],
          }
      }
    }
    return properties
  },
}
