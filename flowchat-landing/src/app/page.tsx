"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

const PENDING_AUTOMATION_KEY = "pending_automation";

type Interpretation = {
  trigger: { app: string; event: string; description: string };
  actions: { app: string; event: string; description: string }[];
  name: string;
  description: string;
};

const PLACEHOLDER_EXAMPLES = [
  "When someone fills my Typeform, add them to Google Sheets and notify my Slack...",
  "When I get a new Stripe payment, send a welcome email via Gmail...",
  "Every time a new row is added to Google Sheets, create a Notion page...",
];

const APP_PILLS = [
  { emoji: "📋", label: "Typeform" },
  { emoji: "📧", label: "Gmail" },
  { emoji: "📊", label: "Google Sheets" },
  { emoji: "💬", label: "Slack" },
  { emoji: "📝", label: "Notion" },
  { emoji: "🗃️", label: "Airtable" },
];

const SUPPORTED_APPS = [
  { emoji: "📋", name: "Typeform" },
  { emoji: "📧", name: "Gmail" },
  { emoji: "📊", name: "Google Sheets" },
  { emoji: "💬", name: "Slack" },
  { emoji: "📝", name: "Notion" },
  { emoji: "🗃️", name: "Airtable" },
];

const STEPS = [
  {
    icon: "💬",
    title: "Describe it",
    description: "Type what you want in plain English.",
  },
  {
    icon: "⚡",
    title: "We build it",
    description: "AI creates your automation instantly.",
  },
  {
    icon: "✅",
    title: "It runs forever",
    description: "Runs 24/7, fix or change anytime by chatting.",
  },
];

