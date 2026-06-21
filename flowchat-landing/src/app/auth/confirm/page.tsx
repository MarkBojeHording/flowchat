"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthConfirmPage() {
  useEffect(() => {
    let redirecting = false;
    let subscription: { unsubscribe: () => void } | null = null;

    function goDashboard() {
      if (redirecting) return;
      redirecting = true;
      window.location.replace("/dashboard");
    }

    async function confirmAuth() {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");
      const code = params.get("code");

      // PKCE OAuth — Supabase returns ?code=... on redirect
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          goDashboard();
          return;
        }
        window.location.href = "/login?error=oauth_failed";
        return;
      }

      // Email OTP verification (query params reach the client)
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
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
          goDashboard();
          return;
        }
        window.location.href = "/login?error=confirmation_failed";
        return;
      }

      // Implicit/hash OAuth fallback — wait for Supabase to parse #access_token=...
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
          session
        ) {
          goDashboard();
        }
      });
      subscription = data.subscription;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        goDashboard();
        return;
      }

      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();
        subscription?.unsubscribe();
        if (retrySession) {
          goDashboard();
        } else {
          window.location.href = "/login?error=oauth_failed";
        }
      }, 3000);
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
