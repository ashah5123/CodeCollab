"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import { updateGlobalChatMessage, deleteGlobalChatMessage } from "@/lib/api";

type GlobalMessage = {
  id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
  is_edited?: boolean;
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("global_chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as GlobalMessage[]) || []);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUser({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, [router]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime: INSERT, UPDATE, DELETE
  useEffect(() => {
    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const newMsg = payload.new as GlobalMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const updated = payload.new as GlobalMessage;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...updated, is_edited: true }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus edit textarea when edit mode opens
  useEffect(() => {
    if (editingId) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingId]);

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

  const startEdit = (msg: GlobalMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || !editingId || savingEdit) return;
    const id = editingId;

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => m.id === id ? { ...m, content: trimmed, is_edited: true } : m)
    );
    setEditingId(null);
    setEditText("");

    setSavingEdit(true);
    try {
      await updateGlobalChatMessage(id, trimmed);
    } catch {
      // Revert on error
      setMessages((prev) =>
        prev.map((m) => m.id === id ? { ...m, is_edited: false } : m)
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    const id = deleteConfirmId;
    if (!id) return;

    // Optimistic remove
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setDeleteConfirmId(null);
    setDeletingId(id);

    try {
      await deleteGlobalChatMessage(id);
    } catch {
      // Re-fetch on error
      fetchMessages();
    } finally {
      setDeletingId(null);
    }
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
          <div className="space-y-1 max-w-2xl mx-auto">
            {messages.map((msg) => {
              const isOwn = msg.user_id === user?.id;
              const displayName = msg.user_email
                ? msg.user_email.split("@")[0]
                : "Unknown";
              const isEditing = editingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 py-1 ${isOwn ? "flex-row-reverse" : ""}`}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Avatar email={msg.user_email} />

                  <div className={`flex flex-col min-w-0 max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                    <span className="text-xs font-medium text-zinc-400 mb-1 px-1">
                      {isOwn ? "You" : displayName}
                    </span>

                    {isEditing ? (
                      <div className="flex flex-col gap-2 w-full min-w-[220px]">
                        <textarea
                          ref={editInputRef}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={Math.max(1, editText.split("\n").length)}
                          className="w-full rounded-2xl px-4 py-2.5 bg-accent/80 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <div className="flex gap-2 justify-end px-1">
                          <button
                            onClick={cancelEdit}
                            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEdit}
                            disabled={!editText.trim()}
                            className="text-xs bg-accent text-white rounded-lg px-3 py-1 hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          isOwn
                            ? "bg-accent text-white rounded-br-sm"
                            : "bg-surface-muted/80 text-zinc-200 rounded-bl-sm"
                        }`}
                      >
                        <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-1 px-1">
                      <span className="text-[10px] text-zinc-500">{formatTime(msg.created_at)}</span>
                      {msg.is_edited && (
                        <span className="text-[10px] text-zinc-600 italic">edited</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — only for own messages, visible on hover */}
                  <div
                    className={`flex items-center gap-0.5 self-center shrink-0 transition-opacity duration-100 ${
                      isOwn && hoveredId === msg.id && !isEditing
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <button
                      onClick={() => startEdit(msg)}
                      title="Edit message"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(msg.id)}
                      title="Delete message"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
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

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-border bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white mb-1">Delete message?</p>
            <p className="text-xs text-zinc-500 mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-zinc-300 hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex-1 rounded-lg bg-red-500/20 border border-red-500/30 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
