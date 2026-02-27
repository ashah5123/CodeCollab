"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { listSubmissions, type Submission } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

const STATUS_STYLES: Record<string, string> = {
  open:      "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_review: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  resolved:  "bg-teal-500/10 text-teal-400 border-teal-500/20",
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewed:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved:  "bg-green-500/10 text-green-400 border-green-500/20",
  rejected:  "bg-red-500/10 text-red-400 border-red-500/20",
};

const LANG_COLORS: Record<string, string> = {
  python: "text-green-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  json: "text-amber-400",
};

type Filter = "all" | "open" | "in_review" | "resolved" | "pending" | "approved" | "rejected" | "reviewed";

export default function ReviewListPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    try {
      const subs = await listSubmissions();
      setSubmissions(subs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filter === "all"
    ? submissions
    : submissions.filter((s) => s.status === filter);

  const counts: Record<string, number> = { all: submissions.length };
  for (const s of submissions) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "open",      label: "Open" },
    { id: "in_review", label: "In Review" },
    { id: "resolved",  label: "Resolved" },
    { id: "pending",   label: "Pending" },
    { id: "reviewed",  label: "Reviewed" },
    { id: "approved",  label: "Approved" },
    { id: "rejected",  label: "Rejected" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center justify-between">
          <h1 className="font-semibold text-white">Code Review</h1>
          <UserMenu />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Filter tabs */}
          <div className="flex gap-1 mb-6 border-b border-border pb-0">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  filter === id
                    ? "border-accent text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
                {counts[id] != null && (
                  <span className="ml-1.5 text-xs text-zinc-600">
                    ({counts[id] ?? 0})
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl border border-border skeleton" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-surface-muted/20 p-10 text-center">
              <p className="text-zinc-400 text-sm">{error}</p>
              <p className="text-zinc-600 text-xs mt-1">
                The submissions endpoint will be available once the backend is set up.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface-muted/20 p-10 text-center">
              <p className="text-zinc-400 text-sm">
                {filter === "all"
                  ? "No submissions yet."
                  : `No ${filter} submissions.`}
              </p>
              {filter === "all" && (
                <p className="text-zinc-600 text-xs mt-1">
                  Submit code from a{" "}
                  <Link href="/collab" className="text-accent hover:underline">
                    collab room
                  </Link>{" "}
                  to get reviewed.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl">
              {filtered.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/review/${sub.id}`}
                  className="flex items-start gap-4 rounded-xl border border-border bg-surface-muted/20 px-4 py-3.5 card-hover"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">
                        {sub.title}
                      </span>
                      <span
                        className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${
                          STATUS_STYLES[sub.status] ?? STATUS_STYLES.pending
                        }`}
                      >
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs font-mono ${LANG_COLORS[sub.language] ?? "text-zinc-400"}`}>
                        {sub.language}
                      </span>
                      <span className="text-xs text-zinc-600">by {sub.author_email}</span>
                      <span className="text-xs text-zinc-600">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                      {sub.room_name && (
                        <span className="text-xs text-zinc-600">· {sub.room_name}</span>
                      )}
                    </div>
                    {sub.feedback && (
                      <p className="text-xs text-zinc-500 mt-1.5 truncate">
                        Feedback: {sub.feedback}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {sub.score != null && (
                      <span className="text-sm font-bold text-accent">{sub.score}pts</span>
                    )}
                    <span className="block text-xs text-zinc-600 mt-0.5">
                      View →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
