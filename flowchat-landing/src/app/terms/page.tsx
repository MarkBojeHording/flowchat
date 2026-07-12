import Link from "next/link";
import { SiteHeader } from "@/components/flowchat/site-header";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-foreground">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: June 2026
          </p>
        </div>

        <div className="space-y-8 leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              1. Agreement to Terms
            </h2>
            <p className="text-sm">
              By accessing or using Flowchat (&quot;the Service&quot;), you agree to be
              bound by these Terms of Service. If you do not agree, please do not
              use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              2. Description of Service
            </h2>
            <p className="text-sm">
              Flowchat is an automation platform that allows users to create,
              manage, and run automated workflows connecting third-party
              applications through a natural language chat interface.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              3. Account Registration
            </h2>
            <p className="text-sm">
              You must create an account to use the Service. You are responsible
              for maintaining the security of your account and all activities
              that occur under it. You must provide accurate information when
              registering.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              4. Subscription and Billing
            </h2>
            <p className="mb-3 text-sm">Flowchat offers the following plans:</p>
            <ul className="mb-3 ml-4 list-disc space-y-1 text-sm">
              <li>
                <strong className="text-foreground">Free:</strong> 1 active
                automation, 50 runs/month
              </li>
              <li>
                <strong className="text-foreground">Pro ($19.99/month):</strong>{" "}
                Unlimited automations, 2,000 runs/month
              </li>
              <li>
                <strong className="text-foreground">
                  Business ($49.99/month):
                </strong>{" "}
                Unlimited automations, 10,000 runs/month, 3 team seats
              </li>
            </ul>
            <p className="text-sm">
              Subscriptions are billed monthly. You may cancel at any time and
              retain access until the end of your billing period. We do not offer
              refunds for partial months. We reserve the right to change pricing
              with 30 days notice.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              5. Acceptable Use
            </h2>
            <p className="mb-2 text-sm">You agree not to use the Service to:</p>
            <ul className="ml-4 list-disc space-y-1 text-sm">
              <li>Violate any applicable laws or regulations</li>
              <li>Send spam or unsolicited communications</li>
              <li>Infringe intellectual property rights</li>
              <li>Attempt to gain unauthorised access to any systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use the Service for harmful or malicious purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              6. Third-Party Integrations
            </h2>
            <p className="text-sm">
              The Service connects to third-party applications. Your use of these
              integrations is subject to those services&apos; own terms and privacy
              policies. We are not responsible for third-party service actions or
              content.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              7. Data and Privacy
            </h2>
            <p className="text-sm">
              Your use of the Service is governed by our{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </Link>
              , incorporated into these Terms. We process your data as a data
              controller under GDPR where applicable.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              8. Service Availability
            </h2>
            <p className="text-sm">
              We strive for high availability but do not guarantee uninterrupted
              access. We may perform maintenance that temporarily affects
              availability and will provide advance notice where possible.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              9. Intellectual Property
            </h2>
            <p className="text-sm">
              The Service and its content are owned by Flowchat and protected by
              intellectual property laws. You retain ownership of data you create
              through the Service. You grant us a limited licence to process your
              data solely to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              10. Limitation of Liability
            </h2>
            <p className="text-sm">
              To the maximum extent permitted by law, Flowchat shall not be
              liable for indirect, incidental, special, or consequential damages.
              Our total liability shall not exceed the amount you paid us in the
              three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              11. Termination
            </h2>
            <p className="text-sm">
              We may suspend or terminate your account for violation of these
              Terms. You may terminate at any time by cancelling your
              subscription. Upon termination, your automations will stop and data
              deleted after 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              12. Governing Law
            </h2>
            <p className="text-sm">
              These Terms are governed by applicable law. Any disputes will be
              resolved through good faith negotiation before any formal
              proceedings.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              13. Changes to Terms
            </h2>
            <p className="text-sm">
              We may update these Terms with 30 days notice for material changes.
              Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              14. Contact
            </h2>
            <p className="text-sm">
              Questions about these Terms:{" "}
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
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy Policy
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
