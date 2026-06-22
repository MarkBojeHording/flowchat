const { Resend } = require('resend')
const Anthropic = require('@anthropic-ai/sdk')

const resend = new Resend(process.env.RESEND_API_KEY)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FROM_EMAIL = 'Flowchat <notifications@flowchat.now>'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://flowchat.now'

const FIX_ACTIONS = {
  reconnect: { label: 'Reconnect and fix →', description: 'reconnect their app' },
  chat: { label: 'Fix this automation →', description: 'chat with Flowchat to fix it' },
  auto_retry: null,
  contact: { label: 'Contact support →', description: 'contact support' },
}

async function generateErrorEmailContent(
  automationName,
  errorMessage,
  lastNodeExecuted,
  classificationType,
  fixAction
) {
  const prompt = `You are writing a plain English email notification for a non-technical user whose automation has stopped working.

Automation name: "${automationName}"
Failed app/node: "${lastNodeExecuted}"
Error type: ${classificationType}
Raw error: "${errorMessage}"
How to fix: User needs to ${FIX_ACTIONS[fixAction]?.description || 'contact support'}

Write a SHORT email with:
1. subject: One clear sentence subject line (max 60 chars)
2. heading: One line explaining what went wrong (max 80 chars)  
3. body: 2-3 sentences in plain English. No technical jargon. No error codes. Explain what happened and why. Be reassuring — this is fixable.

Rules:
- Never mention HTTP status codes, stack traces, or technical terms
- Write as if explaining to a non-technical small business owner
- Be warm and reassuring, not alarming
- Keep it short — users scan emails

Return ONLY valid JSON with exactly these fields:
{
  "subject": "...",
  "heading": "...",
  "body": "..."
}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].text.trim()
  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

async function sendBrokenAutomationEmail(user, workflow, classification) {
  const fixUrl = `${FRONTEND_URL}/dashboard?fix=${workflow.id}`
  const fixAction = classification.fixAction || 'chat'

  if (fixAction === 'auto_retry') return

  try {
    const content = await generateErrorEmailContent(
      workflow.auto_name || workflow.name || 'Your automation',
      workflow.last_error_message || 'Unknown error',
      classification.appName || 'connected app',
      classification.type,
      fixAction
    )

    const ctaLabel = FIX_ACTIONS[fixAction]?.label || 'Fix this automation →'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;">⚡ Flowchat</span>
    </div>

    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:32px;">
      
      <div style="width:44px;height:44px;background:rgba(251,191,36,0.1);border-radius:12px;text-align:center;line-height:44px;margin-bottom:20px;font-size:22px;">
        ⚠️
      </div>

      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#e8e8f0;letter-spacing:-0.02em;">
        ${content.heading}
      </h1>
      
      <p style="margin:0 0 6px;font-size:13px;color:#8888aa;">
        Automation: <strong style="color:#e8e8f0;">${workflow.auto_name || workflow.name}</strong>
      </p>
      
      <p style="margin:0 0 24px;font-size:14px;color:#8888aa;line-height:1.6;">
        ${content.body}
      </p>

      <a href="${fixUrl}" 
         style="display:inline-block;background:#00d4aa;color:#0f0f1a;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;">
        ${ctaLabel}
      </a>

      <p style="margin:20px 0 0;font-size:12px;color:#8888aa;">
        Flowchat will guide you through fixing this in about 30 seconds.
      </p>
    </div>

    <div style="margin-top:24px;text-align:center;">
      <p style="font-size:12px;color:#4a4a6a;margin:0;">
        You're receiving this because one of your Flowchat automations needs attention.
        <br>
        <a href="${FRONTEND_URL}/dashboard" style="color:#8888aa;">Go to dashboard</a>
        &nbsp;·&nbsp;
        <a href="mailto:contact@flowchat.now" style="color:#8888aa;">Contact support</a>
      </p>
    </div>

  </div>
</body>
</html>`

    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: content.subject,
      html,
    })

    console.log('✅ Error notification email sent to:', user.email)
  } catch (err) {
    console.error('Failed to send broken automation email:', err)
  }
}

async function sendWelcomeEmail(user) {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`
  const firstName = user.user_metadata?.full_name?.split(' ')[0] || 'there'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;">⚡ Flowchat</span>
    </div>

    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:32px;">
      
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#e8e8f0;">
        Welcome to Flowchat, ${firstName} 👋
      </h1>
      
      <p style="margin:0 0 16px;font-size:14px;color:#8888aa;line-height:1.6;">
        You're all set. Just describe what you want to automate in plain English 
        and Flowchat will build it and run it 24/7.
      </p>

      <p style="margin:0 0 24px;font-size:14px;color:#8888aa;line-height:1.6;">
        Try starting with: <em style="color:#e8e8f0;">"Every Monday at 9am, send a reminder to my Slack channel."</em>
      </p>

      <a href="${dashboardUrl}" 
         style="display:inline-block;background:#00d4aa;color:#0f0f1a;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;">
        Start automating →
      </a>
    </div>

    <div style="margin-top:24px;text-align:center;">
      <p style="font-size:12px;color:#4a4a6a;margin:0;">
        Questions? Reply to this email or contact us at
        <a href="mailto:contact@flowchat.now" style="color:#8888aa;">contact@flowchat.now</a>
      </p>
    </div>

  </div>
</body>
</html>`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: "Welcome to Flowchat — let's build your first automation",
      html,
    })
    console.log('✅ Welcome email sent to:', user.email)
  } catch (err) {
    console.error('Failed to send welcome email:', err)
  }
}

module.exports = { sendBrokenAutomationEmail, sendWelcomeEmail }
