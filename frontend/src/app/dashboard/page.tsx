"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  listCollabRooms,
  listSubmissions,
  getMyRank,
  type CollabRoomResponse,
  type Submission,
  type LeaderboardEntry,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

const LANG_COLORS: Record<string, string> = {
  python: "text-green-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  json: "text-amber-400",
};

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/30 p-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <div>
        <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
        <p className="text-xl font-semibold text-white">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t bg-accent/50 min-h-[2px]"
            style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
          />
          <span className="text-[9px] text-zinc-600">{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [rooms, setRooms] = useState<CollabRoomResponse[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const weekActivity = [3, 5, 2, 8, 4, 1, 6];

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setEmail(user.email ?? "");

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { router.replace("/login"); return; }

    const [roomsData, subsData, rankData] = await Promise.allSettled([
      listCollabRooms(token),
      listSubmissions(token),
      getMyRank(token),
    ]);

    if (roomsData.status === "fulfilled") setRooms(roomsData.value);
    if (subsData.status === "fulfilled") setSubmissions(subsData.value);
    if (rankData.status === "fulfilled") setMyRank(rankData.value);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const recentSubs = submissions.slice(0, 6);
  const approvedCount = submissions.filter((s) => s.status === "approved").length;
  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <h1 className="font-semibold text-white">Dashboard</h1>
          <UserMenu />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Collab Rooms"
              value={loading ? "—" : rooms.length}
              sub="active rooms"
              icon={<ZapIcon className="h-4 w-4" />}
            />
            <StatCard
              label="Submissions"
              value={loading ? "—" : submissions.length}
              sub={`${approvedCount} approved`}
              icon={<ClipboardIcon className="h-4 w-4" />}
            />
            <StatCard
              label="Leaderboard Rank"
              value={loading ? "—" : myRank ? `#${myRank.rank}` : "—"}
              sub={myRank ? `${myRank.score} pts` : "no score yet"}
              icon={<TrophyIcon className="h-4 w-4" />}
            />
            <StatCard
              label="Pending Review"
              value={loading ? "—" : pendingCount}
              sub="awaiting feedback"
              icon={<ClockIcon className="h-4 w-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submissions list */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-300">Recent Submissions</h2>
                <Link href="/review" className="text-xs text-accent hover:underline">
                  View all →
                </Link>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl border border-border bg-surface-muted/20 animate-pulse" />
                  ))}
                </div>
              ) : recentSubs.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface-muted/20 p-8 text-center">
                  <p className="text-zinc-400 text-sm">No submissions yet.</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    Submit code from a{" "}
                    <Link href="/collab" className="text-accent hover:underline">
                      collab room
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSubs.map((sub) => (
                    <Link
                      key={sub.id}
                      href={`/review/${sub.id}`}
                      className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/20 px-4 py-3 hover:bg-surface-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
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
                        <span className="shrink-0 text-sm font-semibold text-accent">
                          {sub.score}pts
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Weekly activity */}
              <div className="rounded-xl border border-border bg-surface-muted/20 p-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-3">
                  Weekly Activity
                </h3>
                <MiniBarChart data={weekActivity} />
              </div>

              {/* Active rooms */}
              <div className="rounded-xl border border-border bg-surface-muted/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-zinc-400">
                    Active Collab Rooms
                  </h3>
                  <Link href="/collab" className="text-xs text-accent hover:underline">
                    All →
                  </Link>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-8 rounded-lg bg-surface-muted/30 animate-pulse" />
                    ))}
                  </div>
                ) : rooms.length === 0 ? (
                  <p className="text-xs text-zinc-600">
                    No rooms.{" "}
                    <Link href="/collab" className="text-accent hover:underline">
                      Create one →
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {rooms.slice(0, 4).map((room) => (
                      <Link
                        key={room.id}
                        href={`/collab/${room.id}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted/40 transition-colors"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className="text-xs text-zinc-300 truncate flex-1">
                          {room.name}
                        </span>
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {room.member_count}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="rounded-xl border border-border bg-surface-muted/20 p-4 space-y-2">
                <h3 className="text-xs font-medium text-zinc-400 mb-1">
                  Quick Actions
                </h3>
                <Link
                  href="/collab"
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-surface-muted transition-colors"
                >
                  <ZapIcon className="h-3.5 w-3.5 text-accent" />
                  New Collab Room
                </Link>
                <Link
                  href="/org"
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-surface-muted transition-colors"
                >
                  <BuildingIcon className="h-3.5 w-3.5 text-accent" />
                  My Organisation
                </Link>
                <Link
                  href="/leaderboard"
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-surface-muted transition-colors"
                >
                  <TrophyIcon className="h-3.5 w-3.5 text-accent" />
                  View Leaderboard
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
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
