"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import { Pencil } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

const COMMON_TIMEZONES = [
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "America/Denver", label: "Denver (UTC-7/-6)" },
  { value: "America/Chicago", label: "Chicago (UTC-6/-5)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "Europe/London", label: "London (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Paris / Copenhagen (UTC+1/+2)" },
  { value: "Europe/Helsinki", label: "Helsinki (UTC+2/+3)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Asia/Kolkata", label: "Mumbai / Delhi (UTC+5:30)" },
  { value: "Asia/Bangkok", label: "Bangkok / Jakarta (UTC+7)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)" },
  { value: "Pacific/Auckland", label: "Auckland (UTC+12/+13)" },
];

const ALL_APPS = [
  { key: "google", name: "Google", description: "Gmail + Google Sheets", icon: "🔵" },
  { key: "slack", name: "Slack", description: "Send messages to channels", icon: "💬" },
  { key: "typeform", name: "Typeform", description: "Form submission triggers", icon: "📋" },
  { key: "notion", name: "Notion", description: "Create pages and database rows", icon: "📓" },
  {
    key: "calendly",
    name: "Calendly",
    description: "Trigger automations from bookings",
    icon: "📅",
    note: "Requires a paid Calendly plan for webhooks",
  },
];

/* Sidebar connected apps indicator — hidden for now, reconsidering placement
const APP_INDICATORS = [
  { key: "google", icon: "🔵", label: "Google" },
  { key: "slack", icon: "💬", label: "Slack" },
  { key: "typeform", icon: "📋", label: "Typeform" },
];
*/

function ConnectedAppsSection({ userId }: { userId?: string }) {
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("platform_accounts")
      .select("platform")
      .eq("user_id", userId)
      .then(({ data }) => {
        setConnectedApps(data?.map((a) => a.platform) || []);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-2">
      {ALL_APPS.map((app) => {
        const isConnected = connectedApps.includes(app.key);
        const connectUrl = `${BACKEND_URL}/api/auth/${app.key}?userId=${userId}`;
        return (
          <div
            key={app.key}
            className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span>{app.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{app.name}</p>
                <p className="text-xs text-muted-foreground">{app.description}</p>
                {"note" in app && app.note ? (
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{app.note}</p>
                ) : null}
              </div>
            </div>
            {isConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-accent">
                  ✓ Connected
                </span>
                <a
                  href={connectUrl}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reconnect
                </a>
              </div>
            ) : (
              <a
                href={connectUrl}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90"
              >
                Connect
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

function normalizeUsage(data: {
  plan?: string;
  planName?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  [key: string]: unknown;
}) {
  const plan = data.plan || "free";
  return {
    ...data,
    plan,
    planName: PLAN_DISPLAY_NAMES[plan] || data.planName || "Free",
    cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
    currentPeriodEnd: data.currentPeriodEnd || null,
  };
}

const TEMPLATES = [
  {
    trigger: "📋",
    action: "📊",
    name: "Save form responses to Google Sheets",
    prompt: "When someone fills my Typeform, add their response to my Google Sheet",
    category: "Lead Capture",
  },
  {
    trigger: "📋",
    action: "💬",
    name: "Notify Slack on form submit",
    prompt: "When someone fills my Typeform, send a Slack message to my team",
    category: "Lead Capture",
  },
  {
    trigger: "📋",
    action: "📧",
    name: "Email new leads automatically",
    prompt: "When someone fills my Typeform, send them a welcome email via Gmail",
    category: "Lead Capture",
  },
  {
    trigger: "⏰",
    action: "💬",
    name: "Weekly team reminder in Slack",
    prompt: "Every Friday at 4pm, send a reminder to my Slack channel",
    category: "Team",
  },
  {
    trigger: "⏰",
    action: "📧",
    name: "Weekly summary email",
    prompt: "Every Friday at 5pm, send me a weekly summary email",
    category: "Reporting",
  },
  {
    trigger: "📊",
    action: "💬",
    name: "Alert team when sheet updates",
    prompt: "When a new row is added to my Google Sheet, send a Slack message",
    category: "Reporting",
  },
  {
    trigger: "💳",
    action: "📧",
    name: "Welcome email on new payment",
    prompt: "When I get a new Stripe payment, send a welcome email to the customer",
    category: "Sales",
  },
  {
    trigger: "💳",
    action: "📊",
    name: "Log payments to spreadsheet",
    prompt: "When I get a new Stripe payment, add it to my Google Sheet",
    category: "Sales",
  },
];

const TEMPLATE_CATEGORIES = ["All", "Lead Capture", "Team", "Reporting", "Sales"];

type Automation = {
  id: string;
  auto_name: string | null;
  name: string | null;
  status: string;
  stage: string;
  last_message_at: string;
  n8n_workflow_id: string | null;
  trigger_app: string | null;
  action_apps: string[] | null;
};

type ChatMessage =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string; thinking?: boolean }
  | { type: "connect"; app: string; url: string; message: string }
  | { type: "test_result"; summary: string }
  | { type: "live"; summary: string }
  | {
      type: "quick_replies";
      options: { label: string; value: string }[];
    }
  | { type: "error"; text: string };

function joinStreamText(existing: string, chunk: string): string {
  if (!chunk) return existing;
  if (!existing) return chunk;
  const trimmedEnd = existing.trimEnd();
  if (/^\s/.test(chunk)) {
    return existing + chunk;
  }
  if (/[.!?]["']?$/.test(trimmedEnd)) {
    const rest = chunk.trimStart();
    if (/^[A-Z]/.test(rest)) {
      return `${trimmedEnd}\n\n${rest}`;
    }
    return `${existing} ${chunk}`;
  }
  return existing + chunk;
}

function normalizePunctuationSpacing(text: string): string {
  return text.replace(/([.!?])([A-Za-z])/g, "$1 $2");
}

function getDisplayName(automation: Automation): string {
  return automation.auto_name || automation.name || "New automation";
}

function isTempAutomationId(id: string | null | undefined): boolean {
  return id?.startsWith("new-") ?? false;
}

function getStatusColor(status: string): string {
  if (status === "active") return "#00d4aa";
  if (status === "broken") return "rgba(255,100,100,0.8)";
  if (status === "paused") return "#e9b872";
  if (status === "draft") return "rgba(255,255,255,0.2)";
  if (status === "building") return "#e9b872";
  return "rgba(255,255,255,0.2)";
}

function getStatusLabel(status: string): string {
  if (status === "active") return "Live";
  if (status === "broken") return "Broken";
  if (status === "paused") return "Paused";
  if (status === "draft") return "Draft";
  if (status === "building") return "Building";
  return "Draft";
}

function getStatusPillClass(status: string): string {
  if (status === "active") return "bg-[rgba(0,212,170,0.1)] text-[#00d4aa]";
  if (status === "broken")
    return "bg-[rgba(255,80,80,0.1)] text-[rgba(255,100,100,0.8)]";
  if (status === "paused") return "bg-[rgba(233,184,114,0.1)] text-[#e9b872]";
  if (status === "draft")
    return "bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)]";
  if (status === "building") return "bg-[rgba(233,184,114,0.1)] text-[#e9b872]";
  return "bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)]";
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function getChatStatusPillClass(status: string): string {
  if (status === "active")
    return "rounded-full bg-[#d1fae5] px-2 py-0.5 text-[9px] text-[#065f46]";
  if (status === "broken")
    return "rounded-full bg-[#fee2e2] px-2 py-0.5 text-[9px] text-[#991b1b]";
  if (status === "paused")
    return "rounded-full bg-[#fef3c7] px-2 py-0.5 text-[9px] text-[#92400e]";
  if (status === "draft")
    return "rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] text-[#6b7280]";
  if (status === "building")
    return "rounded-full bg-[#fef3c7] px-2 py-0.5 text-[9px] text-[#92400e]";
  return "rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] text-[#6b7280]";
}

function formatAppName(app: string): string {
  return app.charAt(0).toUpperCase() + app.slice(1).replace(/_/g, " ");
}

type Execution = {
  id: string;
  status: string;
  mode: string;
  ran_at: string;
  details?: {
    type: string;
    channel?: string;
    message?: string;
    to?: string;
    subject?: string;
    error_type?: string;
    failed_node?: string;
  };
  error_message?: string;
};

type MobileTab = "chat" | "automations" | "account";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentAutomationId, setCurrentAutomationId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("All");
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<Execution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [usage, setUsage] = useState<{
    plan: string;
    planName: string;
    runsUsed: number;
    testRunsUsed: number;
    runsLimit: number;
    runsRemaining: number;
    daysUntilReset: number;
    status: string;
    percentUsed: number;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTimezone, setSettingsTimezone] = useState("UTC");
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>("UTC");
  /* const [sidebarConnectedApps, setSidebarConnectedApps] = useState<string[]>([]); */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const userInitiatedNewRef = useRef(false);
  const isSendingRef = useRef(false);

  function showToast(
    message: string,
    type: "success" | "error" | "warning" = "success"
  ) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function saveTimezone() {
    if (!user) return;
    setSavingTimezone(true);
    try {
      await fetch(`${BACKEND_URL}/api/chat/profile/timezone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          timezone: settingsTimezone,
        }),
      });
      setUserTimezone(settingsTimezone);
      setTimezoneSaved(true);
      setTimeout(() => setTimezoneSaved(false), 2000);
    } catch {
      // ignore
    }
    setSavingTimezone(false);
  }

  async function saveTheme(newTheme: "light" | "dark") {
    setTheme(newTheme);
    if (!user) return;
    await fetch(`${BACKEND_URL}/api/chat/profile/theme`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, theme: newTheme }),
    });
  }

  async function fetchHistory(automationId: string) {
    if (!user || !automationId || automationId.startsWith("new-")) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/chat/automations/${automationId}/history?userId=${user.id}`
      );
      const data = await res.json();
      setHistory(data.executions || []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function fetchUsage(userId: string) {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/chat/usage?userId=${userId}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        console.error("Usage API error:", data);
        return;
      }
      const normalized = normalizeUsage(data);
      console.log("Usage fetched:", normalized);
      const savedTheme = (data.theme as string) || "light";
      setTheme(savedTheme === "dark" ? "dark" : "light");
      setUsage(
        normalized as {
          plan: string;
          planName: string;
          runsUsed: number;
          testRunsUsed: number;
          runsLimit: number;
          runsRemaining: number;
          daysUntilReset: number;
          status: string;
          percentUsed: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: string | null;
        }
      );
    } catch (err) {
      console.error("Failed to fetch usage:", err);
    }
  }

  async function handleCheckout(plan: string) {
    if (!user) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Failed to start checkout: " + data.error);
      }
    } catch {
      alert("Something went wrong");
    }
  }

  async function handlePortal() {
    if (!user) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/billing/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert("Something went wrong");
    }
  }

  const processChatStream = useCallback(
    async (response: Response, userId: string) => {
      if (!response.ok) {
        throw new Error("Stream request failed");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "text") {
              const chunk = event.text;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.type === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    text: normalizePunctuationSpacing(
                      joinStreamText(last.text, chunk)
                    ),
                    thinking: false,
                  };
                }
                return updated;
              });
            }

            if (event.type === "tool_start") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.type === "assistant" && !last.text) {
                  updated[updated.length - 1] = {
                    ...last,
                    thinking: true,
                  };
                }
                return updated;
              });
            }

            if (event.type === "tool_end") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.type === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    thinking: false,
                  };
                }
                return updated;
              });
            }

            if (event.type === "done") {
              const { action, actionData, updatedState } = event;
              const savedAutomationId = updatedState?.automationId;
              const savedAutoName = updatedState?.autoName;

              if (action === "quick_replies" && actionData?.options) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "quick_replies",
                    options: actionData.options,
                  },
                ]);
              }

              if (action === "request_connection" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "connect",
                    app: actionData.app,
                    url: `${BACKEND_URL}/api/auth/${actionData.app}?userId=${userId}`,
                    message: actionData.message,
                  },
                ]);
              }

              if (action === "show_test_result" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "test_result",
                    summary: actionData.summary || actionData.message || "Test completed.",
                  },
                ]);
              }

              if (action === "automation_live" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "live",
                    summary:
                      actionData.summary || actionData.message || "Your automation is now live.",
                  },
                ]);
                setAutomations((prev) =>
                  prev.map((a) =>
                    a.id === savedAutomationId ? { ...a, status: "active" } : a
                  )
                );
              }

              if (savedAutomationId) {
                setAutomations((prev) =>
                  prev.map((a) =>
                    a.id.startsWith("new-")
                      ? {
                          ...a,
                          id: savedAutomationId,
                          auto_name: savedAutoName || "New automation",
                        }
                      : a
                  )
                );
                setSelectedId(savedAutomationId);
                setCurrentAutomationId(savedAutomationId);
              }

              if (
                savedAutoName &&
                savedAutomationId &&
                !selectedId?.startsWith("new-")
              ) {
                const listRes = await fetch(
                  `${BACKEND_URL}/api/chat/automations?userId=${userId}`
                );
                const listData = await listRes.json();
                if (listRes.ok) {
                  setAutomations(listData.automations || []);
                }
              }
            }

            if (event.type === "error") {
              setMessages((prev) => [
                ...prev,
                {
                  type: "error",
                  text: event.message || "Something went wrong",
                },
              ]);
            }
          } catch {
            console.error("Failed to parse SSE event:", jsonStr);
          }
        }
      }
    },
    [selectedId]
  );

  const loadAutomation = useCallback(
    async (id: string, userId: string) => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/chat/automations/${id}?userId=${userId}`
        );
        const data = await response.json();

        if (!response.ok) {
          console.error("Load automation error:", data.error);
          return;
        }

        const automation = data.automation;
        setSelectedId(id);
        setCurrentAutomationId(id);
        setActiveTab("chat");

        if (automation?.status === "broken") {
          setMessages([{ type: "assistant", text: "", thinking: true }]);
          setLoading(true);

          try {
            const streamResponse = await fetch(
              `${BACKEND_URL}/api/chat/message/stream`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId,
                  automationId: automation.id,
                  message: "__error_resolution_start__",
                  conversationHistory: [],
                  timezone: userTimezone,
                }),
              }
            );
            await processChatStream(streamResponse, userId);
          } catch (err) {
            console.error("Error resolution start failed:", err);
            setMessages([
              {
                type: "error",
                text: "Could not start error resolution. Please try sending a message.",
              },
            ]);
          } finally {
            setLoading(false);
          }
          return;
        }

        const rawMessages: ChatMessage[] = [];

        for (const turn of automation?.conversation || []) {
          if (turn.role === "user") {
            rawMessages.push({ type: "user", text: turn.content });
          } else {
            const connectMatch = turn.content.match(
              /https?:\/\/[^\s]+\/api\/auth\/(slack|google|typeform|airtable|notion|calendly)/
            );
            if (connectMatch) {
              const app = connectMatch[1];
              const url = connectMatch[0];
              const cleanMessage = turn.content
                .replace(
                  /Click here to connect your \w+:?\s*https?:\/\/[^\s]+/gi,
                  ""
                )
                .replace(/https?:\/\/[^\s]+\/api\/auth\/\w+/g, "")
                .trim();
              if (cleanMessage) {
                rawMessages.push({ type: "assistant", text: cleanMessage });
              }
              rawMessages.push({
                type: "connect",
                app,
                url: `${url.split("?")[0]}?userId=${userId}`,
                message: `I need access to your ${app.charAt(0).toUpperCase() + app.slice(1)} to continue setting up your automation.`,
              });
            } else {
              rawMessages.push({ type: "assistant", text: turn.content });
            }
          }
        }

        setMessages(rawMessages);
      } catch (err) {
        console.error("Load automation error:", err);
      }
    },
    [processChatStream, userTimezone]
  );

  const fetchAutomations = useCallback(
    async (userId: string, autoSelectFirst = true) => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/chat/automations?userId=${userId}`
        );
        const data = await response.json();

        if (!response.ok) {
          console.error("Fetch automations error:", data.error);
          return;
        }

        const list: Automation[] = data.automations || [];
        setAutomations(list);

        if (
          autoSelectFirst &&
          list.length > 0 &&
          !userInitiatedNewRef.current
        ) {
          await loadAutomation(list[0].id, userId);
        }
        userInitiatedNewRef.current = false;
      } catch (err) {
        console.error("Fetch automations error:", err);
      } finally {
        setLoadingAutomations(false);
      }
    },
    [loadAutomation]
  );

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!mounted) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);

        const params = new URLSearchParams(window.location.search);
        const connectedApp = params.get("connected");
        if (connectedApp) {
          window.history.replaceState({}, "", "/dashboard");
          // Show a brief success toast instead of sending a chat message
          const appLabel =
            connectedApp.charAt(0).toUpperCase() + connectedApp.slice(1);
          showToast(`${appLabel} connected successfully`, "success");
        }

        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
      } else {
        setUser(data.user);
      }
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        window.location.href = "/login";
        return;
      }

      if (session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user?.id) return;

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setUserTimezone(detectedTimezone);

    fetch(`${BACKEND_URL}/api/chat/profile/timezone`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, timezone: detectedTimezone }),
    }).catch(console.error);

    console.log("Calling fetchUsage for user:", user.id);
    fetchUsage(user.id);

    /* supabase
      .from("platform_accounts")
      .select("platform")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setSidebarConnectedApps(data?.map((a) => a.platform) || []);
      }); */

    const params = new URLSearchParams(window.location.search);
    const fixId = params.get("fix");
    if (fixId) {
      window.history.replaceState({}, "", "/dashboard");
      setSelectedId(fixId);
      setCurrentAutomationId(fixId);
      loadAutomation(fixId, user.id);
      fetchAutomations(user.id, false);
    } else {
      fetchAutomations(user.id, true);
    }

    const handleFocus = () => {
      console.log("Window focused - refreshing usage");
      fetchUsage(user.id);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!showSettings || !user) return;
    fetch(`${BACKEND_URL}/api/chat/usage?userId=${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.timezone) setSettingsTimezone(data.timezone);
      })
      .catch(() => {});
  }, [showSettings, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const plan = params.get("plan");

    if (checkout === "success" && plan) {
      showToast(`Successfully upgraded to ${plan} plan! 🎉`, "success");
      setTimeout(() => {
        if (user) fetchUsage(user.id);
      }, 1000);
      window.history.replaceState({}, "", "/dashboard");
    }

    if (checkout === "cancelled") {
      showToast("Checkout cancelled", "error");
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [user]);

  useEffect(() => {
    if (showUpgradeModal && usage) {
      console.log("Current usage plan:", usage.plan);
    }
  }, [showUpgradeModal, usage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showTemplates) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        templatesRef.current &&
        !templatesRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTemplates]);

  const handleNewAutomation = () => {
    userInitiatedNewRef.current = true;
    const tempId = "new-" + Date.now();

    setAutomations((prev) => [
      {
        id: tempId,
        auto_name: "New automation",
        name: null,
        status: "draft",
        stage: "gathering_info",
        last_message_at: new Date().toISOString(),
        n8n_workflow_id: null,
        trigger_app: null,
        action_apps: null,
      },
      ...prev.filter((a) => !a.id.startsWith("new-")),
    ]);

    setSelectedId(tempId);
    setMessages([]);
    setInput("");
    setCurrentAutomationId(null);
    setActiveTab("chat");
    inputRef.current?.focus();
  };

  const handleSelectAutomation = (id: string) => {
    if (!user) return;

    if (isTempAutomationId(id)) {
      setSelectedId(id);
      setCurrentAutomationId(null);
      setActiveTab("chat");
      return;
    }

    // Remove any temp placeholder when selecting a real automation
    setAutomations((prev) => prev.filter((a) => !a.id.startsWith("new-")));
    loadAutomation(id, user.id);
  };

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || !user) return;
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      const automationIdForRequest = isTempAutomationId(selectedId)
        ? null
        : currentAutomationId ?? selectedId;
      setLoading(true);

      flushSync(() => {
        setMessages((prev) => [...prev, { type: "user", text: userMessage }]);
      });

      flushSync(() => {
        setMessages((prev) => [
          ...prev,
          { type: "assistant", text: "", thinking: true },
        ]);
      });

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat/message/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            automationId: automationIdForRequest,
            message: userMessage,
            conversationHistory: [],
            timezone: userTimezone,
          }),
        });

        await processChatStream(response, user.id);
      } catch (err) {
        const text = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => {
          const updated = prev.filter(
            (m, i) =>
              !(i === prev.length - 1 && m.type === "assistant" && !m.text)
          );
          return [...updated, { type: "error", text }];
        });
      } finally {
        setLoading(false);
        isSendingRef.current = false;
      }
    },
    [user, selectedId, currentAutomationId, processChatStream, userTimezone]
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading || !user) return;

    const userMessage = input.trim();
    setInput("");
    await sendMessage(userMessage);
  }, [input, loading, user, sendMessage]);

  const handleQuickReply = useCallback(
    async (value: string) => {
      if (loading || !user) return;
      await sendMessage(value);
    },
    [loading, user, sendMessage]
  );

  useEffect(() => {
    const handleAutoSubmit = () => {
      if (input.trim()) {
        handleSubmit();
      }
    };
    document.addEventListener("autosubmit", handleAutoSubmit);
    return () => document.removeEventListener("autosubmit", handleAutoSubmit);
  }, [input, handleSubmit]);

  function handleTemplateSelect(prompt: string) {
    setInput(prompt);
    setShowTemplates(false);
    inputRef.current?.focus();
  }

  function handleDelete(id: string) {
    if (!user) return;

    if (id.startsWith("new-")) {
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      setSelectedId(null);
      setCurrentAutomationId(null);
      setMessages([]);
      return;
    }

    setConfirmDelete(id);
  }

  async function confirmDeleteAutomation() {
    if (!confirmDelete || !user) return;
    const id = confirmDelete;
    setConfirmDelete(null);

    if (isTempAutomationId(id)) {
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentAutomationId(null);
        setMessages([]);
      }
      showToast("Automation deleted successfully");
      return;
    }

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/chat/automations/${id}?userId=${user.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setAutomations((prev) => prev.filter((a) => a.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setCurrentAutomationId(null);
          setMessages([]);
        }
        showToast("Automation deleted successfully");
      } else {
        showToast("Failed to delete automation", "error");
      }
    } catch {
      showToast("Failed to delete automation", "error");
    }
  }

  async function handlePause(id: string) {
    if (!user || isTempAutomationId(id)) return;

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/chat/automations/${id}/pause?userId=${user.id}`,
        { method: "PATCH" }
      );
      const data = await res.json();
      if (data.success) {
        setAutomations((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: data.status } : a
          )
        );
        if (data.status === "paused") {
          showToast("Automation paused");
          setMessages((prev) => [
            ...prev,
            {
              type: "assistant",
              text: "Your automation is paused and will not run until you resume it. Click Resume whenever you are ready to turn it back on.",
            },
          ]);
        } else {
          showToast("Automation resumed");
          setMessages((prev) => [
            ...prev,
            {
              type: "assistant",
              text: "Your automation is back on and will run as scheduled.",
            },
          ]);
        }
      } else {
        showToast("Failed to update automation", "error");
      }
    } catch {
      showToast("Failed to update automation", "error");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const selectedAutomation = automations.find((a) => a.id === selectedId);

  const handleMobileAutomationSelect = (id: string) => {
    handleSelectAutomation(id);
    setMobileTab("chat");
  };

  const renderAutomationList = (
    onSelect: (id: string) => void = handleSelectAutomation
  ) => {
    if (loadingAutomations) {
      return (
        <div className="p-4 text-center text-xs text-[rgba(255,255,255,0.2)]">
          Loading...
        </div>
      );
    }

    if (automations.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No automations yet. Start one!
        </div>
      );
    }

    return (
      <>
        {automations.some((a) => a.status === "broken") && (
          <div className="mb-2 px-3">
            <p className="mb-1.5 text-xs font-medium text-red-400">
              NEEDS ATTENTION
            </p>
            {automations
              .filter((a) => a.status === "broken")
              .map((auto) => (
                <button
                  key={auto.id}
                  type="button"
                  onClick={() => onSelect(auto.id)}
                  className={`mb-1 w-full rounded-xl border border-red-500/30 bg-red-900/10 px-3 py-2.5 text-left transition-colors hover:bg-red-900/20 ${
                    selectedId === auto.id ? "ring-1 ring-red-500/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
                    <span className="truncate text-xs font-medium text-red-300">
                      {getDisplayName(auto)}
                    </span>
                  </div>
                  <p className="ml-3.5 mt-0.5 text-[10px] text-red-400/70">
                    Needs attention
                  </p>
                </button>
              ))}
          </div>
        )}

        {automations.filter((a) => a.status !== "broken").length > 0 && (
          <>
            <div className="mb-1 mt-2 px-2 text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
              My automations
            </div>
            {automations
              .filter((a) => a.status !== "broken")
              .map((auto) => {
                const isSelected = auto.id === selectedId;
                return (
                  <button
                    key={auto.id}
                    type="button"
                    onClick={() => onSelect(auto.id)}
                    className={
                      isSelected
                        ? "mb-1 w-full rounded-lg border border-gold/20 bg-accent/10 p-2 text-left text-foreground transition-colors"
                        : "mb-1 w-full rounded-lg border border-transparent p-2 text-left text-foreground transition-colors hover:bg-secondary"
                    }
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      {auto.status === "broken" ? (
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
                      ) : (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: getStatusColor(auto.status),
                          }}
                        />
                      )}
                      <span className="flex-1 truncate text-[11px] text-foreground">
                        {getDisplayName(auto)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${getStatusPillClass(auto.status)}`}
                      >
                        {getStatusLabel(auto.status)}
                      </span>
                    </div>
                    <div className="truncate pl-3 text-[9px] text-muted-foreground">
                      {formatTime(auto.last_message_at)}
                    </div>
                  </button>
                );
              })}
          </>
        )}
      </>
    );
  };

  return (
    <div className={`flex h-screen flex-col bg-background ${theme === "dark" ? "dark" : ""}`}>
      {/* TOP NAVBAR */}
      <nav className="shrink-0 px-4 pt-3 pb-0 bg-background">
        <div className="w-full">
          <div className="flex items-center justify-between rounded-2xl bg-card border border-border px-6 py-3 shadow-xl w-full">
            <Link
              href="/"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground">
                <span className="size-2.5 rounded-full bg-gold" />
              </span>
              Flowchat
            </Link>

            <div className="flex items-center gap-4">
              {automations.some((a) => a.status === "broken") && (
                <div className="flex items-center gap-1.5 rounded-full border border-[rgba(255,80,80,0.25)] bg-[rgba(255,80,80,0.1)] px-3 py-1 text-xs text-[rgba(255,120,120,0.9)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[rgba(255,100,100,0.9)]" />
                  {automations.filter((a) => a.status === "broken").length}{" "}
                  needs attention
                </div>
              )}

              <button
                type="button"
                onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}
                title={
                  theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-gold hover:text-foreground"
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>

              <div className="relative" data-user-menu>
                <button
                  type="button"
                  onClick={() => setShowUserMenu((prev) => !prev)}
                  className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 transition-colors hover:bg-secondary"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-gold-foreground">
                    {(
                      user?.user_metadata?.full_name?.[0] ||
                      user?.email?.[0] ||
                      "U"
                    ).toUpperCase()}
                  </div>
                  <span className="hidden text-sm text-foreground sm:block">
                    {user?.user_metadata?.full_name ||
                      user?.email?.split("@")[0]}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-[rgba(255,255,255,0.4)]"
                  >
                    <path
                      d="M2 4l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-secondary shadow-lg">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {user?.user_metadata?.full_name || "Account"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>

                    <div className="py-2">
                      <button
                        type="button"
                        onClick={() => setShowUserMenu(false)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                      >
                        <span>⚡</span>
                        <span>My Automations</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettings(true);
                          setShowUserMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                      >
                        <span>⚙️</span>
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUpgradeModal(true);
                          setShowUserMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                      >
                        <span>💳</span>
                        <span>Billing & subscription</span>
                      </button>
                    </div>

                    <div className="border-t border-border py-2">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <span>→</span>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden gap-0 px-4 pt-3 pb-0 md:gap-3 md:pb-4">
        {/* SIDEBAR — desktop only */}
        <aside className="hidden w-56 shrink-0 flex-col rounded-2xl border border-border bg-card md:flex">
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <button
              type="button"
              onClick={handleNewAutomation}
              className="flex items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-gold-foreground transition-colors hover:bg-gold/90"
            >
              + New automation
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {renderAutomationList()}
          </div>

          {/* Connected apps indicator — hidden for now, reconsidering placement
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Connected apps</span>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-xs text-accent hover:underline"
              >
                Manage
              </button>
            </div>
            <div className="flex gap-2">
              {APP_INDICATORS.map((app) => {
                const isConnected = sidebarConnectedApps.includes(app.key);
                return (
                  <div
                    key={app.key}
                    title={`${app.label}: ${isConnected ? "Connected" : "Not connected"}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-opacity ${
                      isConnected
                        ? "border border-accent bg-secondary opacity-100"
                        : "border border-border bg-secondary opacity-30"
                    }`}
                  >
                    {app.icon}
                  </div>
                );
              })}
            </div>
          </div>
          */}

          {usage && (
            <div className="border-t border-border px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {usage.planName} plan
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => user && fetchUsage(user.id)}
                    className="text-xs text-muted-foreground transition-colors hover:text-accent"
                    title="Refresh usage"
                  >
                    ↻
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {usage.cancelAtPeriodEnd && usage.currentPeriodEnd
                      ? `Cancels ${new Date(usage.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : `${usage.daysUntilReset}d until reset`}
                  </span>
                </div>
              </div>

              <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.status === "limit_reached"
                      ? "bg-red-500"
                      : usage.status === "critical"
                        ? "bg-red-400"
                        : usage.status === "warning"
                          ? "bg-amber-400"
                          : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
                />
              </div>

              <span className="text-xs text-muted-foreground">
                {usage.runsUsed.toLocaleString()} /{" "}
                {usage.runsLimit.toLocaleString()} runs
              </span>

              {usage.status === "warning" && (
                <p className="mt-1 text-xs text-amber-400">⚠️ Running low</p>
              )}
              {usage.status === "critical" && (
                <p className="mt-1 text-xs text-red-400">
                  ⚠️ Almost out of runs
                </p>
              )}
              {usage.status === "limit_reached" && (
                <p className="mt-1 text-xs text-red-400">
                  ✗ Run limit reached
                </p>
              )}
            </div>
          )}
        </aside>

        {/* MOBILE — automations tab */}
        <div
          className={`flex-1 overflow-y-auto bg-background pb-20 ${
            mobileTab === "automations" ? "block md:hidden" : "hidden"
          }`}
        >
          <div className="border-b border-border p-3">
            <button
              type="button"
              onClick={() => {
                handleNewAutomation();
                setMobileTab("chat");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-gold-foreground transition-colors hover:bg-gold/90"
            >
              + New automation
            </button>
          </div>
          <div className="p-2">{renderAutomationList(handleMobileAutomationSelect)}</div>
        </div>

        {/* MOBILE — account tab */}
        <div
          className={`flex-1 bg-background pb-20 ${
            mobileTab === "account" ? "block md:hidden" : "hidden"
          }`}
        >
          <div className="space-y-4 px-4 py-6">
            <div className="rounded-xl border border-border bg-secondary p-4">
              <p className="font-medium text-foreground">
                {user?.user_metadata?.full_name || "Account"}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            {usage && (
              <div className="rounded-xl border border-border bg-secondary p-4">
                <p className="mb-2 text-xs font-medium text-foreground">
                  {usage.planName} plan
                </p>
                <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.runsUsed} / {usage.runsLimit} runs ·{" "}
                  {usage.daysUntilReset}d until reset
                </p>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-border bg-secondary">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="w-full border-b border-border px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                💳 Billing & subscription
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
              >
                → Sign out
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <main
          className={`min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white pb-20 md:pb-0 ${
            mobileTab === "chat" ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedId === null && messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-white px-8">
              <div
                className="mb-2 text-2xl font-bold text-[#111]"
                style={{ letterSpacing: "-0.02em" }}
              >
                What would you like to automate?
              </div>
              <div className="mb-10 text-sm text-[#9ca3af]">
                Choose a template to get started, or describe it in your own
                words below
              </div>
              <div className="grid w-full max-w-2xl grid-cols-2 gap-3">
                {TEMPLATES.slice(0, 4).map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleTemplateSelect(tpl.prompt)}
                    className="cursor-pointer rounded-xl border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#0d1420] hover:shadow-sm"
                  >
                    <div className="mb-3 flex items-center gap-1.5 text-base">
                      <span>{tpl.trigger}</span>
                      <span className="text-xs text-[#9ca3af]">→</span>
                      <span>{tpl.action}</span>
                    </div>
                    <div className="mb-1 text-xs font-medium text-[#111]">
                      {tpl.name}
                    </div>
                    <div className="text-[10px] text-[#9ca3af]">{tpl.category}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-[#f3f4f6] bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  {editingTitle ? (
                    <input
                      autoFocus
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={async () => {
                        setEditingTitle(false);
                        if (
                          titleValue.trim() &&
                          titleValue !== selectedAutomation?.auto_name
                        ) {
                          await fetch(
                            `${BACKEND_URL}/api/chat/automations/${selectedId}/rename`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                userId: user?.id,
                                name: titleValue.trim(),
                              }),
                            }
                          );
                          setAutomations((prev) =>
                            prev.map((a) =>
                              a.id === selectedId
                                ? { ...a, auto_name: titleValue.trim() }
                                : a
                            )
                          );
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          setEditingTitle(false);
                          setTitleValue(selectedAutomation?.auto_name || "");
                        }
                      }}
                      className="w-full max-w-xs border-b border-accent bg-transparent text-sm font-medium text-[#111] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTitleValue(selectedAutomation?.auto_name || "");
                        setEditingTitle(true);
                      }}
                      className="group flex items-center gap-1.5 text-left text-sm font-medium text-[#111] transition-colors hover:text-accent"
                      title="Click to rename"
                    >
                      <span className="max-w-xs truncate">
                        {selectedAutomation?.auto_name || "New automation"}
                      </span>
                      <Pencil className="h-3 w-3 flex-shrink-0 opacity-30 transition-opacity group-hover:opacity-70" />
                    </button>
                  )}
                  {selectedAutomation && (
                    <span className={getChatStatusPillClass(selectedAutomation.status)}>
                      ● {getStatusLabel(selectedAutomation.status)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("chat")}
                      className={
                        activeTab === "chat"
                          ? "rounded-md bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#111]"
                          : "rounded-md px-3 py-1 text-xs text-[#9ca3af] transition-colors hover:text-[#111]"
                      }
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("history");
                        if (selectedId) fetchHistory(selectedId);
                      }}
                      className={
                        activeTab === "history"
                          ? "rounded-md bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#111]"
                          : "rounded-md px-3 py-1 text-xs text-[#9ca3af] transition-colors hover:text-[#111]"
                      }
                    >
                      History
                    </button>
                  </div>
                  {selectedId && !selectedId.startsWith("new-") && (() => {
                    const currentAuto = automations.find(
                      (a) => a.id === selectedId
                    );
                    const isPaused = currentAuto?.status === "paused";
                    return (
                      <button
                        type="button"
                        onClick={() => handlePause(selectedId!)}
                        className="rounded-md border border-[#e5e7eb] px-2.5 py-1 text-xs text-[#6b7280] transition-colors hover:text-[#111]"
                      >
                        {isPaused ? "Resume" : "Pause"}
                      </button>
                    );
                  })()}
                  {selectedId && !selectedId.startsWith("new-") && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedId)}
                    className="rounded-md border border-[#fee2e2] px-2.5 py-1 text-xs text-[#ef4444] transition-colors hover:bg-[#fee2e2]"
                  >
                    Delete
                  </button>
                  )}
                </div>
              </div>

              {activeTab === "chat" ? (
                <div className="flex-1 overflow-y-auto bg-white px-6 py-4">
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {messages.map((msg, idx) => (
                      <div key={idx}>
                        {msg.type === "user" && (
                          <div className="flex justify-end">
                            <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground">
                              {msg.text}
                            </div>
                          </div>
                        )}
                        {msg.type === "assistant" && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm sm:max-w-md">
                              <div className="mb-1 text-xs font-medium text-accent">
                                Flowchat
                              </div>
                              {msg.thinking && !msg.text ? (
                                <div className="flex gap-1 py-1">
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-accent"
                                    style={{ animationDelay: "0ms" }}
                                  />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-accent"
                                    style={{ animationDelay: "150ms" }}
                                  />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-accent"
                                    style={{ animationDelay: "300ms" }}
                                  />
                                </div>
                              ) : (
                                <div className="prose prose-sm prose-p:my-2 max-w-none text-sm leading-relaxed text-[#374151]">
                                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {msg.type === "connect" && (
                          <div className="flex justify-start">
                            <div className="max-w-[72%] rounded-2xl rounded-bl-sm bg-[#f3f4f6] px-4 py-3">
                              <p className="mb-2 text-sm text-[#374151]">
                                {msg.message}
                              </p>
                              <button
                                type="button"
                                onClick={() => window.open(msg.url, "_blank")}
                                className="rounded-full bg-card px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                              >
                                Connect {formatAppName(msg.app)} →
                              </button>
                            </div>
                          </div>
                        )}
                        {msg.type === "test_result" && (
                          <div className="flex justify-start">
                            <div className="max-w-[72%] rounded-2xl rounded-bl-sm border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
                              <p className="mb-1 text-xs font-medium text-[#16a34a]">
                                ✅ Test complete
                              </p>
                              <p className="text-sm text-[#374151]">{msg.summary}</p>
                            </div>
                          </div>
                        )}
                        {msg.type === "live" && (
                          <div className="flex justify-start">
                            <div className="max-w-[72%] rounded-2xl rounded-bl-sm border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
                              <p className="mb-1 text-xs font-medium text-[#16a34a]">
                                🎉 Automation is live!
                              </p>
                              <p className="text-sm text-[#374151]">{msg.summary}</p>
                            </div>
                          </div>
                        )}
                        {msg.type === "quick_replies" && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] sm:max-w-md">
                              <div className="mt-2 flex flex-wrap gap-2">
                                {msg.options.map((option, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleQuickReply(option.value)}
                                    disabled={loading}
                                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:border-accent hover:bg-secondary hover:text-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {msg.type === "error" && (
                          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">
                            {msg.text}
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </div>
              ) : null}

              {activeTab === "history" && (
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {historyLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="flex gap-1">
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-accent"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-accent"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-accent"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-3 text-3xl">📋</div>
                      <p className="text-sm font-medium text-[#111]">
                        No runs yet
                      </p>
                      <p className="mt-1 text-xs text-[#6b7280]">
                        Executions will appear here once your automation starts
                        running.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((exec) => (
                        <div
                          key={exec.id}
                          className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  exec.status === "success"
                                    ? "bg-green-500"
                                    : "bg-red-500"
                                }`}
                              />
                              <div>
                                <p className="text-sm font-medium text-[#111]">
                                  {exec.status === "success"
                                    ? "✅ Ran successfully"
                                    : "❌ Something went wrong"}
                                </p>
                                <p className="text-xs text-[#6b7280]">
                                  {exec.mode === "webhook"
                                    ? "Test run"
                                    : "Ran on schedule"}
                                </p>
                                {exec.status === "success" && exec.details && (
                                  <p className="mt-0.5 text-xs text-[#9ca3af]">
                                    {exec.details.type === "slack_message" &&
                                      exec.details.message &&
                                      `Sent "${exec.details.message}" to ${exec.details.channel}`}
                                    {exec.details.type === "gmail" &&
                                      exec.details.subject &&
                                      `Sent "${exec.details.subject}" to ${exec.details.to}`}
                                  </p>
                                )}
                                {exec.status !== "success" &&
                                  exec.error_message && (
                                    <p className="mt-0.5 text-xs text-red-400">
                                      {exec.error_message}
                                    </p>
                                  )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs text-[#6b7280]">
                                {exec.ran_at
                                  ? new Date(exec.ran_at).toLocaleString(
                                      "en-GB",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }
                                    )
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </>
          )}

          {/* CHAT INPUT — always visible */}
          <div className="shrink-0 border-t border-[#f3f4f6] bg-white px-4 py-4">
            <div ref={templatesRef} className="relative w-full">
              {showTemplates && (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-[#374151]">
                      Choose a template
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTemplates(false)}
                      className="text-xs text-[#9ca3af] hover:text-[#111]"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTemplateCategory(cat)}
                        className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                          templateCategory === cat
                            ? "bg-card text-foreground"
                            : "border border-[#e5e7eb] text-[#6b7280] hover:border-[#0d1420] hover:text-[#0d1420]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {TEMPLATES.filter(
                      (t) =>
                        templateCategory === "All" ||
                        t.category === templateCategory
                    ).map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleTemplateSelect(tpl.prompt)}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f9fafb]"
                      >
                        <div className="flex shrink-0 items-center gap-1 text-sm">
                          <span>{tpl.trigger}</span>
                          <span className="text-[8px] text-[#d1d5db]">→</span>
                          <span>{tpl.action}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-medium text-[#374151]">
                            {tpl.name}
                          </div>
                          <div className="truncate text-[9px] text-[#9ca3af]">
                            &ldquo;{tpl.prompt}&rdquo;
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[8px] text-[#6b7280]">
                          {tpl.category}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Describe what you want to automate..."
                  rows={3}
                  disabled={loading || !user}
                  className="w-full resize-none rounded-2xl border border-[#e5e7eb] bg-white px-4 pb-12 pt-4 text-sm text-[#374151] placeholder-[#9ca3af] transition-all focus:border-[#e9b872] focus:outline-none focus:ring-2 focus:ring-[rgba(233,184,114,0.15)] disabled:opacity-50"
                  style={{ minHeight: "100px", maxHeight: "200px" }}
                />

                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={`absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    showTemplates
                      ? "bg-card text-foreground"
                      : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                  }`}
                >
                  ⚡ Templates
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !user}
                  className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border-none outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: "#e9b872",
                    boxShadow:
                      "0 0 0 4px rgba(233, 184, 114, 0.2), 0 4px 12px rgba(233, 184, 114, 0.4)",
                    animation: "pulse-gold 2s ease-in-out infinite",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
        <div className="flex">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition-colors ${
              mobileTab === "chat" ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <span className="text-lg">💬</span>
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("automations")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition-colors ${
              mobileTab === "automations" ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <span className="text-lg">⚡</span>
            <span>Automations</span>
          </button>
          <button
            type="button"
            onClick={() => {
              handleNewAutomation();
              setMobileTab("chat");
            }}
            className="flex flex-1 flex-col items-center gap-0.5 py-3 text-xs text-muted-foreground transition-colors"
          >
            <span className="text-lg font-light">＋</span>
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("account")}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition-colors ${
              mobileTab === "account" ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <span className="text-lg">👤</span>
            <span>Account</span>
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-2 text-base font-semibold text-[#111]">
              Delete this automation?
            </div>
            <div className="mb-6 text-sm text-[#6b7280]">
              This will permanently remove the automation and stop it from
              running. This cannot be undone.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f9fafb]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAutomation}
                className="flex-1 rounded-xl bg-[#dc2626] py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-[#b91c1c]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 animate-fade-in items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium shadow-xl transition-all md:bottom-6 ${
            toast.type === "success"
              ? "border border-border bg-card text-foreground"
              : toast.type === "error"
                ? "border border-[#fecaca] bg-[#fef2f2] text-[#dc2626]"
                : "border border-[#fde68a] bg-[#fffbeb] text-[#92400e]"
          }`}
        >
          <span>
            {toast.type === "success"
              ? "✅"
              : toast.type === "error"
                ? "❌"
                : "⚠️"}
          </span>
          {toast.message}
        </div>
      )}

      {showUpgradeModal && usage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Upgrade your plan
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    You&apos;re on the {usage.planName} plan · {usage.runsUsed}{" "}
                    / {usage.runsLimit} runs used
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary"
                >
                  ✕
                </button>
              </div>
            </div>

            {usage.cancelAtPeriodEnd ? (
              <div className="px-6 py-5">
                <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-4">
                  <p className="mb-1 text-sm font-medium text-foreground">
                    Your subscription is cancelled
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You have access until{" "}
                    {usage.currentPeriodEnd
                      ? new Date(usage.currentPeriodEnd).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }
                        )
                      : "end of billing period"}
                    . After that you will move to the Free plan.
                  </p>
                </div>
                <p className="mb-3 text-sm font-medium text-foreground">
                  Resubscribe
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleCheckout("pro")}
                    className="rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-accent"
                  >
                    <p className="text-sm font-semibold text-foreground">Pro</p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      $19.99
                      <span className="text-sm font-normal text-muted-foreground">
                        /mo
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      2,000 runs/month
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCheckout("business")}
                    className="rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-accent"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      Business
                    </p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      $49.99
                      <span className="text-sm font-normal text-muted-foreground">
                        /mo
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      10,000 runs/month
                    </p>
                  </button>
                </div>
              </div>
            ) : (
            <div className="px-6 py-5">
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div
                  className={`rounded-xl border-2 p-4 ${
                    usage.plan === "pro"
                      ? "border-accent bg-accent/5"
                      : "border-border"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      Pro
                    </span>
                    {usage.plan !== "pro" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        Popular
                      </span>
                    )}
                    {usage.plan === "pro" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mb-1 text-2xl font-bold text-foreground">
                    $19.99
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </p>
                  <ul className="mb-4 space-y-1 text-xs text-muted-foreground">
                    <li>✓ Unlimited automations</li>
                    <li>✓ 2,000 runs/month</li>
                    <li>✓ All apps</li>
                    <li>✓ Email support</li>
                  </ul>
                  {usage.plan !== "pro" ? (
                    <button
                      type="button"
                      onClick={() => handleCheckout("pro")}
                      className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/90"
                    >
                      Choose Pro
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-lg bg-secondary py-2 text-sm font-medium text-muted-foreground"
                    >
                      Current plan
                    </button>
                  )}
                </div>

                <div
                  className={`rounded-xl border-2 p-4 ${
                    usage.plan === "business"
                      ? "border-accent bg-accent/5"
                      : "border-border"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      Business
                    </span>
                    {usage.plan === "business" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mb-1 text-2xl font-bold text-foreground">
                    $49.99
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </p>
                  <ul className="mb-4 space-y-1 text-xs text-muted-foreground">
                    <li>✓ Unlimited automations</li>
                    <li>✓ 10,000 runs/month</li>
                    <li>✓ All apps</li>
                    <li>✓ 3 team seats</li>
                    <li>✓ Priority support</li>
                  </ul>
                  {usage.plan !== "business" ? (
                    <button
                      type="button"
                      onClick={() => handleCheckout("business")}
                      className="w-full rounded-lg border border-border py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      Choose Business
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-lg bg-secondary py-2 text-sm font-medium text-muted-foreground"
                    >
                      Current plan
                    </button>
                  )}
                </div>
              </div>

              {usage.plan !== "free" && (
                <div className="mt-2 border-t border-border pt-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Top up runs
                  </p>
                  <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Add 1,000 runs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Valid until your plan resets in {usage.daysUntilReset}{" "}
                        days
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckout("topup_1000")}
                      className="rounded-lg bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      $9.99
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={handlePortal}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage subscription, cancel, or update payment method →
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Settings</h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70vh] space-y-6 overflow-y-auto p-6">
              <div>
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Profile
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Name
                    </label>
                    <input
                      type="text"
                      value={
                        user?.user_metadata?.full_name ||
                        user?.email?.split("@")[0] ||
                        ""
                      }
                      readOnly
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Email
                    </label>
                    <input
                      type="text"
                      value={user?.email || ""}
                      readOnly
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Timezone
                </h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Used for all scheduled automations.
                </p>
                <div className="flex gap-2">
                  <select
                    value={settingsTimezone}
                    onChange={(e) => setSettingsTimezone(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveTimezone}
                    disabled={savingTimezone}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    {timezoneSaved ? "✓ Saved" : "Save"}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Connected apps
                </h3>
                <ConnectedAppsSection userId={user?.id} />
              </div>
            </div>

            <div className="border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-full rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-foreground transition-colors hover:border-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
