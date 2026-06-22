const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

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

app.use('/api/billing', billingRouter)

const PORT = process.env.PORT || 3456
app.listen(PORT, () => {
  console.log(`flowchat backend running on port ${PORT}`)
})

module.exports = app
