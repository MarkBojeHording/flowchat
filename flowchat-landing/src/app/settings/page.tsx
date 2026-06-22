"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

const COMMON_TIMEZONES = [
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "America/Denver", label: "Denver (UTC-7/-6)" },
  { value: "America/Chicago", label: "Chicago (UTC-6/-5)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "Europe/London", label: "London (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Paris / Copenhagen (UTC+1/+2)" },
  { value: "Europe/Helsinki", label: "Helsinki (UTC+2/+3)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Asia/Kolkata", label: "Mumbai / Delhi (UTC+5:30)" },
  { value: "Asia/Bangkok", label: "Bangkok / Jakarta (UTC+7)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)" },
  { value: "Pacific/Auckland", label: "Auckland (UTC+12/+13)" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUser(user);

      try {
        const res = await fetch(
          `${BACKEND_URL}/api/chat/usage?userId=${user.id}`
        );
        const data = await res.json();
        if (data.timezone) setTimezone(data.timezone);
        else setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      } catch {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await fetch(`${BACKEND_URL}/api/chat/profile/timezone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, timezone }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f1a]">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]" />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="border-b border-[#2a2a4a] px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/dashboard" className="text-lg font-bold text-[#e8e8f0]">
            ⚡ Flowchat
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-[#8888aa] transition-colors hover:text-[#e8e8f0]"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-bold text-[#e8e8f0]">Settings</h1>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-6">
            <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">Profile</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#8888aa]">Name</label>
                <div className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-[#8888aa]">
                  {user?.user_metadata?.full_name || "Not set"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#8888aa]">
                  Email
                </label>
                <div className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-[#8888aa]">
                  {user?.email}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-6">
            <h2 className="mb-1 text-sm font-medium text-[#e8e8f0]">
              Timezone
            </h2>
            <p className="mb-4 text-xs text-[#8888aa]">
              Used for all scheduled automations. Make sure this matches where
              you are.
            </p>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-[#e8e8f0] focus:border-[#00d4aa] focus:outline-none"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
              <option
                value={timezone}
                disabled={COMMON_TIMEZONES.some((t) => t.value === timezone)}
              >
                {timezone} (current)
              </option>
            </select>
          </div>

          <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-6">
            <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">
              Connected apps
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📧</span>
                  <div>
                    <p className="text-sm text-[#e8e8f0]">Google</p>
                    <p className="text-xs text-[#8888aa]">
                      Gmail + Google Sheets
                    </p>
                  </div>
                </div>
                <a
                  href={`${BACKEND_URL}/api/auth/google`}
                  className="rounded-lg border border-[#2a2a4a] px-3 py-1.5 text-xs text-[#8888aa] transition-colors hover:border-[#00d4aa] hover:text-[#00d4aa]"
                >
                  Reconnect
                </a>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div>
                    <p className="text-sm text-[#e8e8f0]">Slack</p>
                    <p className="text-xs text-[#8888aa]">
                      Send messages to channels
                    </p>
                  </div>
                </div>
                <a
                  href={`${BACKEND_URL}/api/auth/slack`}
                  className="rounded-lg border border-[#2a2a4a] px-3 py-1.5 text-xs text-[#8888aa] transition-colors hover:border-[#00d4aa] hover:text-[#00d4aa]"
                >
                  Reconnect
                </a>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-[#00d4aa] py-3 font-semibold text-[#0f0f1a] transition-colors hover:bg-[#00b894] disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "✅ Saved!" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
