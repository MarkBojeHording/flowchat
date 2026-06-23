"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

export default function OnboardingPage() {
  const router = useRouter();
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [detectedTimezone, setDetectedTimezone] = useState("UTC");

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const name = user.user_metadata?.full_name?.split(" ")[0] || "";
      setUserName(name);

      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setDetectedTimezone(detected);

      const match = COMMON_TIMEZONES.find((tz) => tz.value === detected);
      if (match) {
        setTimezone(detected);
      } else {
        setTimezone("Asia/Bangkok");
      }
    }
    init();
  }, [router]);

  async function handleContinue() {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await fetch(`${BACKEND_URL}/api/chat/profile/timezone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, timezone }),
      });

      await fetch(`${BACKEND_URL}/api/chat/profile/complete-onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      router.replace("/dashboard");
    } catch (err) {
      console.error("Onboarding error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f1a] px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="text-2xl font-bold text-white">⚡ Flowchat</span>
        </div>

        <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] p-8">
          <h1 className="mb-2 text-xl font-bold text-[#e8e8f0]">
            {userName ? `Welcome, ${userName}! 👋` : "Welcome to Flowchat! 👋"}
          </h1>

          <p className="mb-6 text-sm text-[#8888aa]">
            One quick thing before you start — what timezone are you in? This
            ensures your scheduled automations run at the right time.
          </p>

          <div className="mb-6">
            <label className="mb-2 block text-xs font-medium text-[#8888aa]">
              Your timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-3 text-sm text-[#e8e8f0] focus:border-[#00d4aa] focus:outline-none"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[#4a4a6a]">
              We detected: {detectedTimezone}
            </p>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="w-full rounded-xl bg-[#00d4aa] py-3 font-semibold text-[#0f0f1a] transition-colors hover:bg-[#00b894] disabled:opacity-50"
          >
            {saving ? "Setting up..." : "Start automating →"}
          </button>

          <p className="mt-4 text-center text-xs text-[#4a4a6a]">
            You can change this anytime in Settings
          </p>
        </div>
      </div>
    </div>
  );
}