const PREVIEW_FLOW = [
  { label: "Typeform", sub: "New form response", borderColor: "border-l-[#262ead]" },
  { label: "Google Sheets", sub: "Add row to Contacts", borderColor: "border-l-[#0f9d58]" },
  { label: "Slack", sub: "Notify #team-leads", borderColor: "border-l-[#4a154b]" },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function BuildingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#00d4aa] animate-bounce-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function MacWindowBar() {
  return (
    <div className="relative flex items-center border-b border-[#2a2a4a] bg-[#0f0f1a] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
      <span className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-[#8888aa]">
        flowchat assistant
      </span>
    </div>
  );
}

function HeroPreviewCard() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2200),
      setTimeout(() => setPhase(3), 3200),
    ];
    const loop = setInterval(() => {
      setPhase(0);
      setTimeout(() => setPhase(1), 800);
      setTimeout(() => setPhase(2), 2200);
      setTimeout(() => setPhase(3), 3200);
    }, 8000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, []);

  return (
    <div className="flex max-h-[420px] flex-col overflow-hidden rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] shadow-2xl">
      <MacWindowBar />

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="space-y-3">
          {phase >= 1 && (
            <div className="flex justify-end animate-fade-slide-up">
              <div className="max-w-[90%] rounded-2xl bg-[#2a2a4a] px-4 py-3 text-sm leading-relaxed text-[#e8e8f0]">
                When someone fills my Typeform, add to Google Sheets and notify
                Slack
              </div>
            </div>
          )}

          {phase === 2 && (
            <div className="flex justify-start animate-fade-slide-up">
              <div className="rounded-2xl border border-[#2a2a4a] border-l-4 border-l-[#00d4aa] bg-[#1a1a2e] px-4 py-3">
                <BuildingDots />
              </div>
            </div>
          )}

          {phase >= 3 && (
            <div className="flex justify-start animate-fade-slide-up">
              <div className="max-w-[90%] rounded-2xl border border-[#2a2a4a] border-l-4 border-l-[#00d4aa] bg-[#1a1a2e] px-4 py-3 text-sm leading-relaxed text-[#e8e8f0]">
                ✅ Automation ready! Here&apos;s what I&apos;ve built for you.
              </div>
            </div>
          )}
        </div>

        <div
          className={`mt-3 space-y-1 transition-opacity duration-500 ${
            phase >= 3 ? "opacity-100" : "opacity-40"
          }`}
        >
          {PREVIEW_FLOW.map((step, i) => (
            <Fragment key={step.label}>
              <div
                className={`mx-3 flex items-start gap-2 rounded-2xl border border-[#2a2a4a] border-l-2 bg-[#0f0f1a] px-3 py-2 ${step.borderColor}`}
              >
                <div>
                  <p className="text-sm font-medium text-[#e8e8f0]">{step.label}</p>
                  <p className="text-xs text-[#8888aa]">{step.sub}</p>
                </div>
              </div>
              {i < PREVIEW_FLOW.length - 1 && (
                <div className="flex justify-center text-xs text-[#00d4aa]">↓</div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function InteractiveDemo() {
  const [inputValue, setInputValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Interpretation | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAutomate() {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputValue }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Something went wrong");

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div id="try-it" className="w-full">
      <div className="overflow-hidden rounded-2xl border border-[#e5e5ea] bg-white p-4 shadow-sm md:p-5">
        <p className="mb-3 text-sm font-medium text-[#0f0f1a]">
          Try it now — describe your automation
        </p>

        <div className="relative">
          <textarea
            rows={3}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAutomate();
              }
            }}
            disabled={isLoading}
            className="w-full resize-none rounded-xl border border-[#e5e5ea] bg-white p-3 text-sm leading-relaxed text-[#0f0f1a] outline-none transition-shadow focus:ring-2 focus:ring-[#00c49a] disabled:opacity-60"
          />
          {!inputValue && (
            <div
              className={`pointer-events-none absolute inset-0 p-3 text-sm leading-relaxed text-[#6e6e80] transition-opacity duration-300 ${
                placeholderVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden
            >
              {PLACEHOLDER_EXAMPLES[placeholderIndex]}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-[#e5e5ea] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {APP_PILLS.map((app) => (
              <span
                key={app.label}
                className="inline-flex items-center gap-1 rounded-full border border-[#e5e5ea] bg-white px-2.5 py-1 text-xs text-[#6e6e80]"
              >
                <span>{app.emoji}</span>
                <span>{app.label}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAutomate}
            disabled={isLoading || !inputValue.trim()}
            className="shrink-0 rounded-full bg-[#00c49a] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#00a882] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Building..." : "Automate →"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-[#e5e5ea] border-l-4 border-l-[#00c49a] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="text-lg font-semibold text-[#0f0f1a]">
              Your automation is ready
            </span>
          </div>

          <div className="mb-2 rounded-xl border border-[#e5e5ea] bg-[#f5f5f7] px-4 py-3">
            <div className="mb-1 text-xs uppercase tracking-wider text-[#00c49a]">
              Trigger
            </div>
            <div className="font-medium capitalize text-[#0f0f1a]">
              {result.trigger?.app?.replace("_", " ")}
            </div>
            <div className="text-sm text-[#6e6e80]">{result.trigger?.description}</div>
          </div>

          {result.actions?.map((action, idx) => (
            <div key={idx}>
              <div className="my-2 text-center text-[#00c49a]">↓</div>
              <div className="rounded-xl border border-[#e5e5ea] bg-[#f5f5f7] px-4 py-3">
                <div className="mb-1 text-xs uppercase tracking-wider text-[#00c49a]">
                  Action {idx + 1}
                </div>
                <div className="font-medium capitalize text-[#0f0f1a]">
                  {action.app?.replace("_", " ")}
                </div>
                <div className="text-sm text-[#6e6e80]">{action.description}</div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              localStorage.setItem(
                PENDING_AUTOMATION_KEY,
                JSON.stringify(result),
              );
              window.location.href = "/signup";
            }}
            className="mt-6 w-full rounded-xl bg-[#00c49a] py-4 text-lg font-bold text-white transition-colors hover:bg-[#00a882]"
          >
            Activate this automation →
          </button>
          <p className="mt-2 text-center text-sm text-[#6e6e80]">
            Free 3-day trial · No credit card required
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* NAV */}
      <div className="sticky top-3 z-50 px-4 pt-3">
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-[#e5e5ea] border-b border-[#e5e5ea] bg-white px-6 py-3 shadow-sm">
          <Link
            href="/"
            className="font-bold text-xl tracking-tight text-[#0f0f1a]"
            style={{ fontFamily: "var(--font-plus-jakarta)" }}
          >
            flowchat
          </Link>

          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-6">
            <Link
              href="/examples"
              className="text-sm text-[#6e6e80] transition-colors hover:text-[#0f0f1a]"
            >
              Examples
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection("pricing")}
              className="text-sm text-[#6e6e80] transition-colors hover:text-[#0f0f1a]"
            >
              Pricing
            </button>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <Link
              href="/login"
              className="text-sm text-[#6e6e80] transition-colors hover:text-[#0f0f1a]"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection("try-it")}
              className="rounded-full bg-[#00c49a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a882] active:scale-[0.98]"
            >
              Get started free
            </button>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <section
        className="px-4 pt-20 pb-20"
        style={{ background: "linear-gradient(to bottom, #ffffff, #f0f0f5)" }}
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[45fr_55fr] lg:gap-8">
            <div className="flex flex-col justify-center">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#e5e5ea] bg-[#f5f5f7] px-4 py-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-[#00c49a] animate-pulse" />
                <span className="text-[#0f0f1a]">247 automations created today</span>
              </div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                <span className="block text-[#0f0f1a]">Automate anything.</span>
                <span className="block text-[#00c49a] italic">Just say it.</span>
              </h1>

              <p className="mt-4 max-w-md text-base text-[#6e6e80] sm:text-lg">
                Connect your apps and automate your work by describing what you
                want. No technical knowledge needed.
              </p>

              <button
                type="button"
                onClick={() => scrollToSection("try-it")}
                className="mt-6 w-fit rounded-full bg-[#00c49a] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#00a882] active:scale-[0.98] sm:text-base"
              >
                Start automating free →
              </button>
              <p className="mt-2 text-sm text-[#6e6e80]">
                No credit card · 3-day free trial
              </p>
            </div>

            <div className="w-full">
              <HeroPreviewCard />
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE DEMO */}
      <section className="bg-[#f5f5f7] px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <InteractiveDemo />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-[#0f0f1a] px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-[#e8e8f0] md:text-3xl">
            How it works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="relative overflow-hidden rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-8"
              >
                <span className="absolute right-6 top-4 text-7xl font-bold text-[#2a2a4a]">
                  {index + 1}
                </span>
                <span className="text-2xl text-[#00c49a]">{step.icon}</span>
                <h3 className="mt-4 text-xl font-semibold text-[#e8e8f0]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8888aa]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SUPPORTED APPS */}
      <section className="bg-white px-4 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 text-center text-2xl font-bold text-[#0f0f1a]">
            Works with your favourite tools
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {SUPPORTED_APPS.map((app) => (
              <div
                key={app.name}
                className="flex flex-col items-center gap-2 transition-transform hover:scale-105"
              >
                <span className="text-3xl">{app.emoji}</span>
                <span className="text-xs text-[#6e6e80]">{app.name}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-[#6e6e80]">
            Works with the tools you already use
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#2a2a4a] bg-[#0f0f1a] px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm sm:flex-row">
          <span className="font-medium text-[#e8e8f0]">flowchat.now</span>
          <div className="flex items-center gap-6 text-[#8888aa]">
            <Link
              href="/login"
              className="transition-colors hover:text-[#e8e8f0]"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection("try-it")}
              className="transition-colors hover:text-[#e8e8f0]"
            >
              Get started
            </button>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
