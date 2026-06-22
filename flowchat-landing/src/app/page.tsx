"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

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

/** Preserved for reuse — not rendered in current mockup layout. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/** Preserved for reuse — pricing is inlined in Home(). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PRICING_PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying it out",
    features: [
      "3 active automations",
      "100 runs per month",
      "Gmail, Sheets, Slack",
      "Community support",
    ],
    cta: "Get started free",
    ctaHref: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "For individuals and solopreneurs",
    features: [
      "Unlimited automations",
      "5,000 runs per month",
      "All available apps",
      "Priority support",
      "Advanced scheduling",
    ],
    cta: "Start Pro trial",
    ctaHref: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$49",
    period: "per month",
    description: "For small teams",
    features: [
      "Unlimited automations",
      "50,000 runs per month",
      "All apps + custom",
      "Team members",
      "Dedicated support",
      "Custom integrations",
    ],
    cta: "Contact us",
    ctaHref: "mailto:hello@flowchat.now",
    highlighted: false,
  },
];

/** Preserved for reuse — templates section not in current mockup layout. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TEMPLATES = [
  {
    trigger: { emoji: "📋", name: "Typeform" },
    action: { emoji: "📊", name: "Google Sheets" },
    title: "Save form responses to a spreadsheet",
    category: "Lead Capture",
    prompt:
      "When someone fills my Typeform, add their response to my Google Sheet",
  },
  {
    trigger: { emoji: "💳", name: "Stripe" },
    action: { emoji: "📧", name: "Gmail" },
    title: "Send welcome email on new payment",
    category: "Sales",
    prompt:
      "When I get a new Stripe payment, send a welcome email to the customer",
  },
  {
    trigger: { emoji: "📋", name: "Typeform" },
    action: { emoji: "💬", name: "Slack" },
    title: "Notify team when someone fills a form",
    category: "Lead Capture",
    prompt:
      "When someone fills my Typeform, send a Slack notification to my team",
  },
  {
    trigger: { emoji: "⏰", name: "Schedule" },
    action: { emoji: "💬", name: "Slack" },
    title: "Weekly team standup reminder",
    category: "Team",
    prompt: "Every Monday at 9am, send a standup reminder to my Slack channel",
  },
  {
    trigger: { emoji: "📊", name: "Google Sheets" },
    action: { emoji: "💬", name: "Slack" },
    title: "Alert team when spreadsheet updates",
    category: "Operations",
    prompt:
      "When a new row is added to my Google Sheet, send a Slack message",
  },
  {
    trigger: { emoji: "⏰", name: "Schedule" },
    action: { emoji: "📧", name: "Gmail" },
    title: "Send weekly summary email",
    category: "Reporting",
    prompt: "Every Friday at 5pm, send me a weekly summary email",
  },
  {
    trigger: { emoji: "📧", name: "Gmail" },
    action: { emoji: "📊", name: "Google Sheets" },
    title: "Log new emails to spreadsheet",
    category: "Operations",
    prompt:
      "When I receive a new email, log the sender and subject to my Google Sheet",
  },
  {
    trigger: { emoji: "💳", name: "Stripe" },
    action: { emoji: "📊", name: "Google Sheets" },
    title: "Track payments in a spreadsheet",
    category: "Finance",
    prompt:
      "When I get a new Stripe payment, add it to my payments Google Sheet",
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

/** Preserved for template cards — used when templates section is restored. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleTemplateClick(prompt: string) {
  localStorage.setItem(
    PENDING_AUTOMATION_KEY,
    JSON.stringify({ description: prompt }),
  );
  window.location.href = "/signup";
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

/** Preserved for reuse — templates section replaced the inline demo section. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <div className="overflow-hidden rounded-2xl border border-[#333333] bg-[#242424] p-4 md:p-5">
        <p className="mb-3 text-sm font-medium text-white">
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
            className="w-full resize-none rounded-xl border border-[#333333] bg-[#1a1a1a] p-3 text-sm leading-relaxed text-white outline-none transition-shadow focus:ring-2 focus:ring-[#00d4aa] disabled:opacity-60"
          />
          {!inputValue && (
            <div
              className={`pointer-events-none absolute inset-0 p-3 text-sm leading-relaxed text-[#71717a] transition-opacity duration-300 ${
                placeholderVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden
            >
              {PLACEHOLDER_EXAMPLES[placeholderIndex]}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-[#333333] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {APP_PILLS.map((app) => (
              <span
                key={app.label}
                className="inline-flex items-center gap-1 rounded-full border border-[#333333] bg-[#1a1a1a] px-2.5 py-1 text-xs text-[#a1a1aa]"
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
            className="shrink-0 rounded-full bg-[#00d4aa] px-6 py-2.5 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#00b894] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Building..." : "Automate →"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-[#333333] border-l-4 border-l-[#00d4aa] bg-[#242424] p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="text-lg font-semibold text-white">
              Your automation is ready
            </span>
          </div>

          <div className="mb-2 rounded-xl border border-[#333333] bg-[#1a1a1a] px-4 py-3">
            <div className="mb-1 text-xs uppercase tracking-wider text-[#00d4aa]">
              Trigger
            </div>
            <div className="font-medium capitalize text-white">
              {result.trigger?.app?.replace("_", " ")}
            </div>
            <div className="text-sm text-[#a1a1aa]">{result.trigger?.description}</div>
          </div>

          {result.actions?.map((action, idx) => (
            <div key={idx}>
              <div className="my-2 text-center text-[#00d4aa]">↓</div>
              <div className="rounded-xl border border-[#333333] bg-[#1a1a1a] px-4 py-3">
                <div className="mb-1 text-xs uppercase tracking-wider text-[#00d4aa]">
                  Action {idx + 1}
                </div>
                <div className="font-medium capitalize text-white">
                  {action.app?.replace("_", " ")}
                </div>
                <div className="text-sm text-[#a1a1aa]">{action.description}</div>
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
            className="mt-6 w-full rounded-xl bg-[#00d4aa] py-4 text-lg font-bold text-[#0f0f0f] transition-colors hover:bg-[#00b894]"
          >
            Activate this automation →
          </button>
          <p className="mt-2 text-center text-sm text-[#71717a]">
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
  const [user, setUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setDropdownOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* FLOATING NAVBAR */}
      <div className="fixed top-4 left-0 right-0 z-50 px-2">
        <div className="mx-auto max-w-[1400px]">
          <nav className="flex items-center justify-between rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[#0f1525] px-6 py-3 shadow-xl">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-white"
              style={{ letterSpacing: "-0.03em" }}
            >
              Flowchat
            </Link>
            <div className="flex items-center gap-4 sm:gap-8">
              <button
                type="button"
                onClick={() => scrollToSection("integrations")}
                className="text-sm text-[#8888aa] transition-colors hover:text-[#e8e8f0]"
              >
                Integrations
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("pricing")}
                className="text-sm text-[rgba(255,255,255,0.45)] transition-colors hover:text-white"
              >
                Pricing
              </button>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.15)] px-3 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9b872] text-xs font-bold text-[#0a0a0a]">
                      {user.user_metadata?.full_name?.[0]?.toUpperCase() ||
                        user.email?.[0]?.toUpperCase() ||
                        "U"}
                    </div>
                    <span className="hidden text-sm text-white sm:block">
                      {user.user_metadata?.full_name ||
                        user.email?.split("@")[0]}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="text-[rgba(255,255,255,0.4)]"
                    >
                      <path
                        d="M2 4l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[#141929] shadow-2xl">
                      <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
                        <div className="text-sm font-semibold text-white">
                          {user.user_metadata?.full_name || "My Account"}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[rgba(255,255,255,0.4)]">
                          {user.email}
                        </div>
                      </div>

                      <div className="py-1">
                        <Link
                          href="/dashboard"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                        >
                          <span>🏠</span>
                          Dashboard
                        </Link>
                        <Link
                          href="/automations"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                        >
                          <span>⚡</span>
                          My Automations
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                        >
                          <span>⚙️</span>
                          Settings
                        </Link>
                      </div>

                      <div className="border-t border-[rgba(255,255,255,0.08)] py-1">
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                        >
                          <span>→</span>
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm text-[rgba(255,255,255,0.4)] transition-colors hover:text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full bg-[#e9b872] px-4 py-2 text-sm font-bold text-[#0a0a0a] transition-colors hover:bg-[#d4a05a]"
                  >
                    Get started free
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* HERO SECTION */}
      <section className="px-2 pb-4 pt-28">
        <div className="mx-auto max-w-[1400px]">
          <div className="overflow-hidden rounded-3xl bg-[#141929]">
            <div className="grid grid-cols-1 items-center gap-8 p-10 lg:grid-cols-2">
              <div>
                <div
                  className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs"
                  style={{ background: "rgba(233,184,114,0.1)", color: "#e9b872" }}
                >
                  ✦ Automation for everyone
                </div>
                <h1
                  className="mb-6 text-5xl font-extrabold leading-[1.1] tracking-tight text-white lg:text-6xl"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  Stop doing it
                  <br />
                  manually.
                  <br />
                  <span className="italic" style={{ color: "#e9b872" }}>
                    Just describe it.
                  </span>
                </h1>
                <p className="mb-8 max-w-md text-base leading-relaxed text-[rgba(255,255,255,0.45)]">
                  Just describe what you want. Flowchat builds and activates it
                  instantly — then runs it 24/7.
                </p>
                <div className="mb-6 flex items-center gap-4">
                  <Link
                    href="/signup"
                    className="rounded-full bg-[#e9b872] px-7 py-3.5 text-sm font-bold text-[#0a0a0a] transition-colors hover:bg-[#d4a05a] active:scale-[0.98]"
                  >
                    Start for free →
                  </Link>
                  <button
                    type="button"
                    onClick={() => scrollToSection("templates")}
                    className="rounded-full border border-[rgba(255,255,255,0.15)] px-7 py-3.5 text-sm font-medium text-[rgba(255,255,255,0.6)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  >
                    See examples
                  </button>
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.25)]">
                  No credit card · 3-day free trial
                </p>
              </div>
              <div>
                <HeroPreviewCard />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="integrations" className="px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#e8e8f0] md:text-3xl">
              See what&apos;s possible
            </h2>
            <p className="text-sm text-[#8888aa]">
              Real automations people set up in minutes
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                emoji: "📋",
                color: "bg-[#00d4aa]/10",
                title: "Save leads automatically",
                description:
                  "Every form response goes to your spreadsheet and notifies your team in Slack",
                tools: ["Typeform", "→", "Google Sheets", "Slack"],
              },
              {
                emoji: "💳",
                color: "bg-blue-500/10",
                title: "Payment notifications",
                description:
                  "Instant Slack alert and welcome email every time someone pays you",
                tools: ["Stripe", "→", "Slack", "Gmail"],
              },
              {
                emoji: "📅",
                color: "bg-purple-500/10",
                title: "Booking confirmations",
                description:
                  "Send prep materials automatically when someone books a meeting with you",
                tools: ["Calendly", "→", "Gmail"],
              },
              {
                emoji: "⏰",
                color: "bg-amber-500/10",
                title: "Weekly team reminders",
                description:
                  "Send your team a Slack message every Friday — completely automatically",
                tools: ["Schedule", "→", "Slack"],
              },
              {
                emoji: "📊",
                color: "bg-green-500/10",
                title: "Automated reports",
                description:
                  "Email a performance summary to your team every Monday morning",
                tools: ["Google Sheets", "→", "Gmail"],
              },
              {
                emoji: "🗃️",
                color: "bg-pink-500/10",
                title: "Client onboarding",
                description:
                  "Trigger a personalised welcome email when a new client record is added",
                tools: ["Airtable", "→", "Gmail"],
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-5"
              >
                <div
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl ${item.color}`}
                >
                  {item.emoji}
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[#e8e8f0]">
                    {item.title}
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-[#8888aa]">
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {item.tools.map((tool, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-[#2a2a4a] bg-[#0f0f1a] px-2 py-0.5 text-xs text-[#8888aa]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-[#8888aa]">
            More automations added every week ·{" "}
            <a
              href="mailto:hello@flowchat.now"
              className="text-[#00d4aa] hover:underline"
            >
              Request one →
            </a>
          </p>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className="px-2 py-4">
        <div className="mx-auto max-w-[1400px]">
          <div className="overflow-hidden rounded-3xl bg-[#0f1525] p-10">
            <h2
              className="mb-2 text-center text-2xl font-bold text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Simple, honest pricing
            </h2>
            <p className="mb-10 text-center text-sm text-[rgba(255,255,255,0.35)]">
              Start free. Upgrade when you&apos;re ready.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  name: "Free",
                  price: "$0",
                  period: "forever",
                  features: [
                    "1 active automation",
                    "50 runs per month",
                    "Gmail, Sheets & Slack",
                    "Community support",
                  ],
                  cta: "Get started free",
                  href: "/signup",
                  featured: false,
                },
                {
                  name: "Pro",
                  price: "$19.99",
                  period: "per month",
                  features: [
                    "Unlimited automations",
                    "2,000 runs per month",
                    "All available apps",
                    "Email support",
                    "Top-up available ($9.99 / 1,000 runs)",
                  ],
                  cta: "Start Pro trial",
                  href: "/signup?plan=pro",
                  featured: true,
                },
                {
                  name: "Business",
                  price: "$49.99",
                  period: "per month",
                  features: [
                    "Unlimited automations",
                    "10,000 runs per month",
                    "All available apps",
                    "Team members (3 seats)",
                    "Priority support",
                    "Top-up available ($9.99 / 1,000 runs)",
                  ],
                  cta: "Contact us",
                  href: "mailto:hello@flowchat.now",
                  featured: false,
                },
              ].map((plan) => (
                <div
                  key={plan.name}
                  className="rounded-2xl p-6"
                  style={{
                    background: plan.featured
                      ? "rgba(233,184,114,0.05)"
                      : "rgba(255,255,255,0.04)",
                    border: plan.featured
                      ? "1.5px solid #e9b872"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {plan.featured && (
                    <div
                      className="mb-3 inline-block rounded-full px-3 py-1 text-[7px] font-bold"
                      style={{ background: "#e9b872", color: "#0a0a0a" }}
                    >
                      Most popular
                    </div>
                  )}
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                    {plan.name}
                  </div>
                  <div
                    className="mb-1 text-4xl font-extrabold text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {plan.price}
                  </div>
                  <div className="mb-6 text-xs text-[rgba(255,255,255,0.3)]">
                    {plan.period}
                  </div>
                  <div className="mb-6 border-t border-[rgba(255,255,255,0.08)]" />
                  <div className="mb-8 space-y-3">
                    {plan.features.map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.5)]"
                      >
                        <span style={{ color: "#e9b872" }}>✓</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link
                    href={plan.href}
                    className="block w-full rounded-full py-3 text-center text-sm font-bold transition-colors"
                    style={
                      plan.featured
                        ? { background: "#e9b872", color: "#0a0a0a" }
                        : {
                            border: "1px solid rgba(255,255,255,0.15)",
                            color: "rgba(255,255,255,0.6)",
                          }
                    }
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-[rgba(255,255,255,0.35)]">
              What counts as a run? Every time an automation does something —
              sends a message, adds a row, sends an email — that&apos;s one run.
            </p>
            <p className="mt-4 text-center text-xs text-[rgba(255,255,255,0.2)]">
              All plans include a 3-day free trial · Cancel anytime · No credit
              card required
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-4 px-2 py-4">
        <div className="mx-auto max-w-[1400px]">
          <div className="overflow-hidden rounded-3xl bg-[#060b15] px-10 py-8">
            <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.06)] pb-6 sm:flex-row">
              <span
                className="text-lg font-bold text-white"
                style={{ letterSpacing: "-0.03em" }}
              >
                Flowchat
              </span>
              <div className="flex items-center gap-6 text-sm text-[rgba(255,255,255,0.35)]">
                <Link href="/examples" className="transition-colors hover:text-white">
                  Examples
                </Link>
                <button
                  type="button"
                  onClick={() => scrollToSection("pricing")}
                  className="transition-colors hover:text-white"
                >
                  Pricing
                </button>
                <Link href="/login" className="transition-colors hover:text-white">
                  Sign in
                </Link>
              </div>
            </div>
            <div className="flex flex-col items-center justify-between gap-2 text-xs text-[rgba(255,255,255,0.2)] sm:flex-row">
              <span>© 2026 flowchat.now · All rights reserved</span>
              <span>Made for people who hate doing things manually</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
