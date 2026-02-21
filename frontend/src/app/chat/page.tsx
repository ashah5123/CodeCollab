"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

type GlobalMessage = {
  id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ email }: { email: string }) {
  const part = email.split("@")[0] ?? "?";
  const initials = part.slice(0, 2).toUpperCase();
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {initials}
    </span>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("global_chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as GlobalMessage[]) || []);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUser({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, [router, supabase.auth]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as GlobalMessage]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !user) return;
    setSending(true);
    await supabase.from("global_chat_messages").insert({
      user_id: user.id,
      user_email: user.email,
      content: text,
    });
    setInput("");
    setSending(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-white">Global Chat</h1>
            <p className="text-xs text-zinc-500">Chat with everyone on CodeCollab</p>
          </div>
          <UserMenu />
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-zinc-600">No messages yet. Say hello!</p>
            </div>
          )}
          <div className="space-y-4 max-w-2xl mx-auto">
            {messages.map((msg) => {
              const isOwn = msg.user_id === user?.id;
              const displayName = msg.user_email
                ? msg.user_email.split("@")[0]
                : "Unknown";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                >
                  <Avatar email={msg.user_email} />
                  <div
                    className={`flex flex-col min-w-0 max-w-[85%] ${
                      isOwn ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-xs font-medium text-zinc-400 mb-1 px-1">
                      {isOwn ? "You" : displayName}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${
                        isOwn
                          ? "bg-accent text-white rounded-br-sm"
                          : "bg-surface-muted/80 text-zinc-200 rounded-bl-sm"
                      }`}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1 px-1">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-surface-muted/10 px-6 py-3">
          <form onSubmit={send} className="flex gap-3">
            <input
              type="text"
              placeholder="Message everyone…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!user}
              className="flex-1 rounded-lg border border-border bg-surface-muted/50 px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || !user}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
