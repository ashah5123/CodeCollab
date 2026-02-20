"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getProfile, listSubmissions, type UserProfile, type Submission } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  reviewed: "bg-blue-500/10 text-blue-400",
  approved: "bg-green-500/10 text-green-400",
  rejected: "bg-red-500/10 text-red-400",
};

const LANG_COLORS: Record<string, string> = {
  python: "text-green-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  json: "text-amber-400",
};

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setMyId(user.id);

    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token;
    if (!tok) { router.replace("/login"); return; }
    setToken(tok);

    const isMe = params.userId === user.id;
    try {
      const [prof, subs] = await Promise.allSettled([
        getProfile(tok, isMe ? undefined : params.userId),
        isMe ? listSubmissions(tok) : Promise.resolve([]),
      ]);
      if (prof.status === "fulfilled") setProfile(prof.value);
      else setError("Profile not found.");
      if (subs.status === "fulfilled") setSubmissions(subs.value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.userId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isMe = myId === params.userId;

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-400 text-sm">Loading profile…</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-zinc-400">{error || "Profile not found."}</p>
            <Link href="/dashboard" className="text-sm text-accent hover:underline">
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || profile.email;
  const letter = displayName[0]?.toUpperCase() ?? "?";
  const hue = [...profile.email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  const approvedSubs = submissions.filter((s) => s.status === "approved");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <h1 className="font-semibold text-white">
            {isMe ? "Your Profile" : "Profile"}
          </h1>
          {isMe && (
            <Link
              href="/settings"
              className="text-xs text-accent hover:underline"
            >
              Edit →
            </Link>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Profile header */}
            <div className="flex items-start gap-5">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ background: `hsl(${hue},55%,45%)` }}
              >
                {letter}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white">{displayName}</h2>
                <p className="text-sm text-zinc-500">{profile.email}</p>
                {profile.bio && (
                  <p className="text-sm text-zinc-400 mt-2 max-w-md">{profile.bio}</p>
                )}
                <p className="text-xs text-zinc-600 mt-2">
                  Member since {new Date(profile.created_at).toLocaleDateString([], { year: "numeric", month: "long" })}
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Score", value: profile.score },
                { label: "Rank", value: profile.rank != null ? `#${profile.rank}` : "—" },
                { label: "Submissions", value: profile.submissions_count },
                { label: "Approved", value: profile.approved_count },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-surface-muted/20 p-3 text-center"
                >
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Submissions (only shown for own profile) */}
            {isMe && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-300">
                    Submissions ({submissions.length})
                  </h3>
                  <Link href="/review" className="text-xs text-accent hover:underline">
                    View all →
                  </Link>
                </div>

                {submissions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface-muted/20 p-6 text-center">
                    <p className="text-sm text-zinc-500">No submissions yet.</p>
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
                              {sub.title}
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
                            <span className={`text-xs font-mono ${LANG_COLORS[sub.language] ?? "text-zinc-400"}`}>
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
            )}

            {/* Approved highlight for others */}
            {!isMe && approvedSubs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                  Approved Work
                </h3>
                <div className="space-y-2">
                  {approvedSubs.slice(0, 5).map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3"
                    >
                      <CheckIcon className="h-4 w-4 text-green-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{sub.title}</p>
                        <p className={`text-xs font-mono ${LANG_COLORS[sub.language] ?? "text-zinc-400"}`}>
                          {sub.language}
                        </p>
                      </div>
                      {sub.score != null && (
                        <span className="text-sm font-bold text-green-400">
                          {sub.score}pts
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
