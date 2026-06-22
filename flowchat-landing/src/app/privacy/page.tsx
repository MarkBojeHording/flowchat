'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] px-4 py-16">
      <div className="mx-auto max-w-3xl">
        
        <div className="mb-12">
          <Link href="/" className="text-lg font-bold text-white">
            Flowchat
          </Link>
          <h1 className="mt-8 text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[rgba(255,255,255,0.4)]">
            Last updated: June 2026
          </p>
        </div>

        <div className="space-y-8 text-[rgba(255,255,255,0.7)] leading-relaxed">

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. Who we are</h2>
            <p className="text-sm">
              Flowchat ("we", "us", "our") operates the automation platform at 
              flowchat.now. We are the data controller for personal data collected 
              through the Service. For data-related enquiries, contact us at{' '}
              <a href="mailto:contact@flowchat.now" className="text-[#00d4aa] hover:underline">
                contact@flowchat.now
              </a>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. Data we collect</h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-white mb-1">Account data</p>
                <p>Email address, name, and profile information provided during signup or via Google OAuth.</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">OAuth credentials</p>
                <p>Access tokens and refresh tokens for connected apps (Google, Slack) required to run your automations. These are encrypted at rest and never shared with third parties beyond what is necessary to execute your workflows.</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Automation data</p>
                <p>Workflow configurations, conversation history with the AI assistant, and execution logs (timestamps, success/failure status).</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Billing data</p>
                <p>Subscription status and plan information. Payment details are processed and stored by Stripe — we do not store card numbers or payment details.</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Usage data</p>
                <p>Automation run counts, last active timestamps, and feature usage for service improvement.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. How we use your data</h2>
            <ul className="text-sm space-y-2 ml-4 list-disc">
              <li>To provide, operate, and maintain the Service</li>
              <li>To authenticate you and manage your account</li>
              <li>To execute your automations on your behalf</li>
              <li>To process payments and manage subscriptions</li>
              <li>To send transactional emails (account confirmations, automation failure notifications)</li>
              <li>To improve the Service and fix technical issues</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p className="text-sm mt-3">
              Our lawful basis for processing under GDPR is <strong className="text-white">contract performance</strong> — 
              we process your data to deliver the Service you signed up for.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. Third-party processors</h2>
            <p className="text-sm mb-3">
              We use the following third-party services to operate Flowchat. 
              Each acts as a data processor under our instruction:
            </p>
            <div className="space-y-3 text-sm">
              {[
                { name: 'Supabase', purpose: 'Database and authentication', link: 'https://supabase.com/privacy' },
                { name: 'Stripe', purpose: 'Payment processing and billing', link: 'https://stripe.com/privacy' },
                { name: 'Google', purpose: 'OAuth authentication and Gmail/Sheets integration', link: 'https://policies.google.com/privacy' },
                { name: 'Slack', purpose: 'Slack integration for automations', link: 'https://slack.com/privacy-policy' },
                { name: 'Anthropic', purpose: 'AI language model for interpreting automation requests', link: 'https://www.anthropic.com/privacy' },
                { name: 'DigitalOcean', purpose: 'Cloud infrastructure for workflow execution', link: 'https://www.digitalocean.com/legal/privacy-policy' },
                { name: 'Railway', purpose: 'Backend application hosting', link: 'https://railway.app/legal/privacy' },
                { name: 'Vercel', purpose: 'Frontend application hosting', link: 'https://vercel.com/legal/privacy-policy' },
              ].map(p => (
                <div key={p.name} className="flex gap-3">
                  <span className="font-medium text-white w-24 shrink-0">{p.name}</span>
                  <span className="text-[rgba(255,255,255,0.5)]">{p.purpose} · <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-[#00d4aa] hover:underline">Privacy policy</a></span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Data retention</h2>
            <ul className="text-sm space-y-2 ml-4 list-disc">
              <li>Account data is retained while your account is active</li>
              <li>Automation data and conversation history is retained for the lifetime of your account</li>
              <li>Execution logs are retained for 90 days</li>
              <li>After account deletion, all personal data is permanently deleted within 30 days</li>
              <li>Billing records may be retained for up to 7 years for legal and tax compliance</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. Your rights (GDPR)</h2>
            <p className="text-sm mb-3">
              If you are in the EU or UK, you have the following rights:
            </p>
            <ul className="text-sm space-y-2 ml-4 list-disc">
              <li><strong className="text-white">Access</strong> — request a copy of your personal data</li>
              <li><strong className="text-white">Rectification</strong> — correct inaccurate data</li>
              <li><strong className="text-white">Erasure</strong> — request deletion of your data</li>
              <li><strong className="text-white">Portability</strong> — receive your data in a machine-readable format</li>
              <li><strong className="text-white">Objection</strong> — object to processing of your data</li>
              <li><strong className="text-white">Restriction</strong> — request we limit processing of your data</li>
            </ul>
            <p className="text-sm mt-3">
              To exercise any of these rights, email{' '}
              <a href="mailto:contact@flowchat.now" className="text-[#00d4aa] hover:underline">
                contact@flowchat.now
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. Data security</h2>
            <p className="text-sm">
              We implement appropriate technical and organisational measures to protect 
              your personal data including encryption at rest and in transit, access 
              controls, and regular security reviews. OAuth tokens are encrypted and 
              access is restricted to the minimum necessary to run your automations.
              In the event of a data breach affecting your personal data, we will 
              notify you within 72 hours as required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Cookies</h2>
            <p className="text-sm">
              We use only essential cookies required for authentication and session 
              management. We do not use tracking or advertising cookies. No cookie 
              consent is required for essential cookies under GDPR.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Children</h2>
            <p className="text-sm">
              The Service is not directed at children under 16. We do not knowingly 
              collect personal data from children. If you believe a child has provided 
              us with personal data, please contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Changes to this policy</h2>
            <p className="text-sm">
              We may update this Privacy Policy from time to time. We will notify you 
              of significant changes by email. The date at the top of this page shows 
              when it was last updated.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">11. Contact</h2>
            <p className="text-sm">
              For privacy-related enquiries or to exercise your rights, contact us at{' '}
              <a href="mailto:contact@flowchat.now" className="text-[#00d4aa] hover:underline">
                contact@flowchat.now
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 border-t border-[rgba(255,255,255,0.08)] pt-8 flex gap-6 text-sm text-[rgba(255,255,255,0.4)]">
          <Link href="/" className="hover:text-white transition-colors">← Back to Flowchat</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <a href="mailto:contact@flowchat.now" className="hover:text-white transition-colors">Contact</a>
        </div>

      </div>
    </div>
  )
}
