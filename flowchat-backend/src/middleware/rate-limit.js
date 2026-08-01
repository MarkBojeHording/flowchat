const rateLimit = require('express-rate-limit')

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again shortly.' })
  },
}

// Generous app-wide backstop — catches anything not covered by a tighter
// limiter below (mounted globally in server.js, /health is excluded there).
const defaultLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: (req) => req.path === '/health',
})

// Chat/agent endpoints call the Anthropic API on every request — the
// realistic cost of abuse here is real API spend, not just server load.
const chatLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 20,
})

// OAuth connect/callback + credential-fetch flows — legitimate use is
// infrequent (connecting an app once), so this can stay tight.
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 30,
})

// Platform-initiated webhooks (Typeform, Calendly, Stripe). These are hit
// by the platform, not the end user, and may burst legitimately (e.g. many
// users' forms submitting through shared platform infrastructure), so the
// ceiling is high — this is a backstop against a genuine flood, not normal
// traffic shaping. Signature verification (separate) is the real gate.
const webhookLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 120,
})

module.exports = { defaultLimiter, chatLimiter, authLimiter, webhookLimiter }
