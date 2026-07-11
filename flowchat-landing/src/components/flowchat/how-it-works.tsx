import { MessageSquare, Wand2, Infinity as InfinityIcon } from "lucide-react";
import { Reveal } from "./reveal";

const stepsMeta = [
  {
    n: "01",
    icon: MessageSquare,
    title: "Describe it",
    body: "Type what you want in plain English, like you're texting a capable assistant. No triggers, no flowcharts.",
  },
  {
    n: "02",
    icon: Wand2,
    title: "We build it",
    body: "Flowchat connects your apps and wires up the whole automation for you — instantly, in the background.",
  },
  {
    n: "03",
    icon: InfinityIcon,
    title: "It runs forever",
    body: "24/7, no maintenance, no touching. If something changes, Flowchat keeps it working — so you never think about it again.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          Three steps. Then it runs forever.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {stepsMeta.map((step, i) => {
          const Icon = step.icon;
          return (
            <Reveal key={step.n} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                    <Icon size={18} className="text-foreground" />
                  </span>
                  <span className="font-serif text-2xl italic text-muted-foreground/60">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 flex-1 text-pretty leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
