"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    const exchangeCode = async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    };
    exchangeCode();

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", gap: "6px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#00d4aa",
            animation: "bounce 0.6s infinite",
          }}
        />
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#00d4aa",
            animation: "bounce 0.6s 0.15s infinite",
          }}
        />
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#00d4aa",
            animation: "bounce 0.6s 0.3s infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
