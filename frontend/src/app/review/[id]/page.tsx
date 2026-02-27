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
  getMyOrg,
  getOrgMembers,
  getSubmissionCommentVotes,
  voteComment,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  changeSubmissionStatus,
  type Submission,
  type ReviewComment,
  type OrgMember,
  type VoteTally,
  type Attachment,
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
  open:      "bg-sky-500/10 text-sky-400 border-sky-500/30",
  in_review: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  resolved:  "bg-teal-500/10 text-teal-400 border-teal-500/30",
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  reviewed:  "bg-blue-500/10 text-blue-400 border-blue-500/30",
  approved:  "bg-green-500/10 text-green-400 border-green-500/30",
  rejected:  "bg-red-500/10 text-red-400 border-red-500/30",
};

// ─── Render comment body with @mentions highlighted ────────────────────────

function renderBody(text: string) {
  // Split on @email@domain.tld patterns; anything else is plain text
  const parts = text.split(/(@[\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^@[\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,}$/.test(part) ? (
          <span key={i} className="text-blue-400 font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // Auth
  const [userId, setUserId]       = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Data
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [comments, setComments]     = useState<ReviewComment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Org members (for @mention)
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Add comment form
  const [commentBody, setCommentBody] = useState("");
  const [commentLine, setCommentLine] = useState("");
  const [submitting, setSubmitting]   = useState(false);

  // @mention dropdown state
  const [mentionOpen, setMentionOpen]     = useState(false);
  const [mentionQuery, setMentionQuery]   = useState("");
  const [mentionAnchor, setMentionAnchor] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Edit comment
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody]                 = useState("");

  // Confirm dialogs
  const [deleteCommentConfirmId, setDeleteCommentConfirmId] = useState<string | null>(null);
  const [deleteSubConfirmOpen, setDeleteSubConfirmOpen]     = useState(false);
  const [actionLoading, setActionLoading]                   = useState(false);

  // Review
  const [feedback, setFeedback] = useState("");

  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Votes & attachments
  const [votes, setVotes]             = useState<Record<string, VoteTally>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
    });
  }, [router]);

  // Load org members for @mention dropdown
  useEffect(() => {
    getMyOrg().then((org) => {
      if (org) getOrgMembers(org.id).then(setOrgMembers);
    });
  }, []);

  const fetchAll = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      // Use allSettled so that secondary calls (votes, attachments) failing
      // does NOT prevent the submission itself from loading.
      const [subResult, cmtsResult, vtsResult, attsResult] = await Promise.allSettled([
        getSubmission(params.id),
        listReviewComments(params.id),
        getSubmissionCommentVotes(params.id),
        listAttachments(params.id),
      ]);

      if (subResult.status === "rejected") {
        setError((subResult.reason as Error).message ?? "Failed to load submission");
        return;
      }
      setSubmission(subResult.value);
      if (cmtsResult.status === "fulfilled")  setComments(cmtsResult.value);
      if (vtsResult.status === "fulfilled")   setVotes(vtsResult.value);
      if (attsResult.status === "fulfilled")  setAttachments(attsResult.value);
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

  // ─── @mention helpers ─────────────────────────────────────────────────────

  const filteredMembers = orgMembers
    .filter((m) => {
      const email = m.user_email?.toLowerCase() ?? "";
      return email.includes(mentionQuery.toLowerCase());
    })
    .slice(0, 5);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentBody(val);

    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    // Match @ followed by non-@ non-space chars (partial email / username before @)
    const match = textBeforeCursor.match(/@([^@\s]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionAnchor(cursor - match[0].length); // index of the @
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const insertMention = (email: string) => {
    const before = commentBody.slice(0, mentionAnchor);
    const after  = commentBody.slice(mentionAnchor + 1 + mentionQuery.length);
    const next   = `${before}@${email} ${after}`;
    setCommentBody(next);
    setMentionOpen(false);
    setMentionQuery("");
    // Restore focus to textarea
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

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

  const handleVote = async (commentId: string, vote: 1 | -1 | 0) => {
    const tally = votes[commentId] ?? { upvotes: 0, downvotes: 0, net: 0, user_vote: 0 };
    const current = tally.user_vote as 1 | -1 | 0;
    const newVote = (current === vote ? 0 : vote) as 1 | -1 | 0;
    // Optimistic update
    setVotes((prev) => {
      const t = prev[commentId] ?? { upvotes: 0, downvotes: 0, net: 0, user_vote: 0 };
      const up = t.upvotes + (newVote === 1 ? 1 : 0) - (t.user_vote === 1 ? 1 : 0);
      const dn = t.downvotes + (newVote === -1 ? 1 : 0) - (t.user_vote === -1 ? 1 : 0);
      return { ...prev, [commentId]: { upvotes: up, downvotes: dn, net: up - dn, user_vote: newVote } };
    });
    try {
      await voteComment(commentId, newVote);
    } catch {
      setVotes((prev) => ({ ...prev, [commentId]: tally }));
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const att = await uploadAttachment(params.id, file);
      setAttachments((prev) => [...prev, att]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachment(params.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStatusChange = async (newStatus: "open" | "in_review" | "resolved") => {
    try {
      const updated = await changeSubmissionStatus(params.id, newStatus);
      setSubmission(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

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

  // ─── Loading / error screens ──────────────────────────────────────────────

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

  // ─── Main render ──────────────────────────────────────────────────────────

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

            {/* Status change (owner only) */}
            {isOwner && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Change Status</p>
                <select
                  value={submission.status}
                  onChange={(e) => handleStatusChange(e.target.value as "open" | "in_review" | "resolved")}
                  className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-zinc-300 focus:border-accent focus:outline-none"
                >
                  <option value="open">Open</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            )}

            {/* Attachments */}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">Attachments</p>
              {attachments.length === 0 ? (
                <p className="text-xs text-zinc-600">No attachments.</p>
              ) : (
                <div className="space-y-1">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-1.5 group">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-xs text-accent hover:underline truncate"
                      >
                        {att.filename}
                      </a>
                      {isOwner && (
                        <button
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="text-[10px] text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isOwner && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUploadFile}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="mt-2 w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-50"
                  >
                    {uploadingFile ? "Uploading…" : "+ Attach file"}
                  </button>
                </>
              )}
            </div>

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
                        {/* Render body with @mentions highlighted in blue */}
                        <p className="text-xs text-zinc-300 break-words">
                          {renderBody(c.body)}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-zinc-600">
                            {new Date(c.created_at).toLocaleTimeString()}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleVote(c.id, 1)}
                              className={`flex items-center gap-0.5 text-[10px] transition-colors ${
                                votes[c.id]?.user_vote === 1
                                  ? "text-green-400"
                                  : "text-zinc-600 hover:text-green-400"
                              }`}
                            >
                              ▲ {votes[c.id]?.upvotes ?? 0}
                            </button>
                            <button
                              onClick={() => handleVote(c.id, -1)}
                              className={`flex items-center gap-0.5 text-[10px] transition-colors ${
                                votes[c.id]?.user_vote === -1
                                  ? "text-red-400"
                                  : "text-zinc-600 hover:text-red-400"
                              }`}
                            >
                              ▼ {votes[c.id]?.downvotes ?? 0}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Comment form with @mention dropdown */}
            <form onSubmit={handleAddComment} className="shrink-0 border-t border-border p-3 space-y-2">
              <input
                type="number"
                min={1}
                placeholder="Line # (optional)"
                value={commentLine}
                onChange={(e) => setCommentLine(e.target.value)}
                className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
              />

              {/* Textarea wrapped in relative div for dropdown positioning */}
              <div className="relative">
                {mentionOpen && filteredMembers.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border rounded-lg shadow-xl z-10 overflow-hidden">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-surface-muted flex items-center gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep textarea focus
                          insertMention(m.user_email ?? "");
                        }}
                      >
                        <span className="text-blue-400">@</span>
                        <span className="truncate">{m.user_email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  placeholder="Add a comment… (type @ to mention)"
                  value={commentBody}
                  onChange={handleCommentChange}
                  onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                  rows={2}
                  className="w-full rounded border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none resize-none"
                />
              </div>

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
