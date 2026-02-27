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
import { supabase } from "@/lib/supabase";
import {
  getSubmission,
  listReviewComments,
  addReviewComment,
  editComment,
  deleteComment,
  deleteSubmission,
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
  open:     "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  pending:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  reviewed: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  approved: "bg-green-500/10 text-green-400 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // Auth
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Data
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add comment form
  const [commentBody, setCommentBody] = useState("");
  const [commentLine, setCommentLine] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit comment
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  // Confirm dialogs
  const [deleteCommentConfirmId, setDeleteCommentConfirmId] = useState<string | null>(null);
  const [deleteSubConfirmOpen, setDeleteSubConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Review
  const [feedback, setFeedback] = useState("");

  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
    });
  }, [router]);

  const fetchAll = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      const [sub, cmts] = await Promise.all([
        getSubmission(params.id),
        listReviewComments(params.id),
      ]);
      setSubmission(sub);
      setComments(cmts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    console.log("handleAddComment session:", session);
    console.log("handleAddComment access_token:", session?.access_token);
    if (!session || !session.access_token) {
      setError("You must be logged in to post a comment.");
      return;
    }
    setSubmitting(true);
    try {
      const line = commentLine ? parseInt(commentLine, 10) : undefined;
      const c = await addReviewComment(params.id, commentBody.trim(), line);
      setComments((prev) => [...prev, c]);
      setCommentBody("");
      setCommentLine("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editBody.trim()) return;
    setActionLoading(true);
    try {
      const updated = await editComment(params.id, commentId, editBody.trim());
      setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
      setEditingCommentId(null);
      setEditBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setActionLoading(true);
    try {
      await deleteComment(params.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setDeleteCommentConfirmId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubmission = async () => {
    setActionLoading(true);
    try {
      await deleteSubmission(params.id);
      router.push("/review");
    } catch (e) {
      setError((e as Error).message);
      setDeleteSubConfirmOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const updated = await approveSubmission(params.id, feedback || undefined);
      setSubmission(updated);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      const updated = await rejectSubmission(params.id, feedback || undefined);
      setSubmission(updated);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  // Backend returns user_id; type says author_id — check both
  const isOwner =
    (submission as any)?.user_id === userId ||
    submission?.author_id === userId;

  const isMyComment = (c: ReviewComment) =>
    (c as any).user_email === userEmail || c.author_email === userEmail;

  const isOpenForReview = ["open", "pending"].includes((submission?.status as string) ?? "");

  const extensions = submission
    ? [EditorView.lineWrapping, EditorView.editable.of(false), (langMap[submission.language] || javascript)()]
    : [];

  // ─── Loading / error screens ─────────────────────────────────────────────────

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
            <p className="text-zinc-400">{error || "Submission not found."}</p>
            <Link href="/dashboard" className="text-sm text-accent hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-4 h-12 flex items-center gap-3">
          <Link href="/dashboard" className="text-zinc-500 hover:text-white text-sm">←</Link>
          <span className="text-sm font-medium text-white truncate flex-1">{submission.title}</span>
          <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_STYLES[submission.status] ?? STATUS_STYLES.open}`}>
            {submission.status}
          </span>
        </header>

        <div className="flex-1 flex overflow-hidden">

          {/* Left panel — metadata */}
          <aside className="w-52 shrink-0 border-r border-border bg-surface-muted/10 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Author</p>
              <p className="text-xs text-zinc-300 break-all">
                {(submission as any).user_email || submission.author_email}
              </p>
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
              <p className="text-xs text-zinc-400">{new Date(submission.created_at).toLocaleString()}</p>
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

            <Timer submissionId={submission.id} isOwner={isOwner} />

            {/* Delete submission (owner only) */}
            {isOwner && (
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => setDeleteSubConfirmOpen(true)}
                  className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Delete Submission
                </button>
              </div>
            )}

            {/* Review actions (non-owner, open submission) */}
            {!isOwner && isOpenForReview && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Review Decision</p>
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
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
              className="h-full text-left"
            />
          </div>

          {/* Right panel — comments */}
          <aside className="w-64 shrink-0 border-l border-border bg-surface-muted/10 flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-border">
              <h3 className="text-xs font-medium text-zinc-300">Comments ({comments.length})</h3>
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
                    {editingCommentId === c.id ? (
                      /* ── Edit mode ── */
                      <div className="space-y-1.5">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={2}
                          className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white focus:border-accent focus:outline-none resize-none"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditComment(c.id)}
                            disabled={actionLoading || !editBody.trim()}
                            className="flex-1 rounded bg-accent py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingCommentId(null); setEditBody(""); }}
                            className="flex-1 rounded border border-border py-1 text-[10px] text-zinc-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] text-zinc-500 truncate">
                            {isMyComment(c) ? "You" : (c.author_email || (c as any).user_email)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(c.line_number && c.line_number > 0) ? (
                              <span className="text-[10px] text-accent font-mono">L{c.line_number}</span>
                            ) : null}
                            {isMyComment(c) && (
                              <>
                                <button
                                  onClick={() => { setEditingCommentId(c.id); setEditBody(c.body); }}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setDeleteCommentConfirmId(c.id)}
                                  className="text-[10px] text-red-500 hover:text-red-400 transition-colors"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 break-words">{c.body}</p>
                        <p className="text-[10px] text-zinc-600">
                          {new Date(c.created_at).toLocaleTimeString()}
                        </p>
                      </>
                    )}
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            <form onSubmit={handleAddComment} className="shrink-0 border-t border-border p-3 space-y-2">
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

      {/* ── Confirm: delete comment ── */}
      {deleteCommentConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { if (!actionLoading) setDeleteCommentConfirmId(null); }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-white mb-1">Delete comment?</p>
            <p className="text-xs text-zinc-500 mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { if (!actionLoading) setDeleteCommentConfirmId(null); }}
                disabled={actionLoading}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-zinc-300 hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteComment(deleteCommentConfirmId)}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-red-500/20 border border-red-500/30 py-2 text-sm text-red-400 hover:bg-red-500/30 disabled:opacity-50"
              >
                {actionLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm: delete submission ── */}
      {deleteSubConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { if (!actionLoading) setDeleteSubConfirmOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-white mb-1">Delete submission?</p>
            <p className="text-xs text-zinc-500 mb-4">All comments will be lost. This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { if (!actionLoading) setDeleteSubConfirmOpen(false); }}
                disabled={actionLoading}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-zinc-300 hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmission}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-red-500/20 border border-red-500/30 py-2 text-sm text-red-400 hover:bg-red-500/30 disabled:opacity-50"
              >
                {actionLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
