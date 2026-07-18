const axios = require('axios')

module.exports = {
  // Create a folder in Google Drive
  async createFolder({ name, parentFolderId, accessToken }) {
    const metadata = {
      name: name || 'New Folder',
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentFolderId) {
      metadata.parents = [parentFolderId]
    }
    const res = await axios.post(
      'https://www.googleapis.com/drive/v3/files',
      metadata,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.data
  },

  // Create a Google Doc in Drive with optional text content
  async createDocument({ name, content, parentFolderId, accessToken }) {
    // Use Drive API to create a Google Doc with HTML content
    // This is simpler than the Docs API batchUpdate approach
    const boundary = 'flowchat_boundary'
    const metadata = JSON.stringify({
      name: name || 'New Document',
      mimeType: 'application/vnd.google-apps.document',
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    })

    const body = content
      ? `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/html\r\n\r\n${content}\r\n--${boundary}--`
      : `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}--`

    const res = await axios.post(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
      body,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
      }
    )
    return res.data
  },

  // List folders in Drive (for user to pick a destination)
  async listFolders(accessToken) {
    const res = await axios.get(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&pageSize=20",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    return (res.data.files || []).map((f) => ({
      id: f.id,
      title: f.name,
    }))
  },
}
