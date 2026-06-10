"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const PENDING_AUTOMATION_KEY = "pending_automation";

type Automation = {
  trigger: { app: string; event: string; description: string };
  actions: { app: string; event: string; description: string }[];
  name: string;
  description: string;
};

export default function SignupPage() {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PENDING_AUTOMATION_KEY);
      if (stored) setAutomation(JSON.parse(stored));
    } catch {
      setAutomation(null);
    }
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
      },
    });

    setIsLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccess(true);
  }

  const inputClassName =
    "w-full rounded-xl border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-3 text-sm text-[#e8e8f0] placeholder:text-[#8888aa] focus:border-[#00d4aa] focus:outline-none focus:ring-1 focus:ring-[#00d4aa]";

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <nav className="border-b border-[#2a2a4a] bg-[#0f0f1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-white"
          >
            <span>⚡</span>
            <span>flowchat</span>
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-md flex-col justify-center px-4 py-12">
        {automation && (
          <div className="mb-6 text-center">
            <p className="text-sm text-[#8888aa]">
              You&apos;re one step away from activating:
            </p>
            <div className="mt-3 rounded-xl border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-4 py-3">
              <p className="text-sm font-medium text-[#00d4aa]">{automation.name}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-8">
          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00d4aa]/10 text-xl">
                ✉️
              </div>
              <p className="text-sm leading-relaxed text-[#e8e8f0]">
                Check your email to confirm your account. Your automation will
                activate once confirmed.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-[#e8e8f0]">
                  Create your account
                </h1>
                <p className="mt-2 text-sm text-[#8888aa]">
                  Start your free 3-day trial
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                  className={inputClassName}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className={inputClassName}
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 8 characters)"
                  autoComplete="new-password"
                  className={inputClassName}
                />

                {error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl bg-[#00d4aa] py-3 text-sm font-semibold text-[#0f0f1a] transition-colors hover:bg-[#00b894] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Creating account..." : "Create account"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[#8888aa]">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-[#00d4aa] transition-colors hover:text-[#00b894]"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
