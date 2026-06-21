"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthConfirmPage() {
  useEffect(() => {
    async function confirmAuth() {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");

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
          window.location.href = "/dashboard";
          return;
        }
        window.location.href = "/login?error=confirmation_failed";
        return;
      }

      // Google OAuth — token arrives in the URL hash (#access_token=...)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.location.href = "/dashboard";
        return;
      }

      // Give Supabase a moment to process the hash
      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();
        if (retrySession) {
          window.location.href = "/dashboard";
        } else {
          window.location.href = "/login?error=oauth_failed";
        }
      }, 1000);
    }

    confirmAuth();
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
