const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowchat-backend' })
})

const PORT = process.env.PORT || 3456
app.listen(PORT, () => {
  console.log(`flowchat backend running on port ${PORT}`)
})

module.exports = app
