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
  requestAiReview,
  summarizeDiscussion,
  type Submission,
  type ReviewComment,
  type OrgMember,
  type VoteTally,
  type Attachment,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Timer } from "@/components/Timer";
import { motion, AnimatePresence, type Variants } from "framer-motion";

// ─── Lang map ─────────────────────────────────────────────────────────────────

const langMap: Record<string, () => ReturnType<typeof javascript>> = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  json,
};

// ─── Status styles ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open:      "bg-sky-500/10 text-sky-400 border-sky-500/30",
  in_review: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  resolved:  "bg-teal-500/10 text-teal-400 border-teal-500/30",
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  reviewed:  "bg-blue-500/10 text-blue-400 border-blue-500/30",
  approved:  "bg-green-500/10 text-green-400 border-green-500/30",
  rejected:  "bg-red-500/10 text-red-400 border-red-500/30",
};

const LANG_META: Record<string, { color: string; bg: string }> = {
  python:     { color: "text-green-400",  bg: "bg-green-500/10" },
  javascript: { color: "text-yellow-400", bg: "bg-yellow-500/10" },
  typescript: { color: "text-blue-400",   bg: "bg-blue-500/10" },
  json:       { color: "text-amber-400",  bg: "bg-amber-500/10" },
  sql:        { color: "text-orange-400", bg: "bg-orange-500/10" },
  go:         { color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  rust:       { color: "text-red-400",    bg: "bg-red-500/10" },
};

// ─── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-cyan-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-amber-500", "bg-blue-500",
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(email: string): string {
  return email[0]?.toUpperCase() ?? "?";
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Render @mentions ─────────────────────────────────────────────────────────

function renderBody(text: string) {
  const parts = text.split(/(@[\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^@[\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,}$/.test(part) ? (
          <span key={i} className="text-[hsl(var(--accent))] font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Framer variants ──────────────────────────────────────────────────────────

const commentVariants: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const modalVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1,    y: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
  exit:    { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } },
};

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({ email, size = "sm" }: { email: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <div className={`${dim} ${avatarColor(email)} shrink-0 rounded-full flex items-center justify-center font-semibold text-white`}>
      {initials(email)}
    </div>
  );
}

// ─── Comment card ─────────────────────────────────────────────────────────────

function CommentCard({
  c,
  isMine,
  tally,
  editingId,
  editBody,
  actionLoading,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
  onVote,
  onEditChange,
}: {
  c: ReviewComment;
  isMine: boolean;
  tally: VoteTally | undefined;
  editingId: string | null;
  editBody: string;
  actionLoading: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onVote: (v: 1 | -1) => void;
  onEditChange: (val: string) => void;
}) {
  const authorEmail = c.author_email || (c as any).user_email || "unknown";
  const isEditing = editingId === c.id;

  return (
    <motion.div
      layout
      variants={commentVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{ y: -1 }}
      transition={{ layout: { duration: 0.2 } }}
      className="group rounded-xl border border-border bg-surface-muted/20 p-3 space-y-2 hover:border-white/10 transition-colors"
    >
      {isEditing ? (
        /* ── Edit mode ── */
        <div className="space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => onEditChange(e.target.value)}
            rows={3}
            autoFocus
            className="w-full rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-[hsl(var(--accent))] focus:outline-none resize-none leading-relaxed"
          />
          <div className="flex gap-1.5">
            <button
              onClick={onSave}
              disabled={actionLoading || !editBody.trim()}
              className="flex-1 rounded-lg bg-[hsl(var(--accent))] py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="flex-1 rounded-lg border border-border py-1.5 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <>
          {/* Header row: avatar + name + time + line ref + actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar email={authorEmail} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-zinc-200 truncate leading-tight">
                  {isMine ? "You" : authorEmail.split("@")[0]}
                </p>
                <p className="text-[10px] text-zinc-600 leading-tight" title={new Date(c.created_at).toLocaleString()}>
                  {relativeTime(c.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {c.line_number && c.line_number > 0 && (
                <span className="text-[10px] font-mono text-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.1)] rounded px-1.5 py-0.5">
                  L{c.line_number}
                </span>
              )}
              {isMine && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={onEdit}
                    className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-surface-muted transition-colors"
                    title="Edit"
                  >
                    <PencilIcon className="h-3 w-3" />
                  </button>
                  <button
                    onClick={onDelete}
                    className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <p className="text-xs text-zinc-300 leading-relaxed break-words whitespace-pre-wrap pl-8">
            {renderBody(c.body)}
          </p>

          {/* Vote row */}
          <div className="flex items-center gap-3 pl-8">
            <motion.button
              onClick={() => onVote(1)}
              whileTap={{ scale: 0.85 }}
              className={`flex items-center gap-1 text-[11px] font-medium transition-colors rounded-md px-1.5 py-0.5 ${
                tally?.user_vote === 1
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              <ThumbUpIcon className="h-3 w-3" />
              <span>{tally?.upvotes ?? 0}</span>
            </motion.button>
            <motion.button
              onClick={() => onVote(-1)}
              whileTap={{ scale: 0.85 }}
              className={`flex items-center gap-1 text-[11px] font-medium transition-colors rounded-md px-1.5 py-0.5 ${
                tally?.user_vote === -1
                  ? "text-red-400 bg-red-500/10"
                  : "text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
              }`}
            >
              <ThumbDownIcon className="h-3 w-3" />
              <span>{tally?.downvotes ?? 0}</span>
            </motion.button>
            {(tally?.net ?? 0) !== 0 && (
              <span className={`text-[10px] font-medium ml-auto ${(tally?.net ?? 0) > 0 ? "text-emerald-500" : "text-red-500"}`}>
                {(tally?.net ?? 0) > 0 ? "+" : ""}{tally?.net}
              </span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ReviewPageSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* header */}
        <div className="shrink-0 border-b border-border bg-surface-muted/20 px-4 h-12 flex items-center gap-3">
          <div className="h-4 w-4 rounded skeleton" />
          <div className="h-4 flex-1 max-w-xs rounded skeleton" />
          <div className="h-5 w-16 rounded-full skeleton" />
        </div>
        <div className="flex-1 flex overflow-hidden">
          {/* left aside */}
          <aside className="w-52 shrink-0 border-r border-border p-4 space-y-4">
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-16 rounded skeleton" />
                <div className={`h-3.5 rounded skeleton`} style={{ width: `${w}%` }} />
              </div>
            ))}
          </aside>
          {/* code panel */}
          <div className="flex-1 min-w-0 bg-surface-muted/10 skeleton" />
          {/* right aside */}
          <aside className="w-64 shrink-0 border-l border-border p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full skeleton" />
                  <div className="h-3 w-20 rounded skeleton" />
                </div>
                <div className="h-3 w-full rounded skeleton ml-8" />
                <div className="h-3 w-3/4 rounded skeleton ml-8" />
              </div>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => { if (!loading) onCancel(); }}
    >
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
            <TrashIcon className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{title}</p>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-500/15 border border-red-500/30 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
          >
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [userId, setUserId]       = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [comments, setComments]     = useState<ReviewComment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  const [commentBody, setCommentBody] = useState("");
  const [commentLine, setCommentLine] = useState("");
  const [submitting, setSubmitting]   = useState(false);

  const [mentionOpen, setMentionOpen]     = useState(false);
  const [mentionQuery, setMentionQuery]   = useState("");
  const [mentionAnchor, setMentionAnchor] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody]                 = useState("");

  const [deleteCommentConfirmId, setDeleteCommentConfirmId] = useState<string | null>(null);
  const [deleteSubConfirmOpen, setDeleteSubConfirmOpen]     = useState(false);
  const [actionLoading, setActionLoading]                   = useState(false);

  const [feedback, setFeedback] = useState("");

  const commentsEndRef = useRef<HTMLDivElement>(null);

  const [votes, setVotes]             = useState<Record<string, VoteTally>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Copy-to-clipboard state for code toolbar
  const [copied, setCopied] = useState(false);

  // AI review state
  const [rightTab,  setRightTab]  = useState<"comments" | "ai">("comments");
  const [aiReview,  setAiReview]  = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);

  // Summarize discussion state
  const [summaryOpen,    setSummaryOpen]    = useState(false);
  const [summary,        setSummary]        = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError,   setSummaryError]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
    });
  }, [router]);

  useEffect(() => {
    getMyOrg().then((org) => {
      if (org) getOrgMembers(org.id).then(setOrgMembers);
    });
  }, []);

  const fetchAll = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
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

  // ─── @mention helpers ──────────────────────────────────────────────────────

  const filteredMembers = orgMembers
    .filter((m) => (m.user_email?.toLowerCase() ?? "").includes(mentionQuery.toLowerCase()))
    .slice(0, 5);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentBody(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([^@\s]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionAnchor(cursor - match[0].length);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const insertMention = (email: string) => {
    const before = commentBody.slice(0, mentionAnchor);
    const after  = commentBody.slice(mentionAnchor + 1 + mentionQuery.length);
    setCommentBody(`${before}@${email} ${after}`);
    setMentionOpen(false);
    setMentionQuery("");
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

  const handleCopy = async () => {
    if (!submission?.code) return;
    await navigator.clipboard.writeText(submission.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiReview = async () => {
    setRightTab("ai");
    if (aiReview) return;          // already fetched — just switch tab
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await requestAiReview(params.id);
      setAiReview(data.review);
    } catch (e) {
      setAiError((e as Error).message || "AI review failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSummarize = async () => {
    setSummaryOpen(true);
    if (summary) return;           // already fetched — just open modal
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await summarizeDiscussion(params.id);
      setSummary(data.summary);
    } catch (e) {
      setSummaryError((e as Error).message || "Summarization failed.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // ─── Derived ───────────────────────────────────────────────────────────────

  const isOwner =
    (submission as any)?.user_id === userId ||
    submission?.author_id === userId;

  const isMyComment = (c: ReviewComment) =>
    (c as any).user_email === userEmail || c.author_email === userEmail;

  const isOpenForReview = ["open", "pending"].includes((submission?.status as string) ?? "");

  const extensions = submission
    ? [EditorView.lineWrapping, EditorView.editable.of(false), (langMap[submission.language] || javascript)()]
    : [];

  const lineCount = submission?.code.split("\n").length ?? 0;
  const langMeta = submission ? (LANG_META[submission.language] ?? { color: "text-zinc-400", bg: "bg-zinc-500/10" }) : null;

  // ─── Loading / error ───────────────────────────────────────────────────────

  if (loading) return <ReviewPageSkeleton />;

  if (error || !submission) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 mx-auto">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-zinc-300 font-medium">{error || "Submission not found."}</p>
            <Link href="/dashboard" className="inline-block text-sm text-[hsl(var(--accent))] hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-4 h-12 flex items-center gap-3">
          <Link
            href="/review"
            className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors rounded-lg px-2 py-1 hover:bg-surface-muted"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs font-medium">Reviews</span>
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-sm font-medium text-white truncate flex-1">{submission.title}</span>
          <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 shrink-0 ${STATUS_STYLES[submission.status] ?? STATUS_STYLES.open}`}>
            {submission.status.replace("_", " ")}
          </span>
        </header>

        <div className="flex-1 flex overflow-hidden">

          {/* ── Left panel — metadata ── */}
          <motion.aside
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="w-52 shrink-0 border-r border-border bg-surface-muted/10 overflow-y-auto p-4 space-y-4"
          >
            {/* Author */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1.5">Author</p>
              <div className="flex items-center gap-2">
                <Avatar email={(submission as any).user_email || submission.author_email || "?"} size="md" />
                <p className="text-xs text-zinc-300 break-all leading-tight">
                  {((submission as any).user_email || submission.author_email || "").split("@")[0]}
                </p>
              </div>
            </div>

            {/* Language */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1.5">Language</p>
              {langMeta && (
                <span className={`inline-flex items-center text-xs font-mono font-semibold rounded-md px-2 py-0.5 ${langMeta.color} ${langMeta.bg}`}>
                  {submission.language}
                </span>
              )}
            </div>

            {/* Room */}
            {submission.room_name && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1">Room</p>
                <p className="text-xs text-zinc-300">{submission.room_name}</p>
              </div>
            )}

            {/* Submitted */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1">Submitted</p>
              <p className="text-xs text-zinc-400">{relativeTime(submission.created_at)}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {new Date(submission.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>

            {/* Score */}
            {submission.score != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1">Score</p>
                <p className="text-2xl font-bold text-transparent bg-clip-text"
                  style={{ backgroundImage: "linear-gradient(135deg, hsl(199 89% 58%), #a78bfa)" }}>
                  {submission.score}
                </p>
              </div>
            )}

            {/* Feedback */}
            {submission.feedback && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1">Feedback</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{submission.feedback}</p>
              </div>
            )}

            <Timer submissionId={submission.id} isOwner={isOwner} />

            {/* Status change (owner only) */}
            {isOwner && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1.5">Change Status</p>
                <select
                  value={submission.status}
                  onChange={(e) => handleStatusChange(e.target.value as "open" | "in_review" | "resolved")}
                  className="w-full rounded-lg border border-border bg-surface-muted/50 px-2 py-1.5 text-xs text-zinc-300 focus:border-[hsl(var(--accent))] focus:outline-none appearance-none cursor-pointer hover:border-zinc-500 transition-colors"
                >
                  <option value="open">Open</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            )}

            {/* Attachments */}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-2">
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </p>
              {attachments.length === 0 ? (
                <p className="text-xs text-zinc-600">No attachments.</p>
              ) : (
                <div className="space-y-1">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-1.5 group">
                      <svg className="h-3 w-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-xs text-[hsl(var(--accent))] hover:underline truncate"
                      >
                        {att.filename}
                      </a>
                      {isOwner && (
                        <button
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isOwner && (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="mt-2 w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {uploadingFile ? (
                      <>
                        <div className="h-3 w-3 rounded-full border border-zinc-500 border-t-transparent animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>+ Attach file</>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Delete submission */}
            {isOwner && (
              <div className="pt-2 border-t border-border">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setDeleteSubConfirmOpen(true)}
                  className="w-full rounded-xl border border-red-500/25 bg-red-500/8 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15 hover:border-red-500/40 transition-colors flex items-center justify-center gap-1.5"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete Submission
                </motion.button>
              </div>
            )}

            {/* Review decision */}
            {!isOwner && isOpenForReview && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">Review Decision</p>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional feedback…"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface-muted/50 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-[hsl(var(--accent))] focus:outline-none resize-none leading-relaxed"
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleApprove}
                  disabled={submitting}
                  className="w-full rounded-xl bg-green-600/90 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                >
                  ✓ Approve
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleReject}
                  disabled={submitting}
                  className="w-full rounded-xl bg-red-600/90 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  ✗ Reject
                </motion.button>
              </div>
            )}
          </motion.aside>

          {/* ── Center panel — code viewer ── */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-surface-muted/20">
              <div className="flex items-center gap-2.5">
                {langMeta && (
                  <span className={`text-xs font-mono font-semibold rounded px-2 py-0.5 ${langMeta.color} ${langMeta.bg}`}>
                    {submission.language}
                  </span>
                )}
                <span className="text-xs text-zinc-600">{lineCount} lines</span>
                <span className="text-xs text-zinc-700">·</span>
                <span className="text-xs text-zinc-600">{submission.code.length} chars</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Summarize Discussion button — only when >3 comments */}
                {comments.length > 3 && (
                  <motion.button
                    onClick={handleSummarize}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={summaryLoading}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border text-zinc-400 border-border hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10 bg-surface-muted/20 disabled:opacity-60"
                  >
                    {summaryLoading ? (
                      <>
                        <div className="h-3.5 w-3.5 rounded-full border border-amber-400/50 border-t-transparent animate-spin" />
                        Summarizing…
                      </>
                    ) : (
                      <>
                        <DocumentTextIcon className="h-3.5 w-3.5" />
                        Summarize
                      </>
                    )}
                  </motion.button>
                )}

                {/* AI Review button */}
                <motion.button
                  onClick={handleAiReview}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={aiLoading}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
                    rightTab === "ai"
                      ? "text-violet-400 border-violet-500/40 bg-violet-500/10"
                      : "text-zinc-400 border-border hover:text-violet-300 hover:border-violet-500/40 hover:bg-violet-500/8 bg-surface-muted/20"
                  } disabled:opacity-60`}
                >
                  {aiLoading ? (
                    <>
                      <div className="h-3.5 w-3.5 rounded-full border border-violet-400/50 border-t-transparent animate-spin" />
                      Reviewing…
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-3.5 w-3.5" />
                      AI Review
                    </>
                  )}
                </motion.button>

                {/* Copy button */}
                <motion.button
                  onClick={handleCopy}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
                    copied
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-zinc-400 border-border hover:text-zinc-200 hover:border-zinc-600 bg-surface-muted/20"
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
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
          </div>

          {/* ── Right panel — comments ── */}
          <motion.aside
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" as const, delay: 0.05 }}
            className="w-72 shrink-0 border-l border-border bg-surface-muted/10 flex flex-col"
          >
            {/* Panel header — tab toggle */}
            <div className="shrink-0 px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-0.5 bg-surface-muted/30 rounded-xl p-0.5">
                <button
                  onClick={() => setRightTab("comments")}
                  className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                >
                  {rightTab === "comments" && (
                    <motion.div
                      layoutId="right-tab-pill"
                      className="absolute inset-0 rounded-lg bg-surface-muted border border-border shadow-sm"
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <span className={`relative z-10 flex items-center gap-1.5 ${rightTab === "comments" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    <ChatIcon className="h-3 w-3" />
                    Comments
                    {comments.length > 0 && (
                      <span className="text-[10px] text-zinc-500">{comments.length}</span>
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setRightTab("ai")}
                  className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                >
                  {rightTab === "ai" && (
                    <motion.div
                      layoutId="right-tab-pill"
                      className="absolute inset-0 rounded-lg bg-violet-500/10 border border-violet-500/20 shadow-sm"
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <span className={`relative z-10 flex items-center gap-1.5 ${rightTab === "ai" ? "text-violet-300" : "text-zinc-500 hover:text-zinc-300"}`}>
                    <SparklesIcon className="h-3 w-3" />
                    AI Review
                  </span>
                </button>
              </div>
            </div>

            {rightTab === "comments" ? (<>
            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-muted border border-border">
                    <ChatIcon className="h-5 w-5 text-zinc-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500">No comments yet</p>
                    <p className="text-[11px] text-zinc-700 mt-0.5">Be the first to leave feedback</p>
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {comments.map((c) => (
                    <CommentCard
                      key={c.id}
                      c={c}
                      isMine={isMyComment(c)}
                      tally={votes[c.id]}
                      editingId={editingCommentId}
                      editBody={editBody}
                      actionLoading={actionLoading}
                      onEdit={() => { setEditingCommentId(c.id); setEditBody(c.body); }}
                      onSave={() => handleEditComment(c.id)}
                      onCancelEdit={() => { setEditingCommentId(null); setEditBody(""); }}
                      onDelete={() => setDeleteCommentConfirmId(c.id)}
                      onVote={(v) => handleVote(c.id, v)}
                      onEditChange={setEditBody}
                    />
                  ))}
                </AnimatePresence>
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Comment form */}
            <form onSubmit={handleAddComment} className="shrink-0 border-t border-border p-3 space-y-2">
              {/* Line number */}
              <input
                type="number"
                min={1}
                placeholder="Line # (optional)"
                value={commentLine}
                onChange={(e) => setCommentLine(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-[hsl(var(--accent))] focus:outline-none transition-colors"
              />

              {/* Textarea + @mention dropdown */}
              <div className="relative">
                <AnimatePresence>
                  {mentionOpen && filteredMembers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 right-0 mb-1.5 bg-surface border border-border rounded-xl shadow-2xl z-10 overflow-hidden"
                    >
                      {filteredMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-surface-muted transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(m.user_email ?? "");
                          }}
                        >
                          <Avatar email={m.user_email ?? ""} />
                          <span className="text-xs text-zinc-300 truncate">{m.user_email}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <textarea
                  ref={textareaRef}
                  placeholder="Add a comment… (@ to mention)"
                  value={commentBody}
                  onChange={handleCommentChange}
                  onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-surface-muted/40 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-[hsl(var(--accent))] focus:outline-none resize-none leading-relaxed transition-colors"
                />
              </div>

              <motion.button
                type="submit"
                disabled={submitting || !commentBody.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-xl bg-[hsl(var(--accent))] py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <div className="h-3 w-3 rounded-full border border-white/50 border-t-transparent animate-spin" />
                    Posting…
                  </>
                ) : (
                  <>
                    <SendIcon className="h-3 w-3" />
                    Post Comment
                  </>
                )}
              </motion.button>
            </form>
            </>) : (
            /* ── AI Review panel ── */
            <motion.div
              key="ai-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto p-3"
            >
              {aiLoading ? (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <div className="h-3 w-16 rounded skeleton" />
                    <div className="h-2.5 rounded skeleton" />
                    <div className="h-2.5 w-4/5 rounded skeleton" />
                    <div className="h-2.5 w-3/5 rounded skeleton" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-16 rounded skeleton" />
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-2.5 rounded skeleton" style={{ width: `${60 + j * 12}%` }} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-20 rounded skeleton" />
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="h-2.5 rounded skeleton" style={{ width: `${55 + j * 10}%` }} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-12 rounded skeleton" />
                    <div className="h-2.5 w-2/5 rounded skeleton" />
                  </div>
                </div>
              ) : aiError ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-400">Review failed</p>
                    <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">{aiError}</p>
                  </div>
                  <button
                    onClick={handleAiReview}
                    className="text-xs text-[hsl(var(--accent))] hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : aiReview ? (
                <AiReviewPanel review={aiReview} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <SparklesIcon className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-300">AI Code Review</p>
                    <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                      Click <span className="text-violet-400 font-medium">AI Review</span> in the toolbar to get instant feedback.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
            )}
          </motion.aside>
        </div>
      </div>

      {/* ── Confirm dialogs ── */}
      <AnimatePresence>
        {deleteCommentConfirmId && (
          <ConfirmDialog
            title="Delete comment?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            loading={actionLoading}
            onConfirm={() => handleDeleteComment(deleteCommentConfirmId)}
            onCancel={() => { if (!actionLoading) setDeleteCommentConfirmId(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteSubConfirmOpen && (
          <ConfirmDialog
            title="Delete submission?"
            description="All comments and attachments will be permanently lost."
            confirmLabel="Delete"
            loading={actionLoading}
            onConfirm={handleDeleteSubmission}
            onCancel={() => { if (!actionLoading) setDeleteSubConfirmOpen(false); }}
          />
        )}
      </AnimatePresence>

      {/* ── Summary modal ── */}
      <AnimatePresence>
        {summaryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => { if (!summaryLoading) setSummaryOpen(false); }}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                    <DocumentTextIcon className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight">Discussion Summary</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {comments.length} comment{comments.length !== 1 ? "s" : ""} · AI-generated
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSummaryOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-surface-muted transition-colors shrink-0"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              {summaryLoading ? (
                <div className="space-y-2.5">
                  {["100%", "88%", "95%", "76%", "82%"].map((w, i) => (
                    <div key={i} className="h-3 rounded skeleton" style={{ width: w }} />
                  ))}
                </div>
              ) : summaryError ? (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-red-400">{summaryError}</p>
                  <button
                    onClick={() => { setSummary(null); setSummaryError(null); handleSummarize(); }}
                    className="text-xs text-[hsl(var(--accent))] hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
              )}

              {!summaryLoading && (
                <div className="mt-5 flex items-center justify-between">
                  <button
                    onClick={() => { setSummary(null); setSummaryError(null); handleSummarize(); }}
                    disabled={summaryLoading}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </button>
                  <button
                    onClick={() => setSummaryOpen(false)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function ThumbUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  );
}

function ThumbDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function DocumentTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

// ─── AI Review panel ──────────────────────────────────────────────────────────

function AiReviewPanel({ review }: { review: string }) {
  const sectionMeta: Record<string, string> = {
    Summary:     "text-sky-400",
    Issues:      "text-red-400",
    Suggestions: "text-emerald-400",
    Score:       "text-violet-400",
  };

  const blocks = review.split(/^## /m).filter(Boolean);

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        const nl      = block.indexOf("\n");
        const heading = (nl !== -1 ? block.slice(0, nl) : block).trim();
        const body    = (nl !== -1 ? block.slice(nl + 1) : "").trim();
        const color   = sectionMeta[heading] ?? "text-zinc-400";
        return (
          <div key={i} className="space-y-1.5">
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>
              {heading}
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        );
      })}
    </div>
  );
}
