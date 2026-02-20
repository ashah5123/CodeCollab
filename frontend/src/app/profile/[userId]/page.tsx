"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";

type SubmissionRow = {
  id: string;
  title: string;
  language: string;
  status: string;
  created_at: string;
  user_id: string;
  score?: number | null;
};

type ProfileData = {
  userId: string;
  email: string;
  joinDate: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-yellow-500/10 text-yellow-400",
  reviewed: "bg-blue-500/10 text-blue-400",
  approved: "bg-green-500/10 text-green-400",
  rejected: "bg-red-500/10 text-red-400",
};

const LANG_COLORS: Record<string, string> = {
  python:     "text-green-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  json:       "text-amber-400",
};

function Avatar({ email, size = "lg" }: { email: string; size?: "sm" | "lg" }) {
  const letter = (email[0] ?? "?").toUpperCase();
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  const sz = size === "lg" ? "h-16 w-16 text-2xl" : "h-8 w-8 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sz}`}
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {letter}
    </span>
  );
}

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [myId, setMyId]           = useState<string | null>(null);
  const [profile, setProfile]     = useState<ProfileData | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // ── 1. Auth guard ────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setMyId(user.id);

    const targetId = params.userId;
    const isMe = targetId === user.id;

    // ── 2. Resolve email + join date ─────────────────────────────────────────
    let email = "";
    let joinDate: string | null = null;

    if (isMe) {
      email    = user.email ?? "";
      joinDate = user.created_at ?? null;
    } else {
      // Try tables that store user_email alongside user_id, in priority order.
      const sources = [
        supabase.from("collab_room_members")
          .select("user_email")
          .eq("user_id", targetId)
          .limit(1)
          .maybeSingle(),
        supabase.from("global_chat_messages")
          .select("user_email, created_at")
          .eq("user_id", targetId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("organisation_members")
          .select("user_email")
          .eq("user_id", targetId)
          .limit(1)
          .maybeSingle(),
      ];

      for (const query of sources) {
        const { data } = await query;
        const row = data as Record<string, string> | null;
        if (row?.user_email) {
          email    = row.user_email;
          joinDate = row.created_at ?? null;
          break;
        }
      }

      if (!email) {
        setNotFound(true);
        setLoading(false);
        return;
      }
    }

    setProfile({ userId: targetId, email, joinDate });

    // ── 3. Submissions ───────────────────────────────────────────────────────
    const { data: subs } = await supabase
      .from("submissions")
      .select("id, title, language, status, created_at, user_id, score")
      .eq("user_id", targetId)
      .order("created_at", { ascending: false });

    setSubmissions((subs as SubmissionRow[]) ?? []);

    // ── 4. Comment count ─────────────────────────────────────────────────────
    const { count } = await supabase
      .from("document_comments")
      .select("*", { count: "exact", head: true })
      .eq("author_id", targetId);

    setCommentCount(count ?? 0);
    setLoading(false);
  }, [params.userId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isMe = myId === params.userId;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-400 text-sm">Loading profile…</p>
        </div>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound || !profile) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-surface-muted/40 text-zinc-600">
              <UserIcon className="h-8 w-8" />
            </div>
            <div>
              <p className="text-white font-semibold">User not found</p>
              <p className="text-sm text-zinc-500 mt-1">
                This profile doesn&apos;t exist or has no public activity yet.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  const approvedCount = submissions.filter((s) => s.status === "approved").length;

  const stats = [
    { label: "Submissions",  value: submissions.length },
    { label: "Approved",     value: approvedCount },
    { label: "Comments",     value: commentCount },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <h1 className="font-semibold text-white">
            {isMe ? "Your Profile" : "Profile"}
          </h1>
          {isMe && (
            <Link
              href="/settings"
              className="rounded-lg border border-border bg-surface-muted/30 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface-muted transition-colors"
            >
              Edit Profile
            </Link>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Avatar + identity */}
            <div className="flex items-start gap-5">
              <Avatar email={profile.email} />
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white break-all">
                  {profile.email}
                </h2>
                <p className="text-xs text-zinc-600 mt-1">
                  ID: <span className="font-mono">{profile.userId}</span>
                </p>
                {profile.joinDate && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Member since{" "}
                    {new Date(profile.joinDate).toLocaleDateString([], {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {stats.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-surface-muted/20 p-4 text-center"
                >
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Submissions list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-300">
                  Submissions ({submissions.length})
                </h3>
                {isMe && submissions.length > 0 && (
                  <Link href="/review" className="text-xs text-accent hover:underline">
                    View all →
                  </Link>
                )}
              </div>

              {submissions.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface-muted/20 p-8 text-center">
                  <p className="text-sm text-zinc-500">No submissions yet.</p>
                  {isMe && (
                    <p className="text-xs text-zinc-600 mt-1">
                      Submit code from a{" "}
                      <Link href="/collab" className="text-accent hover:underline">
                        collab room
                      </Link>{" "}
                      to get reviewed.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {submissions.map((sub) => (
                    <Link
                      key={sub.id}
                      href={`/review/${sub.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/20 px-4 py-3 hover:bg-surface-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">
                            {sub.title || "Untitled"}
                          </span>
                          <span
                            className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                              STATUS_STYLES[sub.status] ?? STATUS_STYLES.pending
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-xs font-mono ${
                              LANG_COLORS[sub.language] ?? "text-zinc-400"
                            }`}
                          >
                            {sub.language}
                          </span>
                          <span className="text-xs text-zinc-600">
                            {new Date(sub.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {sub.score != null && (
                        <span className="shrink-0 text-sm font-bold text-accent">
                          {sub.score}pts
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
