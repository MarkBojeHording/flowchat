"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

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
  | { type: "error"; text: string };

function getDisplayName(automation: Automation): string {
  return automation.auto_name || automation.name || "New automation";
}

function getStatusColor(status: string): string {
  if (status === "live") return "#00d4aa";
  if (status === "broken") return "rgba(255,100,100,0.8)";
  if (status === "building") return "#e9b872";
  if (status === "paused") return "rgba(255,255,255,0.2)";
  return "rgba(255,255,255,0.2)";
}

function getStatusLabel(status: string): string {
  if (status === "live") return "Live";
  if (status === "broken") return "Broken";
  if (status === "building") return "Building";
  if (status === "paused") return "Paused";
  if (status === "draft") return "Draft";
  return "Draft";
}

function getStatusPillClass(status: string): string {
  if (status === "live") return "bg-[rgba(0,212,170,0.1)] text-[#00d4aa]";
  if (status === "broken")
    return "bg-[rgba(255,80,80,0.1)] text-[rgba(255,100,100,0.8)]";
  if (status === "building") return "bg-[rgba(233,184,114,0.1)] text-[#e9b872]";
  if (status === "paused")
    return "bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb]";
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
  if (status === "live")
    return "rounded-full bg-[#d1fae5] px-2 py-0.5 text-[9px] text-[#065f46]";
  if (status === "broken")
    return "rounded-full bg-[#fee2e2] px-2 py-0.5 text-[9px] text-[#991b1b]";
  if (status === "building")
    return "rounded-full bg-[#fef3c7] px-2 py-0.5 text-[9px] text-[#92400e]";
  if (status === "paused")
    return "rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] text-[#6b7280] border border-[#e5e7eb]";
  return "rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] text-[#6b7280]";
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function formatAppName(app: string): string {
  return app.charAt(0).toUpperCase() + app.slice(1).replace(/_/g, " ");
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("All");
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function showToast(
    message: string,
    type: "success" | "error" | "warning" = "success"
  ) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadAutomation = useCallback(async (id: string, userId: string) => {
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
      const rawMessages: ChatMessage[] = [];

      for (const turn of automation?.conversation || []) {
        if (turn.role === "user") {
          rawMessages.push({ type: "user", text: turn.content });
        } else {
          const connectMatch = turn.content.match(
            /https?:\/\/[^\s]+\/api\/auth\/(slack|google|typeform|airtable|notion)/
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
      setSelectedId(id);
      setActiveTab("chat");
    } catch (err) {
      console.error("Load automation error:", err);
    }
  }, []);

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

        if (autoSelectFirst && list.length > 0) {
          await loadAutomation(list[0].id, userId);
        }
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

          setTimeout(async () => {
            if (!mounted) return;

            const confirmMessage = `I just connected ${connectedApp}`;

            const {
              data: { session: currentSession },
            } = await supabase.auth.getSession();
            if (!currentSession?.user) return;

            const res = await fetch(
              `${BACKEND_URL}/api/chat/automations?userId=${currentSession.user.id}`
            );
            const { automations: userAutomations } = await res.json();

            if (userAutomations && userAutomations.length > 0) {
              const mostRecent = userAutomations[0];
              setSelectedId(mostRecent.id);
              setAutomations(userAutomations);

              const autoRes = await fetch(
                `${BACKEND_URL}/api/chat/automations/${mostRecent.id}?userId=${currentSession.user.id}`
              );
              const { automation } = await autoRes.json();

              const rawMessages: ChatMessage[] = [];
              for (const turn of automation?.conversation || []) {
                if (turn.role === "user") {
                  rawMessages.push({ type: "user", text: turn.content });
                } else {
                  rawMessages.push({ type: "assistant", text: turn.content });
                }
              }
              setMessages(rawMessages);

              setInput(confirmMessage);
              setTimeout(() => {
                document.dispatchEvent(new Event("autosubmit"));
              }, 500);
            }
          }, 1000);
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

  useEffect(() => {
    if (!user) return;
    fetchAutomations(user.id);
  }, [user, fetchAutomations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
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

  function handleNewAutomation() {
    setSelectedId(null);
    setMessages([]);
    setInput("");
    setActiveTab("chat");
    inputRef.current?.focus();
  }

  function handleSelectAutomation(id: string) {
    if (!user) return;
    loadAutomation(id, user.id);
  }

  async function handleSubmit() {
    if (!input.trim() || loading || !user) return;

    const userMessage = input.trim();
    const currentAutomationId = selectedId;
    setInput("");
    setLoading(true);

    // Add user message immediately (optimistic)
    setMessages((prev) => [...prev, { type: "user", text: userMessage }]);

    // Add empty assistant message that will be filled by stream
    setMessages((prev) => [...prev, { type: "assistant", text: "" }]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/message/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          automationId: currentAutomationId,
          message: userMessage,
          conversationHistory: [],
        }),
      });

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
              // Append text to the last assistant message
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.type === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    text: last.text + event.text,
                  };
                }
                return updated;
              });
            }

            if (event.type === "tool_start") {
              // Show thinking indicator — update last assistant message
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
              // Clear thinking indicator
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

              // Handle actions after streaming completes
              if (action === "request_connection" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "connect",
                    app: actionData.app,
                    url: `${BACKEND_URL}/api/auth/${actionData.app}?userId=${user.id}`,
                    message: actionData.message,
                  },
                ]);
              }

              if (action === "show_test_result" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "test_result",
                    summary: actionData.summary || "Test completed.",
                  },
                ]);
              }

              if (action === "automation_live" && actionData) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "live",
                    summary:
                      actionData.summary || "Your automation is now live.",
                  },
                ]);
              }

              // Update state
              if (updatedState?.automationId) {
                setSelectedId(updatedState.automationId);
              }

              if (updatedState?.autoName && updatedState?.automationId) {
                // Refresh automations list
                fetchAutomations(user.id, false);
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
    } catch (err) {
      const text = err instanceof Error ? err.message : "Something went wrong";
      // Remove the empty assistant message and show error
      setMessages((prev) => {
        const updated = prev.filter(
          (m, i) =>
            !(i === prev.length - 1 && m.type === "assistant" && !m.text)
        );
        return [...updated, { type: "error", text }];
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handleAutoSubmit = () => {
      if (input.trim()) {
        handleSubmit();
      }
    };
    document.addEventListener("autosubmit", handleAutoSubmit);
    return () => document.removeEventListener("autosubmit", handleAutoSubmit);
  }, [input]);

  function handleTemplateSelect(prompt: string) {
    setInput(prompt);
    setShowTemplates(false);
    inputRef.current?.focus();
  }

  function handleDelete(id: string) {
    if (!user) return;
    setConfirmDelete(id);
  }

  async function confirmDeleteAutomation() {
    if (!confirmDelete || !user) return;
    const id = confirmDelete;
    setConfirmDelete(null);

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
    if (!user) return;

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

  return (
    <div className="flex h-screen flex-col bg-[#0a1020]">
      {/* TOP NAVBAR */}
      <nav className="shrink-0 px-4 pt-3 pb-0 bg-[#0a1020]">
        <div className="w-full">
          <div className="flex items-center justify-between rounded-2xl bg-[#0f1525] border border-[rgba(255,255,255,0.1)] px-6 py-3 shadow-xl w-full">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-white"
              style={{ letterSpacing: "-0.03em" }}
            >
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

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.15)] px-3 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.07)]"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9b872] text-xs font-bold text-[#0a0a0a]">
                    {(
                      user?.user_metadata?.full_name?.[0] ||
                      user?.email?.[0] ||
                      "U"
                    ).toUpperCase()}
                  </div>
                  <span className="hidden text-sm text-white sm:block">
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

                {dropdownOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[#141929] shadow-2xl">
                    <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
                      <div className="text-sm font-semibold text-white">
                        {user?.user_metadata?.full_name || "My Account"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[rgba(255,255,255,0.4)]">
                        {user?.email}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(false)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.07)] hover:text-white"
                      >
                        <span>⚡</span>
                        My Automations
                      </button>
                      <Link
                        href="/settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.07)] hover:text-white"
                      >
                        <span>⚙️</span>
                        Settings
                      </Link>
                    </div>

                    <div className="border-t border-[rgba(255,255,255,0.08)] py-1">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.07)] hover:text-white"
                      >
                        <span>→</span>
                        Sign out
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
      <div className="flex flex-1 gap-3 overflow-hidden px-4 pb-4 pt-3">
        {/* SIDEBAR */}
        <div className="flex w-56 shrink-0 flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0d1420]">
          <div className="flex flex-col gap-2 border-b border-[rgba(255,255,255,0.06)] p-3">
            <button
              type="button"
              onClick={handleNewAutomation}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#e9b872] px-3 py-2 text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#d4a05a]"
            >
              + New automation
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
              <span className="text-xs text-[rgba(255,255,255,0.25)]">🔍</span>
              <span className="text-xs text-[rgba(255,255,255,0.25)]">
                Search...
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingAutomations ? (
              <div className="p-4 text-center text-xs text-[rgba(255,255,255,0.2)]">
                Loading...
              </div>
            ) : automations.length === 0 ? (
              <div className="p-4 text-center text-xs text-[rgba(255,255,255,0.2)]">
                No automations yet. Start one!
              </div>
            ) : (
              <>
                {automations.filter((a) => a.status !== "broken").length >
                  0 && (
                  <>
                    <div className="mb-1 mt-2 px-2 text-[9px] font-medium uppercase tracking-widest text-[rgba(255,255,255,0.2)]">
                      My automations
                    </div>
                    {automations
                      .filter((a) => a.status !== "broken")
                      .map((auto) => (
                        <button
                          key={auto.id}
                          type="button"
                          onClick={() => handleSelectAutomation(auto.id)}
                          className={
                            selectedId === auto.id
                              ? "mb-1 w-full rounded-lg border border-[rgba(233,184,114,0.15)] bg-[rgba(233,184,114,0.07)] p-2 text-left transition-colors"
                              : "mb-1 w-full rounded-lg border border-transparent p-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                          }
                        >
                          <div className="mb-1 flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{
                                background: getStatusColor(auto.status),
                              }}
                            />
                            <span className="flex-1 truncate text-[11px] text-[rgba(255,255,255,0.75)]">
                              {getDisplayName(auto)}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${getStatusPillClass(auto.status)}`}
                            >
                              {getStatusLabel(auto.status)}
                            </span>
                          </div>
                          <div className="truncate pl-3 text-[9px] text-[rgba(255,255,255,0.25)]">
                            {formatTime(auto.last_message_at)}
                          </div>
                        </button>
                      ))}
                  </>
                )}

                {automations.filter((a) => a.status === "broken").length >
                  0 && (
                  <>
                    <div className="mb-1 mt-3 px-2 text-[9px] font-medium uppercase tracking-widest text-[rgba(255,100,100,0.5)]">
                      Needs attention
                    </div>
                    {automations
                      .filter((a) => a.status === "broken")
                      .map((auto) => (
                        <button
                          key={auto.id}
                          type="button"
                          onClick={() => handleSelectAutomation(auto.id)}
                          className={
                            selectedId === auto.id
                              ? "mb-1 w-full rounded-lg border border-[rgba(255,80,80,0.2)] bg-[rgba(255,80,80,0.08)] p-2 text-left transition-colors"
                              : "mb-1 w-full rounded-lg border border-[rgba(255,80,80,0.12)] bg-[rgba(255,80,80,0.04)] p-2 text-left transition-colors hover:bg-[rgba(255,80,80,0.06)]"
                          }
                        >
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(255,100,100,0.8)]" />
                            <span className="flex-1 truncate text-[11px] text-[rgba(255,255,255,0.75)]">
                              {getDisplayName(auto)}
                            </span>
                            <span className="shrink-0 rounded-full bg-[rgba(255,80,80,0.1)] px-1.5 py-0.5 text-[8px] text-[rgba(255,100,100,0.8)]">
                              Broken
                            </span>
                          </div>
                          <div className="truncate pl-3 text-[9px] text-[rgba(255,100,100,0.5)]">
                            Tap to fix
                          </div>
                        </button>
                      ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white">
          {selectedId === null ? (
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
                  <span className="text-sm font-semibold text-[#111]">
                    {getDisplayName(
                      selectedAutomation || ({ id: "" } as Automation)
                    )}
                  </span>
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
                      onClick={() => setActiveTab("history")}
                      className={
                        activeTab === "history"
                          ? "rounded-md bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#111]"
                          : "rounded-md px-3 py-1 text-xs text-[#9ca3af] transition-colors hover:text-[#111]"
                      }
                    >
                      History
                    </button>
                  </div>
                  {(() => {
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
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedId)}
                    className="rounded-md border border-[#fee2e2] px-2.5 py-1 text-xs text-[#ef4444] transition-colors hover:bg-[#fee2e2]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {activeTab === "chat" ? (
                <div className="flex-1 overflow-y-auto bg-white px-6 py-4">
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {messages.map((msg, idx) => (
                      <div key={idx}>
                        {msg.type === "user" && (
                          <div className="flex justify-end">
                            <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-[#0d1420] px-4 py-2.5 text-sm leading-relaxed text-white">
                              {msg.text}
                            </div>
                          </div>
                        )}
                        {msg.type === "assistant" && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-2xl border border-[#e5e7eb] border-l-4 border-l-[#00d4aa] bg-white px-4 py-3 text-sm text-[#374151] sm:max-w-md">
                              {msg.thinking && !msg.text ? (
                                <div className="flex gap-1 py-1">
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
                              ) : (
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(msg.text),
                                  }}
                                />
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
                                className="rounded-full bg-[#0d1420] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1a2540]"
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
              ) : (
                <div className="flex-1 overflow-y-auto bg-white px-6 py-4">
                  <div className="mx-auto max-w-2xl">
                    <div className="text-xs text-[#9ca3af]">
                      Run history coming soon — this will show every time your
                      automation ran and what happened.
                    </div>
                  </div>
                </div>
              )}

              <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#f3f4f6] bg-white px-4 py-2">
                {[
                  "Test it now",
                  "Add another action",
                  "Change schedule",
                  "View run history",
                ].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      setInput(action);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-xs text-[#6b7280] transition-colors hover:border-[#0d1420] hover:text-[#0d1420]"
                  >
                    {action}
                  </button>
                ))}
              </div>
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
                            ? "bg-[#0d1420] text-white"
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
                      ? "bg-[#0d1420] text-white"
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
                className="flex-1 rounded-xl bg-[#dc2626] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#b91c1c]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium shadow-xl transition-all ${
            toast.type === "success"
              ? "bg-[#0d1420] text-white"
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
    </div>
  );
}
