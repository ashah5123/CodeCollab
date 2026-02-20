"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

type DMMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_email: string;
  recipient_email: string;
  content: string;
  created_at: string;
  read: boolean;
};

type Conversation = {
  peerId: string;
  peerEmail: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

function Avatar({ email, size = "sm" }: { email: string; size?: "sm" | "md" }) {
  const letter = email[0]?.toUpperCase() ?? "?";
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  const sz = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sz}`}
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {letter}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePeer, setActivePeer] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setMe({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, [router, supabase.auth]);

  const buildConversations = useCallback(
    (msgs: DMMessage[], myId: string): Conversation[] => {
      const map = new Map<string, Conversation>();
      for (const m of msgs) {
        const peerId = m.sender_id === myId ? m.recipient_id : m.sender_id;
        const peerEmail = m.sender_id === myId ? m.recipient_email : m.sender_email;
        const existing = map.get(peerId);
        if (!existing || new Date(m.created_at) > new Date(existing.lastAt)) {
          map.set(peerId, {
            peerId,
            peerEmail,
            lastMessage: m.content,
            lastAt: m.created_at,
            unread: !existing ? (m.sender_id !== myId && !m.read ? 1 : 0) : existing.unread,
          });
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      );
    },
    []
  );

  const fetchConversations = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order("created_at", { ascending: true });
    const msgs = (data as DMMessage[]) || [];
    setConversations(buildConversations(msgs, me.id));
  }, [me, supabase, buildConversations]);

  const fetchThread = useCallback(async () => {
    if (!me || !activePeer) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${me.id},recipient_id.eq.${activePeer.peerId}),and(sender_id.eq.${activePeer.peerId},recipient_id.eq.${me.id})`
      )
      .order("created_at", { ascending: true });
    setMessages((data as DMMessage[]) || []);
  }, [me, activePeer, supabase]);

  useEffect(() => { if (me) fetchConversations(); }, [me, fetchConversations]);
  useEffect(() => { if (activePeer) fetchThread(); }, [activePeer, fetchThread]);

  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("dm-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as DMMessage;
          if (msg.sender_id === me.id || msg.recipient_id === me.id) {
            fetchConversations();
            if (
              activePeer &&
              (msg.sender_id === activePeer.peerId || msg.recipient_id === activePeer.peerId)
            ) {
              setMessages((prev) => [...prev, msg]);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me, activePeer, supabase, fetchConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !me || !activePeer) return;
    setSending(true);
    await supabase.from("direct_messages").insert({
      sender_id: me.id,
      recipient_id: activePeer.peerId,
      sender_email: me.email,
      recipient_email: activePeer.peerEmail,
      content: text,
      read: false,
    });
    setInput("");
    setSending(false);
  };

  const startNew = () => {
    const email = newRecipient.trim();
    if (!email || email === me?.email) return;
    const fake: Conversation = {
      peerId: email,
      peerEmail: email,
      lastMessage: "",
      lastAt: new Date().toISOString(),
      unread: 0,
    };
    setActivePeer(fake);
    setShowNew(false);
    setNewRecipient("");
    setMessages([]);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      {/* Conversations list */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden bg-surface-muted/10">
        <div className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-border">
          <h1 className="text-sm font-semibold text-white">Messages</h1>
          <div className="flex items-center gap-1">
            <UserMenu />
            <button
              onClick={() => setShowNew(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              title="New message"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showNew && (
          <div className="shrink-0 px-3 py-2 border-b border-border">
            <input
              type="email"
              placeholder="Recipient email…"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startNew()}
              className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
              autoFocus
            />
            <div className="flex gap-1 mt-1.5">
              <button
                onClick={startNew}
                className="flex-1 rounded bg-accent py-1 text-xs font-medium text-white"
              >
                Start
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 rounded border border-border py-1 text-xs text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-xs text-zinc-600">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.peerId}
                onClick={() => setActivePeer(conv)}
                className={`w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-b border-border/50 ${
                  activePeer?.peerId === conv.peerId
                    ? "bg-surface-muted/60"
                    : "hover:bg-surface-muted/30"
                }`}
              >
                <Avatar email={conv.peerEmail} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">
                      {conv.peerEmail}
                    </span>
                    <span className="text-[10px] text-zinc-600 shrink-0 ml-1">
                      {formatTime(conv.lastAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
                {conv.unread > 0 && (
                  <span className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                    {conv.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activePeer ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-zinc-400 text-sm">Select a conversation</p>
              <button
                onClick={() => setShowNew(true)}
                className="text-xs text-accent hover:underline"
              >
                or start a new one →
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-border bg-surface-muted/20 px-4 h-14 flex items-center gap-3">
              <Avatar email={activePeer.peerEmail} size="md" />
              <div>
                <p className="text-sm font-medium text-white">{activePeer.peerEmail}</p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
              {messages.map((msg, i) => {
                const isMine = msg.sender_id === me?.id;
                const showHead =
                  i === 0 || messages[i - 1].sender_id !== msg.sender_id;
                return (
                  <div key={msg.id} className={showHead ? "mt-3 first:mt-0" : ""}>
                    {showHead && (
                      <div className={`flex items-center gap-1.5 mb-1 ${isMine ? "flex-row-reverse" : ""}`}>
                        <Avatar email={isMine ? me!.email : activePeer.peerEmail} />
                        <span className="text-[10px] text-zinc-600">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${showHead ? "" : isMine ? "pr-9" : "pl-9"}`}>
                      <span
                        className={`inline-block rounded-2xl px-3 py-1.5 text-sm max-w-[75%] break-words ${
                          isMine
                            ? "bg-accent text-white rounded-tr-sm"
                            : "bg-surface-muted/60 text-zinc-200 rounded-tl-sm"
                        }`}
                      >
                        {msg.content}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-border bg-surface-muted/10 px-4 py-3">
              <form onSubmit={send} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Message ${activePeer.peerEmail}…`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
