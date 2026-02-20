"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Comment = {
  id: string;
  document_id: string;
  line_number: number;
  author_id: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
};

type CommentListProps = {
  documentId: string;
  currentUserId: string;
};

export function CommentList({ documentId, currentUserId }: CommentListProps) {
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [lineInput, setLineInput] = useState("");
  const [bodyInput, setBodyInput] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("document_comments")
      .select("*")
      .eq("document_id", documentId)
      .order("line_number")
      .order("created_at");
    setComments((data as Comment[]) || []);
  };

  useEffect(() => {
    fetchComments();
  }, [documentId]);

  useEffect(() => {
    const channel = supabase
      .channel(`comments:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_comments",
          filter: `document_id=eq.${documentId}`,
        },
        () => fetchComments()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, supabase]);

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const line = parseInt(lineInput, 10);
    if (!lineInput.trim() || !bodyInput.trim() || Number.isNaN(line) || line < 1) return;
    setLoading(true);
    await supabase.from("document_comments").insert({
      document_id: documentId,
      line_number: line,
      author_id: currentUserId,
      body: bodyInput.trim(),
    });
    setLineInput("");
    setBodyInput("");
    setLoading(false);
  };

  return (
    <div className="border-b border-border flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-zinc-300">Comments</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {comments.map((c) => (
          <div
            key={c.id}
            className="rounded-lg bg-surface-muted/50 p-2 text-sm"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-accent font-mono text-xs">
                Line {c.line_number}
              </span>
              {c.resolved_at && (
                <span className="text-xs text-zinc-500">Resolved</span>
              )}
            </div>
            <p className="text-zinc-300 mt-1 break-words">{c.body}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(c.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <form onSubmit={addComment} className="p-2 space-y-2 border-t border-border">
        <input
          type="number"
          min={1}
          placeholder="Line"
          value={lineInput}
          onChange={(e) => setLineInput(e.target.value)}
          className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none"
        />
        <textarea
          placeholder="Add a comment..."
          value={bodyInput}
          onChange={(e) => setBodyInput(e.target.value)}
          rows={2}
          className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none resize-none"
        />
        <button
          type="submit"
          disabled={loading || !lineInput.trim() || !bodyInput.trim()}
          className="w-full rounded bg-accent py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Add comment
        </button>
      </form>
    </div>
  );
}
