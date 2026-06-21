'use strict'

const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const PRICE_IDS = {
  pro: 'price_1TkdziBlSxDq6QCNm7XWJHmn',
  business: 'price_1Tke0ABlSxDq6QCNkE18bHvt',
  topup_1000: 'price_1Tke0ZBlSxDq6QCNMPc7oQXP',
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

router.post('/checkout', async (req, res) => {
  const { userId, plan } = req.body

  if (!userId || !plan) {
    return res.status(400).json({ error: 'userId and plan required' })
  }

  try {
    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      const email = userData?.user?.email

      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    const isSubscription = plan === 'pro' || plan === 'business'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${FRONTEND_URL}/dashboard?checkout=success&plan=${plan}`,
      cancel_url: `${FRONTEND_URL}/dashboard?checkout=cancelled`,
      metadata: {
        userId,
        plan,
      },
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    res.status(500).json({ error: err.message })
  }
})

async function handleWebhook(req, res) {
  console.log('Webhook received')
  console.log('Content-Type:', req.headers['content-type'])
  console.log('Stripe-Signature header present:', !!req.headers['stripe-signature'])
  console.log('Body type:', typeof req.body)
  console.log('Body is Buffer:', Buffer.isBuffer(req.body))
  console.log('Body length:', req.body?.length)
  console.log('STRIPE_WEBHOOK_SECRET set:', !!process.env.STRIPE_WEBHOOK_SECRET)
  console.log(
    'STRIPE_WEBHOOK_SECRET starts with:',
    process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10)
  )

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).json({ error: err.message })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan

        if (!userId) break

        if (plan === 'topup_1000') {
          await supabase.rpc('add_runs', {
            user_id_input: userId,
            runs_to_add: 1000,
          })
          console.log('✅ Top-up added for user:', userId)
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) break

        const priceId = subscription.items.data[0]?.price?.id
        let newPlan = 'free'
        if (priceId === PRICE_IDS.pro) newPlan = 'pro'
        if (priceId === PRICE_IDS.business) newPlan = 'business'

        await supabase
          .from('profiles')
          .update({
            plan_id: newPlan,
            stripe_subscription_id: subscription.id,
          })
          .eq('id', profile.id)

        console.log('✅ Plan updated to', newPlan, 'for user:', profile.id)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) break

        await supabase
          .from('profiles')
          .update({
            plan_id: 'free',
            stripe_subscription_id: null,
          })
          .eq('id', profile.id)

        console.log('✅ Downgraded to free for user:', profile.id)
        break
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    res.status(500).json({ error: err.message })
  }
}

router.post('/portal', async (req, res) => {
  const { userId } = req.body

  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return res.status(404).json({ error: 'No billing account found' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${FRONTEND_URL}/dashboard`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Portal error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
module.exports.handleWebhook = handleWebhook
