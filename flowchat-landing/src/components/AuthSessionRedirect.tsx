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
  const entry = {
    sessionId: "119215",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };
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
    body: JSON.stringify(entry),
  }).catch(() => {});
  // #endregion
}

const AUTH_LANDING_PATHS = ["/", "/login", "/auth/confirm"];

export function AuthSessionRedirect() {
  const pathname = usePathname();

  useEffect(() => {
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

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        debugLog(
          "AuthSessionRedirect.tsx:onAuthStateChange",
          "auth event",
          { event, hasSession: Boolean(session), pathname },
          "C"
        );
        if (
          session &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
          AUTH_LANDING_PATHS.includes(pathname)
        ) {
          goDashboard(`auth-event-${event}`);
        }
      }
    );

    async function checkExistingSession() {
      const params = new URLSearchParams(window.location.search);
      const hasHash =
        window.location.hash.length > 1 &&
        (window.location.hash.includes("access_token") ||
          window.location.hash.includes("error"));

      debugLog(
        "AuthSessionRedirect.tsx:checkExistingSession",
        "session check on mount",
        {
          pathname,
          hasCode: Boolean(params.get("code")),
          hasHash,
          hash: window.location.hash.slice(0, 32),
        },
        "A"
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session && AUTH_LANDING_PATHS.includes(pathname)) {
        goDashboard("existing-session");
      }
    }

    checkExistingSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
