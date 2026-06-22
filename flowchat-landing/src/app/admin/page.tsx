"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";
const ADMIN_EMAIL = "contact@flowchat.now";
const INTERNAL_API_KEY =
  process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "flowchat_internal_2026";

type AdminData = {
  users: number;
  totalWorkflows: number;
  activeWorkflows: number;
  brokenWorkflows: number;
  executions24h: { success: number; failures: number };
  recentFailures: {
    id: string;
    name: string;
    userId: string;
    lastErrorType: string;
    lastErrorMessage: string;
    consecutiveFailures: number;
    lastErrorAt: string;
  }[];
};

type Tab = "overview" | "workflows" | "users" | "system";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [n8nStatus, setN8nStatus] = useState<"checking" | "online" | "offline">(
    "checking"
  );

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        router.replace("/dashboard");
        return;
      }
      await fetchAdminData();
      await checkN8nStatus();
      setLoading(false);
    }
    init();
  }, [router]);

  async function fetchAdminData() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/executions/admin`, {
        headers: { "x-api-key": INTERNAL_API_KEY },
      });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
  }

  async function checkN8nStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      setN8nStatus(res.ok ? "online" : "offline");
    } catch {
      setN8nStatus("offline");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f1a]">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]" />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#00d4aa]"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "workflows", label: "Workflows" },
    { id: "users", label: "Users" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="border-b border-[#2a2a4a] px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#e8e8f0]">
              ⚡ Flowchat Admin
            </h1>
            <p className="text-xs text-[#8888aa]">Internal dashboard</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-[#8888aa] transition-colors hover:text-[#e8e8f0]"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>

      <div className="border-b border-[#2a2a4a] px-6">
        <div className="mx-auto flex max-w-6xl gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-[#00d4aa] text-[#00d4aa]"
                  : "border-transparent text-[#8888aa] hover:text-[#e8e8f0]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Total users", value: data?.users || 0 },
                { label: "Active workflows", value: data?.activeWorkflows || 0 },
                {
                  label: "Runs (24h)",
                  value:
                    (data?.executions24h.success || 0) +
                    (data?.executions24h.failures || 0),
                },
                {
                  label: "Broken",
                  value: data?.brokenWorkflows || 0,
                  alert: (data?.brokenWorkflows || 0) > 0,
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className={`rounded-xl border p-4 ${
                    metric.alert
                      ? "border-red-500/30 bg-red-900/10"
                      : "border-[#2a2a4a] bg-[#1a1a2e]"
                  }`}
                >
                  <p className="text-xs text-[#8888aa]">{metric.label}</p>
                  <p
                    className={`mt-1 text-2xl font-bold ${
                      metric.alert ? "text-red-400" : "text-[#e8e8f0]"
                    }`}
                  >
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
              <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">
                System status
              </h2>
              <div className="space-y-2">
                {[
                  { name: "Backend (Railway)", status: "online" },
                  { name: "n8n (DigitalOcean)", status: n8nStatus },
                  {
                    name: "Database (Supabase)",
                    status: data ? "online" : "offline",
                  },
                ].map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-[#8888aa]">
                      {service.name}
                    </span>
                    <span
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        service.status === "online"
                          ? "text-green-400"
                          : service.status === "checking"
                            ? "text-amber-400"
                            : "text-red-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          service.status === "online"
                            ? "bg-green-400"
                            : service.status === "checking"
                              ? "bg-amber-400"
                              : "bg-red-400"
                        }`}
                      />
                      {service.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
              <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">
                Recent failures{" "}
                {data?.recentFailures.length
                  ? `(${data.recentFailures.length})`
                  : ""}
              </h2>
              {!data?.recentFailures.length ? (
                <p className="text-sm text-[#8888aa]">
                  No broken automations ✅
                </p>
              ) : (
                <div className="space-y-3">
                  {data.recentFailures.map((failure) => (
                    <div
                      key={failure.id}
                      className="rounded-lg border border-red-500/20 bg-red-900/10 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-[#e8e8f0]">
                            {failure.name}
                          </p>
                          <p className="mt-0.5 text-xs text-[#8888aa]">
                            {failure.lastErrorType} ·{" "}
                            {failure.consecutiveFailures} failures
                          </p>
                          <p className="mt-1 text-xs text-red-400">
                            {failure.lastErrorMessage}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[#8888aa]">
                          {failure.lastErrorAt
                            ? new Date(failure.lastErrorAt).toLocaleString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
              <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">
                Executions (last 24h)
              </h2>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-[#8888aa]">Successful</p>
                  <p className="text-xl font-bold text-green-400">
                    {data?.executions24h.success || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#8888aa]">Failed</p>
                  <p className="text-xl font-bold text-red-400">
                    {data?.executions24h.failures || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "workflows" && (
          <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
            <p className="text-sm text-[#8888aa]">
              Workflow management coming soon.
            </p>
          </div>
        )}

        {activeTab === "users" && (
          <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
            <p className="text-sm text-[#8888aa]">
              User management coming soon.
            </p>
          </div>
        )}

        {activeTab === "system" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
              <h2 className="mb-4 text-sm font-medium text-[#e8e8f0]">
                Manual actions
              </h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={fetchAdminData}
                  className="rounded-lg border border-[#2a2a4a] px-4 py-2 text-sm text-[#e8e8f0] transition-colors hover:bg-[#2a2a4a]"
                >
                  ↻ Refresh data
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-5">
              <h2 className="mb-2 text-sm font-medium text-[#e8e8f0]">
                n8n instance
              </h2>
              <a
                href="https://n8n.flowchat.now"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#00d4aa] hover:underline"
              >
                Open n8n dashboard →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
