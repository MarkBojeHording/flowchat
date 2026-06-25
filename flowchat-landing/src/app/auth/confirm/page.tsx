"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

export default function AuthConfirmPage() {
  useEffect(() => {
    let redirecting = false;
    let subscription: { unsubscribe: () => void } | null = null;

    async function goNext() {
      if (redirecting) return;
      redirecting = true;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          window.location.replace("/login");
          return;
        }

        const res = await fetch(
          `${BACKEND_URL}/api/chat/usage?userId=${user.id}`
        );
        const data = await res.json();

        const needsOnboarding =
          (data.firstLogin ?? data.first_login) !== false;

        if (needsOnboarding) {
          window.location.replace("/onboarding");
        } else {
          window.location.replace("/dashboard");
        }
      } catch {
        window.location.replace("/dashboard");
      }
    }

    async function confirmAuth() {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");
      const code = params.get("code");

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          session &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION")
        ) {
          goNext();
        }
      });
      subscription = data.subscription;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          goNext();
          return;
        }
        if (error) {
          window.location.href = "/login?error=oauth_failed";
          return;
        }
      }

      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: type as
            | "signup"
            | "invite"
            | "magiclink"
            | "recovery"
            | "email_change"
            | "email",
          token_hash,
        });
        if (!error) {
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/confirm/email-confirmed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY
            },
            body: JSON.stringify({
              userId: data.user?.id,
              email: data.user?.email,
              name: data.user?.user_metadata?.full_name || null
            })
          }).catch(() => {})

          goNext();
          return;
        }
        window.location.href = "/login?error=confirmation_failed";
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        goNext();
      }
    }

    confirmAuth();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e]">
      <div className="text-center">
        <div className="mb-4 text-4xl">⚡</div>
        <div className="text-lg font-medium text-white">Signing you in...</div>
        <div className="mt-2 text-sm text-white/40">Just a moment</div>
      </div>
    </div>
  );
}
