"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { motion, AnimatePresence, type Variants } from "framer-motion";

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function apiFetch(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  user_id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  title: string;
  language: string;
  status: string;
  created_at: string;
  user_email: string;
};

type ActivityRow = {
  id: string;
  submission_id: string;
  body: string;
  line_number: number | null;
  created_at: string;
  user_email: string;
};

type Tab = "submissions" | "activity" | "about";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewed:  "bg-blue-500/10  text-blue-400  border-blue-500/20",
  approved:  "bg-green-500/10 text-green-400 border-green-500/20",
  rejected:  "bg-red-500/10   text-red-400   border-red-500/20",
  open:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  in_review: "bg-cyan-500/10  text-cyan-400  border-cyan-500/20",
  resolved:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const LANG_COLOR: Record<string, string> = {
  python:     "text-green-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  sql:        "text-orange-400",
  go:         "text-cyan-400",
  rust:       "text-red-400",
  java:       "text-amber-400",
};

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-rose-600",
  "from-pink-500 to-fuchsia-600",
  "from-amber-500 to-yellow-600",
];

function avatarGradient(username: string) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

// ─── Framer Motion variants ───────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const tabContent: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.18 } },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

function ProfileAvatar({ profile }: { profile: Profile }) {
  const [imgError, setImgError] = useState(false);
  const initial  = profile.username[0]?.toUpperCase() ?? "?";
  const gradient = avatarGradient(profile.username);

  if (profile.avatar_url && !imgError) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.username}
        onError={() => setImgError(true)}
        className="h-24 w-24 rounded-2xl object-cover ring-2 ring-white/10 shadow-xl shrink-0"
      />
    );
  }

  return (
    <div
      className={`h-24 w-24 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center
        text-3xl font-bold text-white ring-2 ring-white/10 shadow-xl select-none shrink-0`}
    >
      {initial}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl border border-border bg-surface-muted/20 p-4 flex flex-col
        items-center gap-1.5 hover:bg-surface-muted/30 transition-colors"
    >
      <span className="text-zinc-500">{icon}</span>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
    </motion.div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/20 p-4 space-y-2 animate-pulse">
      <div className="h-3.5 w-2/3 rounded bg-zinc-800" />
      <div className="h-3   w-1/3 rounded bg-zinc-800/60" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-muted/10 px-6 py-14 text-center">
      <div className="h-14 w-14 mx-auto rounded-2xl bg-surface-muted/40 flex items-center justify-center
        text-zinc-600 mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <p className="text-xs text-zinc-600 mt-1">{subtitle}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params   = useParams<{ username: string }>();
  const router   = useRouter();
  const username = decodeURIComponent(params.username ?? "");

  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [activity,    setActivity]    = useState<ActivityRow[]>([]);
  const [tab,         setTab]         = useState<Tab>("submissions");
  const [loading,     setLoading]     = useState(true);
  const [tabLoading,  setTabLoading]  = useState(false);
  const [notFound,    setNotFound]    = useState(false);

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
    });
  }, [router]);

  // Load profile + submissions on mount
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotFound(false);

    apiFetch(`/api/v1/profiles/${encodeURIComponent(username)}`)
      .then((p: Profile) => {
        setProfile(p);
        return apiFetch(`/api/v1/profiles/${encodeURIComponent(username)}/submissions`);
      })
      .then((subs: SubmissionRow[]) => setSubmissions(subs))
      .catch((err: Error) => {
        if (err.message === "404") setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [username]);

  // Lazy-load activity tab
  const loadActivity = useCallback(async () => {
    if (activity.length > 0 || !username) return;
    setTabLoading(true);
    try {
      const data: ActivityRow[] = await apiFetch(
        `/api/v1/profiles/${encodeURIComponent(username)}/activity`
      );
      setActivity(data);
    } finally {
      setTabLoading(false);
    }
  }, [username, activity.length]);

  function handleTabChange(t: Tab) {
    setTab(t);
    if (t === "activity") loadActivity();
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center">
            <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-10">
            <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
              <div className="rounded-2xl border border-border bg-surface-muted/20 p-6 space-y-5">
                <div className="flex items-start gap-5">
                  <div className="h-24 w-24 rounded-2xl bg-zinc-800 shrink-0" />
                  <div className="flex-1 space-y-2 pt-2">
                    <div className="h-5 w-36 rounded bg-zinc-800" />
                    <div className="h-3.5 w-52 rounded bg-zinc-800/70" />
                    <div className="h-3 w-32 rounded bg-zinc-800/50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-2xl border border-border bg-surface-muted/10 p-4 text-center">
                      <div className="h-6 w-10 mx-auto rounded bg-zinc-800 mb-1" />
                      <div className="h-3 w-16 mx-auto rounded bg-zinc-800/60" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (notFound || !profile) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-5 max-w-sm px-6"
          >
            <div className="h-20 w-20 mx-auto rounded-2xl bg-surface-muted/40 border border-border
              flex items-center justify-center text-zinc-600">
              <UserIcon className="h-10 w-10" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Profile not found</p>
              <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
                <span className="font-mono text-zinc-400">@{username}</span> hasn&apos;t set up a profile yet,
                or this username doesn&apos;t exist.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  const approvedCount = submissions.filter((s) => s.status === "approved").length;

  // ── Main ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <span className="text-xs text-zinc-600 font-mono">@{profile.username}</span>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

            {/* ── Hero card ── */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="rounded-2xl border border-border bg-surface-muted/20 p-6 space-y-5"
            >
              {/* Avatar + identity */}
              <motion.div variants={fadeUp} className="flex items-start gap-5">
                <ProfileAvatar profile={profile} />

                <div className="flex-1 min-w-0 pt-1">
                  <h1 className="text-2xl font-bold text-white leading-tight break-all">
                    {profile.username}
                  </h1>
                  {profile.bio && (
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                      {profile.bio}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2.5">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                    Joined{" "}
                    {new Date(profile.created_at).toLocaleDateString([], {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </motion.div>

              {/* Stats */}
              <motion.div variants={stagger} className="grid grid-cols-2 gap-3">
                <StatCard value={submissions.length}  label="Submissions" icon={<DocumentIcon className="h-4 w-4" />} />
                <StatCard value={approvedCount}        label="Approved"    icon={<CheckCircleIcon className="h-4 w-4" />} />
              </motion.div>
            </motion.div>

            {/* ── Tab bar ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="flex items-center gap-1 bg-surface-muted/20 rounded-xl border border-border p-1"
            >
              {(
                [
                  { key: "submissions" as Tab, label: "Submissions",     badge: submissions.length },
                  { key: "activity"    as Tab, label: "Review Activity", badge: null },
                  { key: "about"       as Tab, label: "About",           badge: null },
                ]
              ).map(({ key, label, badge }) => (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg
                    px-3 py-2 text-sm font-medium transition-colors"
                >
                  {tab === key && (
                    <motion.div
                      layoutId="profile-tab-pill"
                      className="absolute inset-0 rounded-lg bg-surface-muted border border-border shadow-sm"
                      style={{ zIndex: 0 }}
                      transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                    />
                  )}
                  <span className={`relative z-10 transition-colors ${
                    tab === key ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}>
                    {label}
                  </span>
                  {badge !== null && badge > 0 && (
                    <span className={`relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-colors ${
                      tab === key ? "bg-accent/20 text-accent" : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </motion.div>

            {/* ── Tab content ── */}
            <AnimatePresence mode="wait">

              {/* Submissions tab */}
              {tab === "submissions" && (
                <motion.div key="submissions" variants={tabContent} initial="hidden" animate="visible" exit="exit"
                  className="space-y-2.5">
                  {submissions.length === 0 ? (
                    <EmptyState
                      icon={<DocumentIcon className="h-8 w-8" />}
                      title="No submissions yet"
                      subtitle="This user hasn't submitted any code for review."
                    />
                  ) : (
                    submissions.map((sub, i) => (
                      <motion.div
                        key={sub.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Link
                          href={`/review/${sub.id}`}
                          className="flex items-center gap-4 rounded-xl border border-border
                            bg-surface-muted/20 px-4 py-3.5 hover:bg-surface-muted/40
                            hover:border-border/80 transition-all group"
                        >
                          {/* Language accent strip */}
                          <div
                            className={`w-1 self-stretch rounded-full shrink-0 bg-current opacity-40
                              group-hover:opacity-70 transition-opacity ${LANG_COLOR[sub.language] ?? "text-zinc-500"}`}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white truncate
                                group-hover:text-accent transition-colors">
                                {sub.title || "Untitled"}
                              </span>
                              <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium shrink-0
                                ${STATUS_PILL[sub.status] ?? STATUS_PILL.pending}`}>
                                {sub.status.replace("_", " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs font-mono ${LANG_COLOR[sub.language] ?? "text-zinc-400"}`}>
                                {sub.language}
                              </span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-xs text-zinc-500">
                                {new Date(sub.created_at).toLocaleDateString([], {
                                  year: "numeric", month: "short", day: "numeric",
                                })}
                              </span>
                            </div>
                          </div>

                          <ChevronRightIcon className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400
                            shrink-0 transition-colors" />
                        </Link>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}

              {/* Activity tab */}
              {tab === "activity" && (
                <motion.div key="activity" variants={tabContent} initial="hidden" animate="visible" exit="exit"
                  className="space-y-2.5">
                  {tabLoading ? (
                    [0, 1, 2].map((i) => <SkeletonRow key={i} />)
                  ) : activity.length === 0 ? (
                    <EmptyState
                      icon={<ChatIcon className="h-8 w-8" />}
                      title="No review activity"
                      subtitle="This user hasn't left any comments on submissions."
                    />
                  ) : (
                    activity.map((item, i) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Link
                          href={`/review/${item.submission_id}`}
                          className="block rounded-xl border border-border bg-surface-muted/20 px-4 py-3.5
                            hover:bg-surface-muted/40 hover:border-border/80 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 h-7 w-7 rounded-full bg-accent/10 border border-accent/20
                              flex items-center justify-center shrink-0">
                              <ChatIcon className="h-3.5 w-3.5 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">
                                {item.body}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {item.line_number != null && (
                                  <>
                                    <span className="text-xs font-mono text-zinc-500">
                                      line {item.line_number}
                                    </span>
                                    <span className="text-zinc-700">·</span>
                                  </>
                                )}
                                <span className="text-xs text-zinc-500">
                                  {new Date(item.created_at).toLocaleDateString([], {
                                    year: "numeric", month: "short", day: "numeric",
                                  })}
                                </span>
                                <span className="ml-auto text-xs text-accent group-hover:underline shrink-0">
                                  View submission →
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}

              {/* About tab */}
              {tab === "about" && (
                <motion.div key="about" variants={tabContent} initial="hidden" animate="visible" exit="exit">
                  <div className="rounded-2xl border border-border bg-surface-muted/20 divide-y divide-border overflow-hidden">
                    {[
                      {
                        label: "Username",
                        content: <span className="font-mono text-accent">@{profile.username}</span>,
                      },
                      {
                        label: "Bio",
                        content: profile.bio
                          ? <span className="text-zinc-300 leading-relaxed">{profile.bio}</span>
                          : <span className="text-zinc-600 italic">No bio provided.</span>,
                      },
                      {
                        label: "Member since",
                        content: (
                          <span className="text-zinc-300">
                            {new Date(profile.created_at).toLocaleDateString([], {
                              weekday: "long", year: "numeric", month: "long", day: "numeric",
                            })}
                          </span>
                        ),
                      },
                      {
                        label: "Total submissions",
                        content: <span className="text-white font-semibold">{submissions.length}</span>,
                      },
                      {
                        label: "Approved",
                        content: (
                          <span className="text-green-400 font-semibold">
                            {approvedCount}
                            {submissions.length > 0 && (
                              <span className="text-zinc-500 font-normal ml-1.5">
                                ({Math.round((approvedCount / submissions.length) * 100)}%)
                              </span>
                            )}
                          </span>
                        ),
                      },
                    ].map(({ label, content }) => (
                      <div key={label} className="flex items-start gap-4 px-5 py-4">
                        <span className="w-36 shrink-0 text-xs font-medium text-zinc-500 pt-0.5">
                          {label}
                        </span>
                        <span className="text-sm flex-1">{content}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5m7-7-7 7 7 7" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
