"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getLeaderboard, type LeaderboardRow, type LeaderboardResponse } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

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
  const part = email.split("@")[0] ?? "?";
  const initials = part.slice(0, 2).toUpperCase();
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {initials}
    </span>
  );
}

function Section({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: LeaderboardRow[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/20 overflow-hidden">
      <h2 className="text-sm font-medium text-zinc-400 px-4 py-3 border-b border-border">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm px-4 py-6 text-center">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((row, idx) => (
            <li
              key={`${row.user_id}-${idx}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/20 transition-colors"
            >
              <div className="flex items-center w-8">
                <Medal rank={idx + 1} />
              </div>
              <Avatar email={row.user_email} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {row.user_email ? row.user_email.split("@")[0] : "Unknown"}
                </p>
                <p className="text-xs text-zinc-500 truncate">{row.user_email}</p>
              </div>
              <span className="text-sm font-bold text-accent shrink-0">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      const res = await getLeaderboard();
      setData(res);
      setError(null);
    } catch {
      setError("Leaderboard data unavailable.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-yellow-400" />
            <h1 className="font-semibold text-white">Leaderboard</h1>
          </div>
          <UserMenu />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-64 rounded-xl border border-border bg-surface-muted/20 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-surface-muted/20 p-10 text-center max-w-xl mx-auto">
              <p className="text-zinc-400 text-sm">{error}</p>
              <p className="text-zinc-600 text-xs mt-1">
                Make sure the backend is running and the leaderboard RPC is set up.
              </p>
            </div>
          ) : data ? (
            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              <Section
                title="Most Submissions"
                rows={data.by_submissions}
                emptyMessage="No submissions yet."
              />
              <Section
                title="Most Comments"
                rows={data.by_comments}
                emptyMessage="No comments yet."
              />
              <Section
                title="Most Reactions"
                rows={data.by_reactions_received}
                emptyMessage="No reactions received yet."
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  );
}
