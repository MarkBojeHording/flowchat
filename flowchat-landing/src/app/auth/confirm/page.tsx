"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  // #region agent log
  fetch("http://127.0.0.1:7402/ingest/66dfec1a-1cd9-44c7-8573-5fb3fdc9feac", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "119215",
    },
    body: JSON.stringify({
      sessionId: "119215",
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export default function AuthConfirmPage() {
  useEffect(() => {
    let redirecting = false;
    let subscription: { unsubscribe: () => void } | null = null;

    function goDashboard(source: string) {
      if (redirecting) return;
      redirecting = true;
      debugLog(
        "auth/confirm/page.tsx:goDashboard",
        "redirecting to dashboard",
        { source },
        "C"
      );
      window.location.replace("/dashboard");
    }

    async function confirmAuth() {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");
      const code = params.get("code");
      const hasHash =
        window.location.hash.length > 1 &&
        (window.location.hash.includes("access_token") ||
          window.location.hash.includes("error"));

      debugLog(
        "auth/confirm/page.tsx:confirmAuth",
        "auth confirm entry",
        {
          hasCode: Boolean(code),
          hasTokenHash: Boolean(token_hash),
          type,
          hasHash,
          hashPrefix: window.location.hash.slice(0, 24),
        },
        "A"
      );

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        debugLog(
          "auth/confirm/page.tsx:onAuthStateChange",
          "auth event",
          { event, hasSession: Boolean(session) },
          "C"
        );
        if (
          session &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION")
        ) {
          goDashboard(`auth-event-${event}`);
        }
      });
      subscription = data.subscription;

      // PKCE OAuth — Supabase returns ?code=... on redirect
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        debugLog(
          "auth/confirm/page.tsx:exchangeCode",
          "code exchange result",
          {
            exchangeError: error?.message ?? null,
            hasSession: Boolean(session),
          },
          "B"
        );

        if (session) {
          goDashboard("code-exchange");
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
          goDashboard("email-otp");
          return;
        }
        window.location.href = "/login?error=confirmation_failed";
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        goDashboard("existing-session");
        return;
      }

      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();
        subscription?.unsubscribe();

        debugLog(
          "auth/confirm/page.tsx:timeout",
          "retry session check",
          { hasSession: Boolean(retrySession) },
          "D"
        );

        if (retrySession) {
          goDashboard("retry-session");
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
