"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>
) {
  const entry = { location, message, data, timestamp: Date.now() };
  try {
    sessionStorage.setItem("flowchat_oauth_debug", JSON.stringify(entry));
  } catch {
    // ignore
  }
  // #region agent log
  fetch("http://127.0.0.1:7402/ingest/66dfec1a-1cd9-44c7-8573-5fb3fdc9feac", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "119215",
    },
    body: JSON.stringify({ sessionId: "119215", ...entry, hypothesisId: "E" }),
  }).catch(() => {});
  // #endregion
}

export default function AuthCallbackPage() {
  useEffect(() => {
    let redirecting = false;
    let subscription: { unsubscribe: () => void } | null = null;

    function goTo(path: string, source: string) {
      if (redirecting) return;
      redirecting = true;
      debugLog("auth/callback/page.tsx:goTo", "redirecting", { path, source });
      window.location.replace(path);
    }

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = params.get("next") || "/dashboard";

      debugLog("auth/callback/page.tsx:entry", "callback page loaded", {
        hasCode: Boolean(code),
        next,
        hash: window.location.hash.slice(0, 32),
      });

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        debugLog("auth/callback/page.tsx:onAuthStateChange", "auth event", {
          event,
          hasSession: Boolean(session),
        });
        if (
          session &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION")
        ) {
          goTo(next, `auth-event-${event}`);
        }
      });
      subscription = data.subscription;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        debugLog("auth/callback/page.tsx:exchange", "code exchange done", {
          exchangeError: error?.message ?? null,
          hasSession: Boolean(session),
        });

        if (session) {
          goTo(next, "code-exchange");
          return;
        }

        if (error) {
          goTo("/login?error=oauth_failed", "exchange-failed");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        goTo(next, "existing-session");
        return;
      }

      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();
        subscription?.unsubscribe();
        if (retrySession) {
          goTo(next, "retry-session");
        } else {
          goTo("/login?error=oauth_failed", "timeout");
        }
      }, 3000);
    }

    handleCallback();

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
