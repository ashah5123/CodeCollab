"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";

type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ChatPanelProps = {
  roomId: string;
  user: User;
};

export function ChatPanel({ roomId, user }: ChatPanelProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    setMessages((data as ChatMessage[]) || []);
  };

  useEffect(() => {
    fetchMessages();
  }, [roomId]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => fetchMessages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    await supabase.from("chat_messages").insert({
      room_id: roomId,
      user_id: user.id,
      content: text,
    });
    setInput("");
    setLoading(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 border-t border-border">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-zinc-300">Chat</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-zinc-500 text-xs">
              {m.user_id === user.id ? "You" : "User"} ·{" "}
              {new Date(m.created_at).toLocaleTimeString()}
            </span>
            <p className="text-zinc-300 break-words mt-0.5">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="p-2 border-t border-border">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full rounded border border-border bg-surface-muted/50 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="mt-2 w-full rounded bg-accent py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
