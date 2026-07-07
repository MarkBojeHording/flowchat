const typeform = require('./platforms/typeform')

const platforms = { typeform }

function getPlatform(name) {
  const platform = platforms[name]
  if (!platform) throw new Error(`Unknown platform: ${name}`)
  return platform
}

module.exports = { getPlatform, platforms }
