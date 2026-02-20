"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { CodeEditor } from "@/components/CodeEditor";
import { CommentList } from "./CommentList";
import { ChatPanel } from "./ChatPanel";

const DEBOUNCE_MS = 400;

type RoomClientProps = {
  roomId: string;
  roomName: string;
  inviteSlug: string;
  documentId: string;
  initialContent: string;
  initialLanguage: string;
  user: User;
};

export function RoomClient({
  roomId,
  roomName,
  inviteSlug,
  documentId,
  initialContent,
  initialLanguage,
  user,
}: RoomClientProps) {
  const supabase = createClient();
  const [content, setContent] = useState(initialContent);
  const [language, setLanguage] = useState(initialLanguage);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextRef = useRef(false);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${inviteSlug}`
      : "";

  const persistContent = useCallback(
    (newContent: string, newLanguage?: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        debounceRef.current = null;
        ignoreNextRef.current = true;
        await supabase
          .from("documents")
          .update({
            content: newContent,
            ...(newLanguage !== undefined && { language: newLanguage }),
            updated_by: user.id,
          })
          .eq("id", documentId);
      }, DEBOUNCE_MS);
    },
    [documentId, user.id, supabase]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      persistContent(newContent);
    },
    [persistContent]
  );

  const handleLanguageChange = useCallback(
    (newLanguage: string) => {
      setLanguage(newLanguage);
      persistContent(content, newLanguage);
    },
    [content, persistContent]
  );

  useEffect(() => {
    const channel = supabase
      .channel(`doc:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "documents",
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          if (ignoreNextRef.current) {
            ignoreNextRef.current = false;
            return;
          }
          const newRow = payload.new as { content?: string; language?: string };
          if (newRow.content !== undefined) setContent(newRow.content);
          if (newRow.language !== undefined) setLanguage(newRow.language);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, supabase]);

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-surface-muted/30 px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-zinc-400 hover:text-white text-sm"
          >
            ← Dashboard
          </Link>
          <h1 className="font-semibold text-white truncate max-w-[200px]">
            {roomName}
          </h1>
          <button
            type="button"
            onClick={copyInviteLink}
            className="rounded-lg border border-border bg-surface-muted/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface-muted"
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
        <span className="text-xs text-zinc-500">{user.email}</span>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <CodeEditor
            value={content}
            language={language}
            onChange={handleContentChange}
            onLanguageChange={handleLanguageChange}
            className="min-h-0"
          />
        </div>
        <aside className="w-80 shrink-0 flex flex-col bg-surface-muted/20">
          <CommentList documentId={documentId} currentUserId={user.id} />
          <ChatPanel roomId={roomId} user={user} />
        </aside>
      </div>
    </div>
  );
}
