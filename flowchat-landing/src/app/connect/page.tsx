"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

type Automation = {
  name: string;
  description: string;
  trigger?: { app: string; event: string; description: string };
  actions?: { app: string; event: string; description: string }[];
};

export default function ConnectPage() {
  const [user, setUser] = useState<User | null>(null);
  const [pendingAutomation, setPendingAutomation] = useState<Automation | null>(
    null
  );
  const [googleConnected, setGoogleConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    try {
      const saved = localStorage.getItem("pending_automation");
      if (saved) setPendingAutomation(JSON.parse(saved));
    } catch {
      setPendingAutomation(null);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setGoogleConnected(true);
    if (params.get("slack") === "connected") setSlackConnected(true);
  }, []);

  async function handleActivate() {
    setActivating(true);

    const saved = localStorage.getItem("pending_automation");
    if (!saved) {
      alert("No automation found. Go back and build one first.");
      setActivating(false);
      return;
    }

    const automation = JSON.parse(saved);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser?.id) {
      alert("Please sign in before activating.");
      setActivating(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/workflows/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          automation,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.removeItem("pending_automation");
        window.location.href = "/dashboard";
      } else {
        alert("Error: " + (data.error || "Failed to create workflow"));
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-bold text-white">
            ⚡ flowchat
          </Link>
        </div>

        {pendingAutomation && (
          <div className="mb-6 rounded-xl border border-[#00d4aa]/30 bg-[#1a1a2e] px-4 py-3 text-center">
            <div className="mb-1 text-xs uppercase tracking-wider text-[#00d4aa]">
              Activating
            </div>
            <div className="font-medium text-white">{pendingAutomation.name}</div>
          </div>
        )}

        <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-8">
          <h1 className="mb-2 text-2xl font-bold text-white">
            Connect your apps
          </h1>
          <p className="mb-8 text-sm text-[#8888aa]">
            Connect the apps needed to run your automation
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📧</span>
                <div>
                  <div className="font-medium text-white">Google</div>
                  <div className="text-xs text-[#8888aa]">
                    Gmail + Google Sheets
                  </div>
                </div>
              </div>
              {googleConnected ? (
                <span className="rounded-lg border border-green-500/30 bg-green-900/30 px-4 py-2 text-sm font-medium text-green-400">
                  ✅ Connected ✓
                </span>
              ) : (
                <a
                  href={`${BACKEND_URL}/api/auth/google`}
                  className="rounded-lg bg-[#00d4aa] px-4 py-2 text-sm font-medium text-[#0f0f1a] transition-colors hover:bg-[#00b894]"
                >
                  Connect
                </a>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <div className="font-medium text-white">Slack</div>
                  <div className="text-xs text-[#8888aa]">
                    Send messages to channels
                  </div>
                </div>
              </div>
              {slackConnected ? (
                <span className="rounded-lg border border-green-500/30 bg-green-900/30 px-4 py-2 text-sm font-medium text-green-400">
                  ✅ Connected ✓
                </span>
              ) : (
                <a
                  href={`${BACKEND_URL}/api/auth/slack`}
                  className="rounded-lg bg-[#00d4aa] px-4 py-2 text-sm font-medium text-[#0f0f1a] transition-colors hover:bg-[#00b894]"
                >
                  Connect
                </a>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📋</span>
                <div>
                  <div className="font-medium text-white">Typeform</div>
                  <div className="text-xs text-[#8888aa]">
                    Form submission triggers
                  </div>
                </div>
              </div>
              <a
                href={`${BACKEND_URL}/api/auth/typeform`}
                className="rounded-lg bg-[#00d4aa] px-4 py-2 text-sm font-medium text-[#0f0f1a] transition-colors hover:bg-[#00b894]"
              >
                Connect
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={handleActivate}
            disabled={activating}
            className="mt-8 w-full rounded-xl bg-[#00d4aa] py-3 font-bold text-[#0f0f1a] transition-colors hover:bg-[#00b894] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activating ? "Activating..." : "Activate my automation →"}
          </button>
        </div>
      </div>
    </div>
  );
}
