"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { basicDark } from "@uiw/codemirror-theme-basic";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { createClient } from "@/lib/supabase";
import {
  getSubmission,
  listReviewComments,
  addReviewComment,
  approveSubmission,
  rejectSubmission,
  type Submission,
  type ReviewComment,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Timer } from "@/components/Timer";

const langMap: Record<string, () => ReturnType<typeof javascript>> = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  json,
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  reviewed: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  approved: "bg-green-500/10 text-green-400 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentLine, setCommentLine] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, [router]);

  const fetchAll = useCallback(async () => {
    if (!token || !params.id) return;
    setLoading(true);
    try {
      const [sub, cmts] = await Promise.all([
        getSubmission(token, params.id),
        listReviewComments(token, params.id),
      ]);
      setSubmission(sub);
      setComments(cmts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      const line = commentLine ? parseInt(commentLine, 10) : undefined;
      const c = await addReviewComment(token, params.id, commentBody.trim(), line);
      setComments((prev) => [...prev, c]);
      setCommentBody("");
      setCommentLine("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const updated = await approveSubmission(token, params.id, feedback || undefined);
      setSubmission(updated);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const updated = await rejectSubmission(token, params.id, feedback || undefined);
      setSubmission(updated);
    } finally {
      setSubmitting(false);
    }
  };

  const isOwner = submission?.author_id === userId;
  const extensions = submission
    ? [EditorView.lineWrapping, EditorView.editable.of(false), (langMap[submission.language] || javascript)()]
    : [];

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-400 text-sm">Loading submission…</div>
        </div>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-zinc-400">
              {error || "Submission not found."}
            </p>
            <Link href="/dashboard" className="text-sm text-accent hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-4 h-12 flex items-center gap-3">
          <Link href="/dashboard" className="text-zinc-500 hover:text-white text-sm">
            ←
          </Link>
          <span className="text-sm font-medium text-white truncate flex-1">
            {submission.title}
          </span>
          <span
            className={`text-xs border rounded-full px-2 py-0.5 ${
              STATUS_STYLES[submission.status] ?? STATUS_STYLES.pending
            }`}
          >
            {submission.status}
          </span>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Left panel — metadata */}
          <aside className="w-52 shrink-0 border-r border-border bg-surface-muted/10 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Author</p>
              <p className="text-xs text-zinc-300 break-all">{submission.author_email}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Language</p>
              <p className="text-xs font-mono text-accent">{submission.language}</p>
            </div>
            {submission.room_name && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Room</p>
                <p className="text-xs text-zinc-300">{submission.room_name}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Submitted</p>
              <p className="text-xs text-zinc-400">
                {new Date(submission.created_at).toLocaleString()}
              </p>
            </div>
            {submission.score != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Score</p>
                <p className="text-lg font-bold text-accent">{submission.score}</p>
              </div>
            )}
            {submission.feedback && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Feedback</p>
                <p className="text-xs text-zinc-400">{submission.feedback}</p>
              </div>
            )}

            {/* Timer */}
            <Timer submissionId={submission.id} isOwner={isOwner} />

            {/* Review actions (non-owner) */}
            {!isOwner && submission.status === "pending" && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                  Review Decision
                </p>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional feedback…"
                  rows={3}
                  className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none resize-none"
                />
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="w-full rounded-lg bg-green-600 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={submitting}
                  className="w-full rounded-lg bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </aside>

          {/* Center panel — code */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <CodeMirror
              value={submission.code}
              height="100%"
              theme={basicDark}
              extensions={extensions}
              editable={false}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: false,
              }}
              className="h-full text-left"
            />
          </div>

          {/* Right panel — comments */}
          <aside className="w-64 shrink-0 border-l border-border bg-surface-muted/10 flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-border">
              <h3 className="text-xs font-medium text-zinc-300">
                Comments ({comments.length})
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-zinc-600">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg bg-surface-muted/30 border border-border p-2.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-zinc-500 truncate">
                        {c.author_email === userEmail ? "You" : c.author_email}
                      </span>
                      {c.line_number && (
                        <span className="text-[10px] text-accent font-mono shrink-0">
                          L{c.line_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 break-words">{c.body}</p>
                    <p className="text-[10px] text-zinc-600">
                      {new Date(c.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>
            <form
              onSubmit={handleAddComment}
              className="shrink-0 border-t border-border p-3 space-y-2"
            >
              <input
                type="number"
                min={1}
                placeholder="Line # (optional)"
                value={commentLine}
                onChange={(e) => setCommentLine(e.target.value)}
                className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
              />
              <textarea
                placeholder="Add a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={2}
                className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none resize-none"
              />
              <button
                type="submit"
                disabled={submitting || !commentBody.trim()}
                className="w-full rounded-lg bg-accent py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Post Comment
              </button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
