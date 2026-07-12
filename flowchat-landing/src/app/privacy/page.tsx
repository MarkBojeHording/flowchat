import Link from "next/link";
import { SiteHeader } from "@/components/flowchat/site-header";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: June 2026
          </p>
        </div>

        <div className="space-y-8 leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              1. Who we are
            </h2>
            <p className="text-sm">
              Flowchat (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the automation platform at
              flowchat.now. We are the data controller for personal data collected
              through the Service. For data-related enquiries, contact us at{" "}
              <a
                href="mailto:contact@flowchat.now"
                className="text-accent hover:underline"
              >
                contact@flowchat.now
              </a>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              2. Data we collect
            </h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1 font-medium text-foreground">Account data</p>
                <p>
                  Email address, name, and profile information provided during
                  signup or via Google OAuth.
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">
                  OAuth credentials
                </p>
                <p>
                  Access tokens and refresh tokens for connected apps (Google,
                  Slack) required to run your automations. These are encrypted at
                  rest and never shared with third parties beyond what is
                  necessary to execute your workflows.
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">
                  Automation data
                </p>
                <p>
                  Workflow configurations, conversation history with the AI
                  assistant, and execution logs (timestamps, success/failure
                  status).
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">Billing data</p>
                <p>
                  Subscription status and plan information. Payment details are
                  processed and stored by Stripe — we do not store card numbers
                  or payment details.
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">Usage data</p>
                <p>
                  Automation run counts, last active timestamps, and feature
                  usage for service improvement.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              3. How we use your data
            </h2>
            <ul className="ml-4 list-disc space-y-2 text-sm">
              <li>To provide, operate, and maintain the Service</li>
              <li>To authenticate you and manage your account</li>
              <li>To execute your automations on your behalf</li>
              <li>To process payments and manage subscriptions</li>
              <li>
                To send transactional emails (account confirmations, automation
                failure notifications)
              </li>
              <li>To improve the Service and fix technical issues</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p className="mt-3 text-sm">
              Our lawful basis for processing under GDPR is{" "}
              <strong className="text-foreground">contract performance</strong> —
              we process your data to deliver the Service you signed up for.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              4. Third-party processors
            </h2>
            <p className="mb-3 text-sm">
              We use the following third-party services to operate Flowchat. Each
              acts as a data processor under our instruction:
            </p>
            <div className="space-y-3 text-sm">
              {[
                {
                  name: "Supabase",
                  purpose: "Database and authentication",
                  link: "https://supabase.com/privacy",
                },
                {
                  name: "Stripe",
                  purpose: "Payment processing and billing",
                  link: "https://stripe.com/privacy",
                },
                {
                  name: "Google",
                  purpose: "OAuth authentication and Gmail/Sheets integration",
                  link: "https://policies.google.com/privacy",
                },
                {
                  name: "Slack",
                  purpose: "Slack integration for automations",
                  link: "https://slack.com/privacy-policy",
                },
                {
                  name: "Anthropic",
                  purpose:
                    "AI language model for interpreting automation requests",
                  link: "https://www.anthropic.com/privacy",
                },
                {
                  name: "DigitalOcean",
                  purpose: "Cloud infrastructure for workflow execution",
                  link: "https://www.digitalocean.com/legal/privacy-policy",
                },
                {
                  name: "Railway",
                  purpose: "Backend application hosting",
                  link: "https://railway.app/legal/privacy",
                },
                {
                  name: "Vercel",
                  purpose: "Frontend application hosting",
                  link: "https://vercel.com/legal/privacy-policy",
                },
              ].map((p) => (
                <div key={p.name} className="flex gap-3">
                  <span className="w-24 shrink-0 font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="text-muted-foreground">
                    {p.purpose} ·{" "}
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      Privacy policy
                    </a>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              5. Data retention
            </h2>
            <ul className="ml-4 list-disc space-y-2 text-sm">
              <li>Account data is retained while your account is active</li>
              <li>
                Automation data and conversation history is retained for the
                lifetime of your account
              </li>
              <li>Execution logs are retained for 90 days</li>
              <li>
                After account deletion, all personal data is permanently deleted
                within 30 days
              </li>
              <li>
                Billing records may be retained for up to 7 years for legal and
                tax compliance
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              6. Your rights (GDPR)
            </h2>
            <p className="mb-3 text-sm">
              If you are in the EU or UK, you have the following rights:
            </p>
            <ul className="ml-4 list-disc space-y-2 text-sm">
              <li>
                <strong className="text-foreground">Access</strong> — request a
                copy of your personal data
              </li>
              <li>
                <strong className="text-foreground">Rectification</strong> —
                correct inaccurate data
              </li>
              <li>
                <strong className="text-foreground">Erasure</strong> — request
                deletion of your data
              </li>
              <li>
                <strong className="text-foreground">Portability</strong> — receive
                your data in a machine-readable format
              </li>
              <li>
                <strong className="text-foreground">Objection</strong> — object to
                processing of your data
              </li>
              <li>
                <strong className="text-foreground">Restriction</strong> — request
                we limit processing of your data
              </li>
            </ul>
            <p className="mt-3 text-sm">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:contact@flowchat.now"
                className="text-accent hover:underline"
              >
                contact@flowchat.now
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              7. Data security
            </h2>
            <p className="text-sm">
              We implement appropriate technical and organisational measures to
              protect your personal data including encryption at rest and in
              transit, access controls, and regular security reviews. OAuth tokens
              are encrypted and access is restricted to the minimum necessary to
              run your automations. In the event of a data breach affecting your
              personal data, we will notify you within 72 hours as required by
              GDPR.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              8. Cookies
            </h2>
            <p className="text-sm">
              We use only essential cookies required for authentication and
              session management. We do not use tracking or advertising cookies.
              No cookie consent is required for essential cookies under GDPR.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              9. Children
            </h2>
            <p className="text-sm">
              The Service is not directed at children under 16. We do not
              knowingly collect personal data from children. If you believe a
              child has provided us with personal data, please contact us and we
              will delete it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              10. Changes to this policy
            </h2>
            <p className="text-sm">
              We may update this Privacy Policy from time to time. We will notify
              you of significant changes by email. The date at the top of this
              page shows when it was last updated.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              11. Contact
            </h2>
            <p className="text-sm">
              For privacy-related enquiries or to exercise your rights, contact
              us at{" "}
              <a
                href="mailto:contact@flowchat.now"
                className="text-accent hover:underline"
              >
                contact@flowchat.now
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 flex gap-6 border-t border-border pt-8 text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            ← Back to Flowchat
          </Link>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            Terms of Service
          </Link>
          <a
            href="mailto:contact@flowchat.now"
            className="transition-colors hover:text-foreground"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}
