"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { basicDark } from "@uiw/codemirror-theme-basic";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import { supabase } from "@/lib/supabase";
import {
  listCollabRooms,
  listSubmissions,
  getMyRank,
  createSubmission,
  searchSubmissions,
  generateSubmissionMeta,
  type CollabRoomResponse,
  type Submission,
  type SearchResult,
  type LeaderboardEntry,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import { motion, AnimatePresence, type Variants } from "framer-motion";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

// gradient left-border accent per status
const STATUS_GLOW: Record<string, string> = {
  pending:  "from-yellow-500/40",
  reviewed: "from-blue-500/40",
  approved: "from-green-500/40",
  rejected: "from-red-500/40",
};

const LANG_META: Record<string, { color: string; bg: string }> = {
  python:     { color: "text-green-400",  bg: "bg-green-500/10" },
  javascript: { color: "text-yellow-400", bg: "bg-yellow-500/10" },
  typescript: { color: "text-blue-400",   bg: "bg-blue-500/10" },
  json:       { color: "text-amber-400",  bg: "bg-amber-500/10" },
  sql:        { color: "text-orange-400", bg: "bg-orange-500/10" },
  go:         { color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  rust:       { color: "text-red-400",    bg: "bg-red-500/10" },
  java:       { color: "text-amber-400",  bg: "bg-amber-500/10" },
};

const LANGUAGES = [
  { value: "python",     label: "Python",     pill: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "javascript", label: "JavaScript",  pill: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  { value: "typescript", label: "TypeScript",  pill: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "sql",        label: "SQL",         pill: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "go",         label: "Go",          pill: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { value: "rust",       label: "Rust",        pill: "bg-red-500/15 text-red-400 border-red-500/30" },
  { value: "java",       label: "Java",        pill: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
];

const whiteCursor = EditorView.theme({
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffffff" },
});

function getLangExtension(lang: string) {
  if (lang === "python") return [python()];
  if (lang === "typescript") return [javascript({ typescript: true })];
  if (lang === "javascript") return [javascript()];
  return [];
}

// ─── Framer Motion variants ────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

// ─── Helper: time-based greeting ──────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getDisplayName(email: string) {
  return email.split("@")[0];
}

// ─── Skeleton components ──────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/20 p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg skeleton shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3 w-20 rounded skeleton" />
        <div className="h-6 w-10 rounded skeleton" />
        <div className="h-2.5 w-16 rounded skeleton" />
      </div>
    </div>
  );
}

function SubmissionSkeleton() {
  return (
    <div className="relative rounded-xl border border-border bg-surface-muted/20 px-4 py-3 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-xl skeleton" />
      <div className="pl-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-36 rounded skeleton" />
          <div className="h-4 w-16 rounded-full skeleton" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-16 rounded skeleton" />
          <div className="h-3 w-20 rounded skeleton" />
        </div>
      </div>
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="h-1.5 w-1.5 rounded-full skeleton shrink-0" />
      <div className="h-3 flex-1 rounded skeleton" />
      <div className="h-3 w-4 rounded skeleton" />
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;   // tailwind gradient string e.g. "from-cyan-500/20 to-blue-500/10"
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={`relative rounded-xl border border-border bg-surface-muted/20 p-4 flex items-start gap-3 overflow-hidden`}
    >
      {/* subtle gradient wash */}
      {accent && (
        <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none`} />
      )}
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="relative">
        <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
        <p className="text-xl font-semibold text-white">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((v, i) => (
        <motion.div
          key={i}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: `${Math.max((v / max) * 100, 4)}%`, opacity: 1 }}
          transition={{ delay: 0.05 * i, duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-1 flex-1"
        >
          <div className="w-full rounded-t bg-accent/50 flex-1" />
          <span className="text-[9px] text-zinc-600">{days[i]}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({ sub }: { sub: Submission }) {
  const glow = STATUS_GLOW[sub.status] ?? "from-zinc-500/30";
  const lang  = LANG_META[sub.language] ?? { color: "text-zinc-400", bg: "bg-zinc-500/10" };

  return (
    <motion.div variants={fadeUp}>
      <Link
        href={`/review/${sub.id}`}
        className="group relative flex items-start gap-3 rounded-xl border border-border bg-surface-muted/20 px-4 py-3 overflow-hidden transition-colors hover:border-white/10"
      >
        {/* gradient left bar */}
        <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${glow} to-transparent`} />

        {/* hover background sweep */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

        <div className="relative flex-1 min-w-0 pl-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">
              {sub.title}
            </span>
            <span
              className={`text-[10px] font-medium rounded-full border px-2 py-0.5 ${
                STATUS_STYLES[sub.status] ?? STATUS_STYLES.pending
              }`}
            >
              {sub.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs font-mono rounded px-1.5 py-0.5 ${lang.bg} ${lang.color}`}>
              {sub.language}
            </span>
            <span className="text-xs text-zinc-600">
              {new Date(sub.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {sub.score != null && (
          <div className="relative shrink-0 flex flex-col items-end">
            <span className="text-sm font-bold text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(199 89% 58%), #a78bfa)" }}>
              {sub.score}
            </span>
            <span className="text-[10px] text-zinc-600">pts</span>
          </div>
        )}

        {/* arrow hint */}
        <div className="relative shrink-0 self-center text-zinc-700 group-hover:text-zinc-400 transition-colors ml-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Highlight helper ─────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-400/25 text-amber-200 rounded-sm px-0.5 not-italic">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Search result card ───────────────────────────────────────────────────────

const MATCH_FIELD_LABEL: Record<string, string> = {
  description: "desc",
  code: "code",
};

function SearchResultCard({ sub, query }: { sub: SearchResult; query: string }) {
  const glow = STATUS_GLOW[sub.status] ?? "from-zinc-500/30";
  const lang = LANG_META[sub.language] ?? { color: "text-zinc-400", bg: "bg-zinc-500/10" };

  return (
    <motion.div variants={fadeUp}>
      <Link
        href={`/review/${sub.id}`}
        className="group relative flex items-start gap-3 rounded-xl border border-border bg-surface-muted/20 px-4 py-3 overflow-hidden transition-colors hover:border-white/10"
      >
        <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${glow} to-transparent`} />
        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

        <div className="relative flex-1 min-w-0 pl-2 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">
              {sub.match_field === "title" && sub.match_snippet
                ? <Highlight text={sub.match_snippet} query={query} />
                : sub.title}
            </span>
            <span className={`text-[10px] font-medium rounded-full border px-2 py-0.5 ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.pending}`}>
              {sub.status}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono rounded px-1.5 py-0.5 ${lang.bg} ${lang.color}`}>
              {sub.language}
            </span>
            <span className="text-xs text-zinc-600">
              {new Date(sub.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          {sub.match_field && sub.match_field !== "title" && sub.match_snippet && (
            <div className="flex items-start gap-1.5 pt-0.5">
              <span className="text-[10px] font-mono text-zinc-600 shrink-0 mt-px">
                {MATCH_FIELD_LABEL[sub.match_field] ?? sub.match_field}:
              </span>
              <p className="text-[11px] text-zinc-500 font-mono leading-relaxed break-all">
                <Highlight text={sub.match_snippet} query={query} />
              </p>
            </div>
          )}
        </div>

        <div className="relative shrink-0 self-center text-zinc-700 group-hover:text-zinc-400 transition-colors ml-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySubmissions({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-dashed border-border bg-surface-muted/10 px-6 py-10 text-center flex flex-col items-center gap-4"
    >
      {/* illustration */}
      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20">
        <svg className="w-8 h-8 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white">
          0
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-white">No submissions yet</p>
        <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
          Submit your code for peer review to get feedback, earn points, and climb the leaderboard.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New Review
        </button>
        <Link
          href="/collab"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
        >
          Open a collab room
        </Link>
      </div>
    </motion.div>
  );
}

function EmptyRooms() {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10 border border-accent/20">
        <ZapIcon className="w-5 h-5 text-accent/70" />
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-400">No collab rooms</p>
        <p className="text-[11px] text-zinc-600 mt-0.5">Code together in real time</p>
      </div>
      <Link
        href="/collab"
        className="text-[11px] font-medium text-accent hover:underline"
      >
        Create your first room →
      </Link>
    </div>
  );
}

// ─── Welcome banner ───────────────────────────────────────────────────────────

function WelcomeBanner({ email, submissionCount, approvedCount }: {
  email: string;
  submissionCount: number;
  approvedCount: number;
}) {
  const name = getDisplayName(email);
  const greeting = getGreeting();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <motion.div
      variants={fadeUp}
      className="relative rounded-2xl overflow-hidden border border-white/10 px-6 py-5"
      style={{
        background: "linear-gradient(135deg, hsl(220 18% 13%) 0%, hsl(220 25% 16%) 50%, hsl(240 20% 15%) 100%)",
      }}
    >
      {/* gradient accent orb */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(199 89% 48% / 0.18) 0%, transparent 70%)" }} />
      <div className="absolute -bottom-8 right-1/3 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, #8b5cf6 / 0.12 0%, transparent 70%)", opacity: 0.15 }} />

      <div className="relative flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">{today}</p>
          <h2 className="text-xl font-bold text-white">
            {greeting},{" "}
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(199 89% 65%), #a78bfa)" }}>
              {name}
            </span>{" "}
            👋
          </h2>
          <p className="text-xs text-zinc-400">
            {submissionCount === 0
              ? "Ready to write some code? Submit your first snippet for review."
              : `You've made ${submissionCount} submission${submissionCount !== 1 ? "s" : ""}${approvedCount > 0 ? ` · ${approvedCount} approved` : ""} — keep it up!`}
          </p>
        </div>

        {/* mini metric */}
        <div className="hidden sm:flex flex-col items-center gap-0.5 shrink-0 text-center bg-white/5 rounded-xl px-5 py-3 border border-white/8">
          <span className="text-2xl font-bold text-white">{submissionCount}</span>
          <span className="text-[11px] text-zinc-500">submissions</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [rooms, setRooms] = useState<CollabRoomResponse[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalLang, setModalLang] = useState("python");
  const [modalCode, setModalCode] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError]   = useState<string | null>(null);

  // Search state
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = searchQuery.trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchSubmissions(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const weekActivity = [3, 5, 2, 8, 4, 1, 6];

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setEmail(user.email ?? "");

    const [roomsData, subsData, rankData] = await Promise.allSettled([
      listCollabRooms(),
      listSubmissions(),
      getMyRank(),
    ]);

    if (roomsData.status === "fulfilled") setRooms(roomsData.value);
    if (subsData.status === "fulfilled") setSubmissions(subsData.value);
    if (rankData.status === "fulfilled") setMyRank(rankData.value);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openModal = () => {
    setModalTitle("");
    setModalLang("python");
    setModalCode("");
    setModalDesc("");
    setModalError(null);
    setMetaLoading(false);
    setMetaError(null);
    setModalOpen(true);
  };

  const handleGenerateMeta = async () => {
    if (!modalCode.trim()) return;
    setMetaLoading(true);
    setMetaError(null);
    try {
      const result = await generateSubmissionMeta(modalCode, modalLang);
      if (result.title)       setModalTitle(result.title);
      if (result.description) setModalDesc(result.description);
    } catch (e) {
      setMetaError((e as Error).message || "Generation failed. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim() || !modalCode.trim()) return;
    setModalSubmitting(true);
    setModalError(null);
    try {
      const result = await createSubmission({
        title: modalTitle.trim(),
        language: modalLang,
        code: modalCode,
        description: modalDesc.trim(),
      });
      setModalOpen(false);
      router.push(`/review/${result.id}`);
    } catch (err) {
      setModalError((err as Error).message || "Submission failed.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const recentSubs    = submissions.slice(0, 6);
  const approvedCount = submissions.filter((s) => s.status === "approved").length;
  const pendingCount  = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center gap-4">
          <h1 className="font-semibold text-white shrink-0">Dashboard</h1>

          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              {searchLoading ? (
                <div className="h-4 w-4 rounded-full border border-zinc-500 border-t-transparent animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </div>
            <input
              type="search"
              placeholder="Search submissions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-muted/30 pl-9 pr-8 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:border-[hsl(var(--accent))] focus:outline-none transition-colors"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <motion.button
              onClick={openModal}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <PlusIcon className="h-4 w-4" />
              New Review
            </motion.button>
            <UserMenu />
          </div>
        </header>

        {/* ── Main ── */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6 max-w-6xl"
          >
            {/* Welcome banner */}
            {loading ? (
              <div className="h-24 rounded-2xl skeleton" />
            ) : (
              <WelcomeBanner
                email={email}
                submissionCount={submissions.length}
                approvedCount={approvedCount}
              />
            )}

            {/* Stats row */}
            <motion.div
              variants={staggerContainer}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <StatCard
                label="Collab Rooms"
                value={loading ? "—" : rooms.length}
                sub="active rooms"
                accent="from-cyan-500/10 to-transparent"
                icon={<ZapIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Submissions"
                value={loading ? "—" : submissions.length}
                sub={loading ? "" : `${approvedCount} approved`}
                accent="from-violet-500/10 to-transparent"
                icon={<ClipboardIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Leaderboard Rank"
                value={loading ? "—" : myRank ? `#${myRank.rank}` : "—"}
                sub={loading ? "" : myRank ? `${myRank.score} pts` : "no score yet"}
                accent="from-amber-500/10 to-transparent"
                icon={<TrophyIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Pending Review"
                value={loading ? "—" : pendingCount}
                sub={loading ? "" : "awaiting feedback"}
                accent="from-orange-500/10 to-transparent"
                icon={<ClockIcon className="h-4 w-4" />}
              />
            </motion.div>

            {/* Content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* ── Submissions / Search Results ── */}
              <div className="lg:col-span-2 space-y-3">
                <AnimatePresence mode="wait">
                  {searchQuery.trim() ? (
                    <motion.div
                      key="search"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-zinc-200">
                          {searchLoading
                            ? "Searching…"
                            : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${searchQuery}"`}
                        </h2>
                        <button
                          onClick={() => setSearchQuery("")}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Clear
                        </button>
                      </div>

                      {searchLoading ? (
                        <div className="space-y-2">
                          {[0, 1, 2].map((i) => <SubmissionSkeleton key={i} />)}
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface-muted/10 px-6 py-10 text-center flex flex-col items-center gap-3">
                          <SearchIcon className="h-8 w-8 text-zinc-700" />
                          <div>
                            <p className="text-sm font-medium text-zinc-400">No results found</p>
                            <p className="text-xs text-zinc-600 mt-0.5">
                              Try a different keyword or check your spelling
                            </p>
                          </div>
                        </div>
                      ) : (
                        <motion.div
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                          className="space-y-2"
                        >
                          {searchResults.map((sub) => (
                            <SearchResultCard key={sub.id} sub={sub} query={searchQuery} />
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="recent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-zinc-200">Recent Submissions</h2>
                        <Link href="/review" className="text-xs text-accent hover:underline">
                          View all →
                        </Link>
                      </div>

                      {loading ? (
                        <div className="space-y-2">
                          {[0, 1, 2, 3].map((i) => <SubmissionSkeleton key={i} />)}
                        </div>
                      ) : recentSubs.length === 0 ? (
                        <EmptySubmissions onNew={openModal} />
                      ) : (
                        <motion.div
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                          className="space-y-2"
                        >
                          {recentSubs.map((sub) => (
                            <SubmissionCard key={sub.id} sub={sub} />
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Right column ── */}
              <div className="space-y-4">

                {/* Weekly activity */}
                <motion.div variants={fadeUp} className="rounded-xl border border-border bg-surface-muted/20 p-4">
                  <h3 className="text-xs font-semibold text-zinc-400 mb-3">Weekly Activity</h3>
                  <MiniBarChart data={weekActivity} />
                </motion.div>

                {/* Active rooms */}
                <motion.div variants={fadeUp} className="rounded-xl border border-border bg-surface-muted/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-zinc-400">Active Collab Rooms</h3>
                    <Link href="/collab" className="text-xs text-accent hover:underline">
                      All →
                    </Link>
                  </div>

                  {loading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => <RoomSkeleton key={i} />)}
                    </div>
                  ) : rooms.length === 0 ? (
                    <EmptyRooms />
                  ) : (
                    <div className="space-y-0.5">
                      {rooms.slice(0, 4).map((room) => (
                        <Link
                          key={room.id}
                          href={`/collab/${room.id}`}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted/40 transition-colors"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                          <span className="text-xs text-zinc-300 truncate flex-1 group-hover:text-white transition-colors">
                            {room.name}
                          </span>
                          <span className="text-[10px] text-zinc-600 shrink-0">{room.member_count}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Quick actions */}
                <motion.div variants={fadeUp} className="rounded-xl border border-border bg-surface-muted/20 p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-400 mb-1">Quick Actions</h3>
                  {[
                    { href: "/collab",      icon: <ZapIcon className="h-3.5 w-3.5 text-accent" />,     label: "New Collab Room" },
                    { href: "/org",         icon: <BuildingIcon className="h-3.5 w-3.5 text-accent" />, label: "My Organisation" },
                    { href: "/leaderboard", icon: <TrophyIcon className="h-3.5 w-3.5 text-accent" />,   label: "View Leaderboard" },
                  ].map(({ href, icon, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-surface-muted hover:text-white transition-colors"
                    >
                      {icon}
                      {label}
                    </Link>
                  ))}
                </motion.div>

              </div>
            </div>
          </motion.div>
        </main>
      </div>

      {/* ── New Review Modal ── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <h2 className="text-base font-semibold text-white">New Review</h2>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-zinc-500 hover:text-white transition-colors rounded-lg p-1 hover:bg-surface-muted"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body */}
              <form onSubmit={handleModalSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">Title</label>
                    <button
                      type="button"
                      onClick={handleGenerateMeta}
                      disabled={!modalCode.trim() || metaLoading}
                      title={modalCode.trim() ? "Generate title & description from code" : "Paste code first"}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      {metaLoading ? (
                        <div className="h-3.5 w-3.5 rounded-full border border-violet-400/60 border-t-transparent animate-spin" />
                      ) : (
                        <WandIcon className="h-3.5 w-3.5" />
                      )}
                      {metaLoading ? "Generating…" : "Generate"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="e.g. Binary search implementation"
                    required
                    className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Language</label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setModalLang(l.value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          modalLang === l.value
                            ? `${l.pill} ring-2 ring-offset-1 ring-offset-surface ring-current`
                            : "border-border bg-surface-muted/20 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Code</label>
                  <div className="rounded-lg overflow-hidden border border-border" style={{ height: 260 }}>
                    <CodeMirror
                      value={modalCode}
                      height="260px"
                      theme={basicDark}
                      extensions={[...getLangExtension(modalLang), whiteCursor]}
                      onChange={(val) => setModalCode(val)}
                      basicSetup={{ lineNumbers: true, foldGutter: false }}
                      className="h-full text-left text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">
                      Problem Description
                      <span className="ml-1 text-zinc-600 font-normal">(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateMeta}
                      disabled={!modalCode.trim() || metaLoading}
                      title={modalCode.trim() ? "Generate title & description from code" : "Paste code first"}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      {metaLoading ? (
                        <div className="h-3.5 w-3.5 rounded-full border border-violet-400/60 border-t-transparent animate-spin" />
                      ) : (
                        <WandIcon className="h-3.5 w-3.5" />
                      )}
                      {metaLoading ? "Generating…" : "Generate"}
                    </button>
                  </div>
                  <textarea
                    value={modalDesc}
                    onChange={(e) => setModalDesc(e.target.value)}
                    placeholder="Describe the problem or what you'd like reviewed…"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none resize-none"
                  />
                </div>

                <AnimatePresence>
                  {metaError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-red-400 flex items-center gap-1.5"
                    >
                      <span className="shrink-0">✕</span>
                      {metaError}
                    </motion.p>
                  )}
                </AnimatePresence>

                {modalError && (
                  <p className="text-sm text-red-400">{modalError}</p>
                )}
              </form>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="new-review-form"
                  disabled={modalSubmitting || !modalTitle.trim() || !modalCode.trim()}
                  onClick={handleModalSubmit}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {modalSubmitting ? "Submitting…" : "Submit for Review"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
function WandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}
