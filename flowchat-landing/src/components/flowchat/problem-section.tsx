import { Reveal } from "./reveal";

const pains = [
  {
    title: "Tried Zapier.",
    body: "Got lost in triggers, filters, and setup screens. Closed the tab.",
  },
  {
    title: "Hired someone.",
    body: "Paid a freelancer hundreds of dollars for something that broke a month later.",
  },
  {
    title: "Did it manually.",
    body: "Every. Single. Time. The same copy-paste, week after week after week.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-y border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <Reveal>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            You know it could be automated. You just need someone to do it.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {pains.map((pain, i) => (
            <Reveal key={pain.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-border bg-card p-6">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  {pain.title}
                </h3>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  {pain.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
