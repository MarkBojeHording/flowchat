"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3456";

const WELCOME_MESSAGE =
  "Hey! I'm your automation assistant. What would you like to automate today?";

type ChatMessage =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "connect"; app: string; url: string; message: string }
  | { type: "test_result"; summary: string }
  | { type: "live"; summary: string }
  | { type: "error"; text: string };

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

function formatAppName(app: string) {
  return app.charAt(0).toUpperCase() + app.slice(1).replace(/_/g, " ");
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationTurn[]
  >([]);
  const [currentAutomationId] = useState<string | null>(null);
  const [, setCurrentWorkflowId] = useState<string | null>(null);
  const [welcomeShown, setWelcomeShown] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setUser(data.user);
    });
  }, []);

  useEffect(() => {
    if (user && !welcomeShown) {
      setMessages([{ type: "assistant", text: WELCOME_MESSAGE }]);
      setWelcomeShown(true);
    }
  }, [user, welcomeShown]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (!input.trim() || loading || !user) return;

    const userMessage = input.trim();
    const historyForApi = [...conversationHistory];

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { type: "user", text: userMessage }]);
    setConversationHistory((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          automationId: currentAutomationId,
          message: userMessage,
          conversationHistory: historyForApi,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: data.error || "Something went wrong" },
        ]);
        return;
      }

      const newMessages: ChatMessage[] = [];

      if (data.reply?.trim()) {
        newMessages.push({ type: "assistant", text: data.reply.trim() });
      }

      if (data.action === "request_connection" && data.actionData) {
        newMessages.push({
          type: "connect",
          app: data.actionData.app,
          url: data.actionData.url,
          message: data.actionData.message,
        });
      }

      if (data.action === "show_test_result" && data.actionData) {
        newMessages.push({
          type: "test_result",
          summary: data.actionData.summary || "Test completed successfully.",
        });
      }

      if (data.action === "automation_live" && data.actionData) {
        if (data.actionData.workflowId) {
          setCurrentWorkflowId(data.actionData.workflowId);
        }
        newMessages.push({
          type: "live",
          summary: data.actionData.summary || "Your automation is now live.",
        });
      }

      if (data.updatedState?.currentWorkflowId) {
        setCurrentWorkflowId(data.updatedState.currentWorkflowId);
      }

      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
      }

      if (data.reply?.trim()) {
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: data.reply.trim() },
        ]);
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { type: "error", text }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#0f0f1a]">
      {/* Top nav */}
      <nav className="flex shrink-0 items-center justify-between border-b border-[#2a2a4a] px-4 py-3">
        <Link href="/" className="text-lg font-bold text-[#e8e8f0]">
          ⚡ flowchat
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-[#8888aa] transition-colors hover:text-[#e8e8f0]"
        >
          Sign out
        </button>
      </nav>

      {/* Message thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx}>
              {msg.type === "user" && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-[#2a2a4a] px-4 py-3 text-sm text-white sm:max-w-md">
                    {msg.text}
                  </div>
                </div>
              )}

              {msg.type === "assistant" && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-[#2a2a4a] border-l-4 border-l-[#00d4aa] bg-[#1a1a2e] px-4 py-3 text-sm text-[#e8e8f0] sm:max-w-md">
                    {msg.text}
                  </div>
                </div>
              )}

              {msg.type === "connect" && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-[#2a2a4a] border-l-4 border-l-[#00d4aa] bg-[#1a1a2e] px-4 py-4 sm:max-w-md">
                    <p className="text-sm text-[#e8e8f0]">{msg.message}</p>
                    <button
                      type="button"
                      onClick={() => window.open(msg.url, "_blank")}
                      className="mt-3 rounded-lg bg-[#00d4aa] px-4 py-2 text-sm font-semibold text-[#0f0f1a] transition-colors hover:bg-[#00b894]"
                    >
                      Connect {formatAppName(msg.app)} →
                    </button>
                  </div>
                </div>
              )}

              {msg.type === "test_result" && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-[#2a2a4a] border-l-4 border-l-green-500 bg-[#1a1a2e] px-4 py-4 sm:max-w-md">
                    <p className="mb-1 text-sm font-medium text-green-400">
                      ✅ Test complete
                    </p>
                    <p className="text-sm text-[#e8e8f0]">{msg.summary}</p>
                  </div>
                </div>
              )}

              {msg.type === "live" && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-4 py-4 sm:max-w-md">
                    <p className="mb-1 text-sm font-medium text-[#00d4aa]">
                      🎉 Automation is live!
                    </p>
                    <p className="text-sm text-[#e8e8f0]">{msg.summary}</p>
                  </div>
                </div>
              )}

              {msg.type === "error" && (
                <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                  {msg.text}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e] px-4 py-3">
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
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Chat input */}
      <div className="shrink-0 border-t border-[#2a2a4a] bg-[#0f0f1a] px-4 py-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Describe what you want to automate..."
            rows={2}
            disabled={loading || !user}
            className="flex-1 resize-none rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-4 py-3 text-sm text-[#e8e8f0] placeholder-[#4a4a6a] focus:border-[#00d4aa] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !input.trim() || !user}
            className="rounded-xl bg-[#00d4aa] px-6 font-bold text-[#0f0f1a] transition-colors hover:bg-[#00b894] disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
