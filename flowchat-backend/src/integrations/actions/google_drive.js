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

  // Share a file or folder with a specific email address
  async shareFile({ fileId, email, role = 'reader', sendNotification = true, accessToken }) {
    const res = await axios.post(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        type: 'user',
        role: role, // 'reader', 'writer', or 'commenter'
        emailAddress: email
      },
      {
        params: { sendNotificationEmail: sendNotification },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return res.data
  },

  async listFiles({ folderId, mimeType, maxResults = 20, accessToken }) {
    let query = 'trashed=false'
    if (folderId) query += ` and '${folderId}' in parents`
    if (mimeType) query += ` and mimeType='${mimeType}'`

    const res = await axios.get(
      `https://www.googleapis.com/drive/v3/files`,
      {
        params: { q: query, pageSize: maxResults, fields: 'files(id,name,mimeType,webViewLink)' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return (res.data.files || []).map(f => ({
      id: f.id,
      title: f.name,
      type: f.mimeType,
      url: f.webViewLink
    }))
  },

  async moveFile({ fileId, newFolderId, accessToken }) {
    // Get current parents first
    const fileRes = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        params: { fields: 'parents' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    const currentParents = (fileRes.data.parents || []).join(',')

    await axios.patch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {},
      {
        params: {
          addParents: newFolderId,
          removeParents: currentParents,
          fields: 'id,parents'
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
  },

  async deleteFile({ fileId, accessToken }) {
    await axios.delete(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  }
}
