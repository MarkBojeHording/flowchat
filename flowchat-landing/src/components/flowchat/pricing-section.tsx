import { Check } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "1 active automation",
      "50 runs per month",
      "Core apps included",
      "Community support",
    ],
    cta: "Start for free",
    href: "/dashboard",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "/mo",
    features: [
      "Unlimited automations",
      "2,000 runs per month",
      "All apps included",
      "Priority email support",
      "Auto-fix when apps change",
    ],
    cta: "Start Pro",
    href: "/dashboard",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$49.99",
    period: "/mo",
    features: [
      "Everything in Pro",
      "10,000 runs per month",
      "Up to 3 teammates",
      "Shared workspace",
      "Onboarding call",
    ],
    cta: "Start Business",
    href: "/dashboard",
    highlighted: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          Simple pricing. No feature padding.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {tiers.map((tier, i) => (
          <Reveal key={tier.name} delay={i * 0.1}>
            <div
              className={`flex h-full flex-col rounded-2xl border p-7 ${tier.highlighted ? "border-gold bg-card shadow-xl shadow-gold/10" : "border-border bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">
                  {tier.name}
                </h3>
                {tier.highlighted && (
                  <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-semibold text-gold-foreground">
                    Most popular
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tier.period}
                </span>
              </div>
              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-gold"
                      strokeWidth={2.5}
                    />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={`mt-7 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${tier.highlighted ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-secondary"}`}
              >
                {tier.cta}
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.1}>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Need more runs? Top up any plan with extra runs whenever you need
          them.
        </p>
      </Reveal>
    </section>
  );
}
