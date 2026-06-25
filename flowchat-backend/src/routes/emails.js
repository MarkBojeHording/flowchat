const express = require('express')
const router = express.Router()
const { sendWelcomeEmail } = require('../services/email')

router.post('/welcome', async (req, res) => {
  const { userId, email, name } = req.body
  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email required' })
  }

  try {
    await sendWelcomeEmail({
      email,
      user_metadata: { full_name: name }
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Welcome email error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
