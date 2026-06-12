"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "signin" | "register";

const SLIDES = [
  {
    title: "Live in under 60 seconds",
    desc: "Describe what you want automated. Flowchat builds it, tests it, and activates it instantly.",
    icon: "⚡",
    gradient: "from-[#141929] to-[#1a2540]",
    features: ["Instant setup", "No coding required", "Works with your apps"],
  },
  {
    title: "No technical skills needed",
    desc: "If you can send a text message, you can create a Flowchat automation.",
    icon: "💬",
    gradient: "from-[#141929] to-[#1a1f3a]",
    features: ["Plain English only", "AI understands context", "Ask follow-up questions"],
  },
  {
    title: "Runs 24/7, forever",
    desc: "Your automations never sleep. Get notified instantly if anything needs attention.",
    icon: "✅",
    gradient: "from-[#141929] to-[#0f2535]",
    features: ["24/7 monitoring", "Instant error alerts", "One-click fixes"],
  },
];

function slideBackground(gradient: string): string {
  const end = gradient.match(/to-\[(#[^\]]+)\]/)?.[1] ?? "#1a2540";
  return `linear-gradient(135deg, #141929, ${end})`;
}

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-[#e9b872] focus:outline-none";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.33 2.56 13.22l7.98 6.19C12.43 13.38 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-3.88-13.45-9.41l-7.98 6.19C6.51 42.67 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "register") {
      setTab("register");
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((i) => (i + 1) % 3);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  async function handleSignIn() {
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    window.location.href = "/";
  }

  async function handleRegister() {
    if (!name || !email || !password) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccessMessage("Check your email to confirm your account");
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    setSuccessMessage(null);
  }

  return (
    <div className="box-border flex h-screen gap-4 overflow-hidden bg-[#0a0f1e] p-6">
      <div className="flex h-full w-1/2 flex-col rounded-3xl bg-[#0f1525] px-12 py-10">
        <Link
          href="/"
          className="shrink-0 w-full text-center text-xl font-bold tracking-tight text-white"
          style={{ letterSpacing: "-0.03em" }}
        >
          Flowchat
        </Link>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full max-w-sm">
            <h1 className="mt-2 text-center text-2xl font-bold text-white">
              {tab === "signin" ? "Welcome back" : "Get started free"}
            </h1>
            <p className="mt-1 text-center text-sm text-white/40">
              {tab === "signin"
                ? "Sign in to manage your automations"
                : "Create your account in seconds"}
            </p>

            <div className="mt-4 flex rounded-xl bg-white/5 p-1">
              <button
                type="button"
                onClick={() => switchTab("signin")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "signin"
                    ? "bg-white/10 text-white"
                    : "text-white/40"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchTab("register")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "register"
                    ? "bg-white/10 text-white"
                    : "text-white/40"
                }`}
              >
                Register
              </button>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-white py-2.5 text-sm font-medium text-[#0a0a0a] transition-opacity disabled:opacity-50"
            >
              <GoogleIcon />
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>

            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">or continue with email</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {tab === "register" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-white/50">
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className={inputClassName}
                />
              </div>
            )}

            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/50">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputClassName}
              />
            </div>

            <div>
              {tab === "signin" && (
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-[#e9b872] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <label className="mb-1 block text-xs text-white/50">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === "signin" ? "current-password" : "new-password"}
                className={inputClassName}
              />
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mt-3 rounded-xl border border-[#e9b872]/30 bg-[#e9b872]/10 px-4 py-2.5 text-sm text-[#e9b872]">
                {successMessage}
              </div>
            )}

            <button
              type="button"
              onClick={tab === "signin" ? handleSignIn : handleRegister}
              disabled={loading || googleLoading}
              className="mt-4 w-full rounded-xl bg-[#e9b872] py-2.5 text-sm font-bold text-[#0a0a0a] transition-colors hover:bg-[#d4a05a] disabled:opacity-50"
            >
              {loading
                ? tab === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : tab === "signin"
                  ? "Sign In"
                  : "Create account"}
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative hidden h-full flex-col overflow-hidden rounded-3xl lg:flex lg:w-1/2"
        style={{
          background: slideBackground(SLIDES[slideIndex].gradient),
        }}
      >
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-12 text-center">
          <div
            key={slideIndex}
            className="animate-fade-slide-up flex flex-col items-center"
          >
            <div className="mb-8 text-7xl">{SLIDES[slideIndex].icon}</div>
            <h2
              className="mb-6 text-4xl font-bold leading-tight text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              {SLIDES[slideIndex].title}
            </h2>
            <p
              className="mb-2 max-w-sm text-lg leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {SLIDES[slideIndex].desc}
            </p>
            {SLIDES[slideIndex].features.map((feature) => (
              <div
                key={feature}
                className="mt-3 flex items-center gap-2 text-sm"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                <span style={{ color: "#e9b872" }}>✓</span>
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={
                i === slideIndex
                  ? "h-1.5 w-8 rounded-full bg-[#e9b872] transition-all"
                  : "h-1.5 w-2 rounded-full bg-white/20 transition-all"
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
