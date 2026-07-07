module.exports = {
  async poll(platform, userId, resourceId, cursor) {
    throw new Error(`Polling not yet implemented for ${platform}`)
  }
}
