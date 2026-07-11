import { Reveal } from "./reveal";

const examples = [
  {
    title: "Save leads automatically",
    desc: "Every form response goes to your spreadsheet and notifies your team.",
    apps: ["Typeform", "Google Sheets", "Slack"],
  },
  {
    title: "Payment notifications",
    desc: "Instant alert and welcome email every time someone pays you.",
    apps: ["Stripe", "Slack", "Gmail"],
  },
  {
    title: "Booking confirmations",
    desc: "Send prep materials automatically when someone books a meeting.",
    apps: ["Calendly", "Gmail"],
  },
  {
    title: "Weekly team reminders",
    desc: "Send your team a message every Friday, completely automatically.",
    apps: ["Schedule", "Slack"],
  },
  {
    title: "Automated reports",
    desc: "Email a performance summary to your team every Monday morning.",
    apps: ["Google Sheets", "Gmail"],
  },
  {
    title: "Client onboarding",
    desc: "Trigger a personalised welcome email when a new client record is added.",
    apps: ["Airtable", "Gmail"],
  },
];

export function ExamplesSection() {
  return (
    <section id="examples" className="border-y border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <Reveal>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            See what&apos;s possible.
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Real automations people set up in minutes.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map((ex, i) => (
            <Reveal key={ex.title} delay={i * 0.07}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold tracking-tight text-foreground">
                  {ex.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {ex.desc}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {ex.apps.map((app, j) => (
                    <span
                      key={app}
                      className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {j > 0 && (
                        <span className="mr-1.5 text-muted-foreground">→</span>
                      )}
                      {app}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1}>
          <p className="mt-10 text-center text-sm text-muted-foreground">
            More automations added every week.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
