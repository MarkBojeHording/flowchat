"use client";

import { useEffect } from "react";

export default function SignupPage() {
  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get("plan");
    window.location.replace(
      "/login?tab=register" + (plan ? `&plan=${plan}` : "")
    );
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f1a]">
      <div className="text-center">
        <div className="mb-4 flex justify-center gap-1.5">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <p className="text-sm text-[#8888aa]">Taking you to sign up...</p>
      </div>
    </div>
  );
}
