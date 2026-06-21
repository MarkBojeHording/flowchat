"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

export function AuthSessionRedirect() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/auth/confirm") return;

    let redirecting = false;

    function goDashboard(source: string) {
      if (redirecting) return;
      redirecting = true;
      debugLog(
        "AuthSessionRedirect.tsx:goDashboard",
        "redirecting to dashboard",
        { source, pathname },
        "C"
      );
      window.location.replace("/dashboard");
    }

    async function handleAuthCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const hasHash =
        window.location.hash.length > 1 &&
        (window.location.hash.includes("access_token") ||
          window.location.hash.includes("error"));

      debugLog(
        "AuthSessionRedirect.tsx:handleAuthCallback",
        "checking auth callback on page",
        {
          pathname,
          hasCode: Boolean(code),
          hasHash,
          hashPrefix: window.location.hash.slice(0, 20),
        },
        "A"
      );

      if (!code && !hasHash) return;

      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          debugLog(
            "AuthSessionRedirect.tsx:onAuthStateChange",
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
        }
      );

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        debugLog(
          "AuthSessionRedirect.tsx:exchangeCode",
          "code exchange result",
          {
            exchangeError: error?.message ?? null,
            hasSession: Boolean(session),
          },
          "B"
        );

        if (session) {
          authListener.subscription.unsubscribe();
          goDashboard("code-exchange");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        authListener.subscription.unsubscribe();
        goDashboard("existing-session");
        return;
      }

      return () => {
        authListener.subscription.unsubscribe();
      };
    }

    const cleanupPromise = handleAuthCallback();
    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [pathname]);

  return null;
}
