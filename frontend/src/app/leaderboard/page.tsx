"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getLeaderboard, getMyRank, type LeaderboardEntry } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

function Medal({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="text-yellow-400 font-bold text-base">🥇</span>;
  if (rank === 2)
    return <span className="text-zinc-300 font-bold text-base">🥈</span>;
  if (rank === 3)
    return <span className="text-amber-600 font-bold text-base">🥉</span>;
  return (
    <span className="text-sm text-zinc-500 font-mono w-6 text-center">
      {rank}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  const letter = (email[0] ?? "?").toUpperCase();
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {letter}
    </span>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setMyId(user.id);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { router.replace("/login"); return; }

    const [boardRes, rankRes] = await Promise.allSettled([
      getLeaderboard(token),
      getMyRank(token),
    ]);

    if (boardRes.status === "fulfilled") {
      setBoard(boardRes.value);
    } else {
      setError("Leaderboard data unavailable.");
    }

    if (rankRes.status === "fulfilled") setMyEntry(rankRes.value);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-yellow-400" />
            <h1 className="font-semibold text-white">Leaderboard</h1>
          </div>
          {myEntry && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-1.5">
              <span className="text-xs text-zinc-400">Your rank</span>
              <span className="text-sm font-bold text-accent">#{myEntry.rank}</span>
              <span className="text-xs text-zinc-500">·</span>
              <span className="text-sm font-semibold text-white">{myEntry.score} pts</span>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl border border-border bg-surface-muted/20 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-surface-muted/20 p-10 text-center">
              <p className="text-zinc-400 text-sm">{error}</p>
              <p className="text-zinc-600 text-xs mt-1">
                The leaderboard will appear once the backend endpoint is available.
              </p>
            </div>
          ) : board.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface-muted/20 p-10 text-center">
              <p className="text-zinc-400 text-sm">No entries yet.</p>
              <p className="text-zinc-600 text-xs mt-1">
                Submit code for review to earn points.
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-2">
              {/* Top 3 podium */}
              {board.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[board[1], board[0], board[2]].map((entry, idx) => {
                    if (!entry) return null;
                    const heights = ["h-20", "h-28", "h-16"];
                    return (
                      <div
                        key={entry.user_id}
                        className={`rounded-xl border ${
                          entry.rank === 1
                            ? "border-yellow-500/30 bg-yellow-500/5"
                            : entry.rank === 2
                            ? "border-zinc-500/30 bg-zinc-500/5"
                            : "border-amber-700/30 bg-amber-700/5"
                        } flex flex-col items-center justify-end pb-4 pt-3 ${heights[idx]}`}
                      >
                        <Avatar email={entry.email} />
                        <p className="text-[11px] text-zinc-300 mt-1.5 truncate max-w-[90px] text-center">
                          {entry.display_name || entry.email.split("@")[0]}
                        </p>
                        <p className="text-sm font-bold text-white mt-0.5">
                          {entry.score}
                        </p>
                        <Medal rank={entry.rank} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[40px_1fr_80px_80px_80px] gap-0 px-4 py-2 border-b border-border bg-surface-muted/30">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide">#</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide">User</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide text-right">Score</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide text-right">Subs</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide text-right">Approved</span>
                </div>
                {board.map((entry) => {
                  const isMe = entry.user_id === myId;
                  return (
                    <div
                      key={entry.user_id}
                      className={`grid grid-cols-[40px_1fr_80px_80px_80px] gap-0 px-4 py-3 border-b border-border/50 last:border-0 ${
                        isMe ? "bg-accent/5" : "hover:bg-surface-muted/20"
                      } transition-colors`}
                    >
                      <div className="flex items-center">
                        <Medal rank={entry.rank} />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar email={entry.email} />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isMe ? "text-accent" : "text-white"}`}>
                            {entry.display_name || entry.email.split("@")[0]}
                            {isMe && (
                              <span className="ml-1.5 text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
                                you
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-zinc-600 truncate">{entry.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className="text-sm font-bold text-white">{entry.score}</span>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className="text-sm text-zinc-400">{entry.submissions_count}</span>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className="text-sm text-green-400">{entry.approved_count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
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
