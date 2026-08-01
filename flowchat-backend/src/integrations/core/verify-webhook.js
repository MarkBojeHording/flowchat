const crypto = require('crypto')

function safeCompare(a, b) {
  const bufA = Buffer.from(a || '', 'utf8')
  const bufB = Buffer.from(b || '', 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Typeform signs the raw body with the secret set on the webhook subscription,
// sent as `Typeform-Signature: sha256=<base64 hmac>`
function verifyTypeformSignature(rawBody, signatureHeader, secret) {
  if (!secret) return { valid: false, reason: 'no_secret_stored' }
  if (!signatureHeader) return { valid: false, reason: 'missing_header' }

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  if (!safeCompare(signatureHeader, expected)) return { valid: false, reason: 'bad_signature' }
  return { valid: true }
}

// Calendly signs `${t}.${rawBody}` with the subscription's signing_key, sent as
// `Calendly-Webhook-Signature: t=<unix ts>,v1=<hex hmac>`. A valid signature
// outside the tolerance window is treated as expired, not as a bad signature —
// callers should log the two cases differently.
function verifyCalendlySignature(rawBody, signatureHeader, signingKey, toleranceSec = 300) {
  if (!signingKey) return { valid: false, reason: 'no_secret_stored' }
  if (!signatureHeader) return { valid: false, reason: 'missing_header' }

  const parts = {}
  for (const kv of signatureHeader.split(',')) {
    const [key, value] = kv.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  }
  const { t, v1 } = parts
  if (!t || !v1) return { valid: false, reason: 'malformed_header' }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${t}.${rawBody.toString('utf8')}`)
    .digest('hex')

  if (!safeCompare(v1, expected)) return { valid: false, reason: 'bad_signature' }

  const ageSec = Math.abs(Date.now() / 1000 - Number(t))
  if (ageSec > toleranceSec) {
    return { valid: false, reason: 'expired', ageSec: Math.round(ageSec) }
  }

  return { valid: true }
}

module.exports = { verifyTypeformSignature, verifyCalendlySignature }
