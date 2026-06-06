"use client";

import { FormEvent, Fragment, useCallback, useEffect, useState } from "react";

const WAITLIST_KEY = "flowchat-waitlist";

const PLACEHOLDER_EXAMPLES = [
  "When someone fills my Typeform, add them to Google Sheets and notify my Slack...",
  "When I get a new Stripe payment, send a welcome email via Gmail...",
  "Every time a new row is added to Google Sheets, create a Notion page...",
];

const APP_PILLS = [
  { emoji: "📋", label: "Typeform" },
  { emoji: "📧", label: "Gmail" },
  { emoji: "📊", label: "Sheets" },
  { emoji: "💬", label: "Slack" },
  { emoji: "📝", label: "Notion" },
  { emoji: "🗃️", label: "Airtable" },
];

type DemoMessage = {
  role: "user" | "assistant";
  content: string;
  buildingMs?: number;
};

const DEMO_MESSAGES: DemoMessage[] = [
  {
    role: "user",
    content:
      "When someone fills my Typeform contact form, add them to Google Sheets and send my team a Slack message",
  },
  {
    role: "assistant",
    buildingMs: 1000,
    content: `✅ Automation created! Here's what will happen:

▸ Trigger: New Typeform response
▸ Add row to Google Sheets (tab: Contacts)
▸ Send Slack message to #team-leads

Your automation is live. Want to add anything else?`,
  },
  {
    role: "user",
    content: "Also send them a confirmation email from Gmail",
  },
  {
    role: "assistant",
    buildingMs: 1000,
    content:
      "✅ Added! Gmail confirmation email is now part of your automation. It will send automatically to every new respondent.",
  },
];

const STEPS = [
  {
    title: "Describe it",
    description:
      "Type what you want to automate in plain English. No technical terms needed.",
  },
  {
    title: "We build it",
    description:
      "Our AI understands your request and sets up the automation instantly.",
  },
  {
    title: "It runs forever",
    description:
      "Your automation runs in the background 24/7. Change or fix it anytime by chatting.",
  },
];

function getWaitlistCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const stored = localStorage.getItem(WAITLIST_KEY);
    if (!stored) return 0;
    const emails = JSON.parse(stored) as string[];
    return Array.isArray(emails) ? emails.length : 0;
  } catch {
    return 0;
  }
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function BuildingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function HeroChatInput() {
  const [value, setValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
        setPlaceholderVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto mt-12 w-full max-w-2xl">
      <div className="rounded-2xl bg-gradient-to-r from-green-400 to-emerald-600 p-[1px] shadow-2xl">
        <div className="overflow-hidden rounded-2xl bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-400">
            Describe your automation
          </p>
          <div className="relative">
            <textarea
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none"
            />
            {!value && (
              <div
                className={`pointer-events-none absolute inset-0 text-[15px] leading-relaxed text-muted transition-opacity duration-300 ${
                  placeholderVisible ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              >
                {PLACEHOLDER_EXAMPLES[placeholderIndex]}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {APP_PILLS.map((app) => (
                <span
                  key={app.label}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-[#F8F7F4] px-2.5 py-1 text-xs text-muted"
                >
                  <span>{app.emoji}</span>
                  <span>{app.label}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => scrollToSection("waitlist")}
              className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-foreground/90 active:scale-[0.98]"
            >
              Automate →
            </button>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        No credit card required · Setup in 60 seconds · Cancel anytime
      </p>
    </div>
  );
}

function ChatDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => resolve(), ms);
        timers.push(id);
      });

    const runSequence = async () => {
      setVisibleCount(0);
      setIsBuilding(false);

      for (let i = 0; i < DEMO_MESSAGES.length; i++) {
        if (cancelled) return;

        const message = DEMO_MESSAGES[i];

        if (message.role === "assistant" && message.buildingMs) {
          setIsBuilding(true);
          await wait(message.buildingMs);
          if (cancelled) return;
          setIsBuilding(false);
        } else if (i > 0) {
          await wait(1200);
          if (cancelled) return;
        }

        setVisibleCount(i + 1);
        await wait(1500);
        if (cancelled) return;
      }

      if (cancelled) return;
      setIsBuilding(false);
      await wait(3000);
      if (cancelled) return;

      setCycleKey((k) => k + 1);
    };

    runSequence();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [cycleKey]);

  return (
    <section id="demo" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              See it in action
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Live demo
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <span className="text-sm font-medium text-foreground">
              flowchat assistant
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Online
            </span>
          </div>

          <div className="flex min-h-[400px] flex-col gap-4 p-4 md:min-h-[440px] md:p-6">
            {DEMO_MESSAGES.slice(0, visibleCount).map((message, index) => (
              <div
                key={`${cycleKey}-${index}`}
                className={`animate-fade-slide-up ${
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }`}
              >
                {message.role === "user" ? (
                  <div className="max-w-[90%] rounded-2xl bg-foreground px-4 py-3 text-sm leading-relaxed text-white md:max-w-[85%]">
                    {message.content}
                  </div>
                ) : (
                  <div className="max-w-[90%] rounded-2xl border border-border border-l-[3px] border-l-accent bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm md:max-w-[85%]">
                    {message.content.split("\n").map((line, lineIndex) => (
                      <span key={lineIndex}>
                        {line}
                        {lineIndex < message.content.split("\n").length - 1 && (
                          <br />
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isBuilding && visibleCount < DEMO_MESSAGES.length && (
              <div className="flex justify-start animate-fade-slide-up">
                <div className="rounded-2xl border border-border border-l-[3px] border-l-accent bg-card px-4 py-2 shadow-sm">
                  <BuildingDots />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function WaitlistForm({ onJoin }: { onJoin: (count: number) => void }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !trimmed.includes("@")) return;

      try {
        const stored = localStorage.getItem(WAITLIST_KEY);
        const emails: string[] = stored ? JSON.parse(stored) : [];
        if (!emails.includes(trimmed)) {
          emails.push(trimmed);
          localStorage.setItem(WAITLIST_KEY, JSON.stringify(emails));
        }
        onJoin(emails.length);
        setSubmitted(true);
        setEmail("");
      } catch {
        setSubmitted(true);
      }
    },
    [email, onJoin],
  );

  return (
    <section id="waitlist" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm md:p-12">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Be the first to automate smarter.
        </h2>
        <p className="mt-4 text-muted">
          Early access users get 3 months free on any paid plan.
        </p>

        {submitted ? (
          <div className="mt-10 rounded-2xl border border-accent/20 bg-accent/5 px-6 py-5">
            <p className="font-medium text-accent">
              You&apos;re on the list! We&apos;ll be in touch soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10">
            <div className="mx-auto flex max-w-md gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 rounded-full border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                className="whitespace-nowrap rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Get early access
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-xs text-muted">
          No spam. No credit card. Just early access.
        </p>
      </div>
    </section>
  );
}

export default function Home() {
  const [, setWaitlistCount] = useState(0);

  useEffect(() => {
    setWaitlistCount(getWaitlistCount());
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-foreground">
            <span>⚡</span>
            <span>flowchat</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <button
              type="button"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("waitlist")}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-white transition-all hover:bg-foreground/90 active:scale-[0.98]"
            >
              Get early access
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="flex min-h-screen flex-col items-center justify-center px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted shadow-sm">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Now in early access
          </div>

          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            <span className="block">Automate anything.</span>
            <span className="block text-accent">Just describe it.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-lg text-muted">
            Type what you want to automate. Our AI builds it instantly — no
            technical setup, no learning curve.
          </p>

          <HeroChatInput />
        </div>
      </section>

      {/* CHAT DEMO */}
      <ChatDemo />

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold tracking-tight md:text-3xl">
            How it works
          </h2>
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-center">
            {STEPS.map((step, index) => (
              <Fragment key={step.title}>
                <div className="relative w-full rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:w-64 lg:w-72">
                  <span className="absolute right-6 top-6 text-6xl font-bold text-gray-100">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold text-gray-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    {step.description}
                  </p>
                </div>
                {index < STEPS.length - 1 && (
                  <span className="hidden text-2xl text-gray-300 md:block">
                    →
                  </span>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* WAITLIST */}
      <WaitlistForm onJoin={setWaitlistCount} />

      {/* FOOTER */}
      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-muted">
          <span className="font-medium text-foreground">flowchat.now</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
