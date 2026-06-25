const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { runMaintenance } = require('./services/maintenance')

dotenv.config()

const app = express()
app.use(cors())

const billingRouter = require('./routes/billing')

// Stripe webhook needs raw body — must be before express.json()
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingRouter.handleWebhook
)

app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowchat-backend' })
})

const authRoutes = require('./routes/auth')
app.use('/api/auth', authRoutes)

const workflowRoutes = require('./routes/workflows')
app.use('/api/workflows', workflowRoutes)

const chatRoutes = require('./routes/chat')
app.use('/api/chat', chatRoutes)

const executionsRouter = require('./routes/executions')
app.use('/api/executions', executionsRouter)

const n8nProxy = require('./routes/n8n-proxy')
app.use('/api/n8n', n8nProxy)

const emailsRouter = require('./routes/emails')
app.use('/api/emails', emailsRouter)

app.use('/api/billing', billingRouter)

const PORT = process.env.PORT || 3456
app.listen(PORT, () => {
  console.log(`flowchat backend running on port ${PORT}`)
})

function scheduleMaintenance() {
  const now = new Date()
  const next2am = new Date()
  next2am.setUTCHours(2, 0, 0, 0)

  if (next2am <= now) {
    next2am.setUTCDate(next2am.getUTCDate() + 1)
  }

  const msUntilNext2am = next2am - now
  console.log(`🔧 Next maintenance scheduled in ${Math.round(msUntilNext2am / 1000 / 60)} minutes`)

  setTimeout(async () => {
    await runMaintenance()
    scheduleMaintenance()
  }, msUntilNext2am)
}

scheduleMaintenance()

module.exports = app
