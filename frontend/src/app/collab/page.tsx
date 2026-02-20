"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  listCollabRooms,
  createCollabRoom,
  type CollabRoomResponse,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "json", label: "JSON" },
];

const LANGUAGE_BORDER_COLORS: Record<string, string> = {
  python: "border-l-green-500",
  javascript: "border-l-yellow-500",
  typescript: "border-l-blue-500",
  json: "border-l-amber-600",
};

export default function CollabRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<CollabRoomResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLanguage, setCreateLanguage] = useState("python");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login?redirect=/collab");
    });
  }, [router]);

  const fetchRooms = useCallback(async () => {
    const supabase = createClient();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    try {
      const list = await listCollabRooms(token);
      setRooms(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("collab-rooms-list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "collab_rooms",
        },
        () => {
          fetchRooms();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRooms]);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      const supabase = createClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const room = await createCollabRoom(token, {
        name: createName.trim(),
        description: createDescription.trim(),
        language: createLanguage,
      });
      setModalOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateLanguage("python");
      window.location.href = `/collab/${room.id}`;
    } catch (e) {
      console.error(e);
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b border-border bg-surface-muted/30 shrink-0">
          <div className="flex h-14 items-center justify-end px-4">
            <span className="text-sm text-zinc-400">Collab Rooms</span>
          </div>
        </header>
        <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <ZapIcon className="h-6 w-6 text-amber-400" />
            Collab Rooms
          </h1>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Create Room
          </button>
        </div>

        {loading ? (
          <div className="text-zinc-400">Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-muted/30 p-8 text-center text-zinc-400">
            No collab rooms yet. Create one to start coding together in real time.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`rounded-lg border border-border bg-surface-muted/30 overflow-hidden border-l-4 ${
                  LANGUAGE_BORDER_COLORS[room.language] ?? "border-l-zinc-500"
                }`}
              >
                <div className="p-4">
                  <h3 className="font-medium text-white truncate">{room.name}</h3>
                  {room.description ? (
                    <p className="mt-1 text-sm text-zinc-400 line-clamp-2">
                      {room.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-zinc-300">
                      {LANGUAGES.find((l) => l.value === room.language)?.label ??
                        room.language}
                    </span>
                    {room.creator_email ? (
                      <span className="text-xs text-zinc-500 truncate max-w-[140px]">
                        {room.creator_email}
                      </span>
                    ) : null}
                    <span className="text-xs text-zinc-500">
                      {room.member_count} member
                      {room.member_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Link
                    href={`/collab/${room.id}`}
                    className="mt-3 block w-full rounded-lg border border-border bg-surface-muted/50 py-2 text-center text-sm font-medium text-white hover:bg-surface-muted transition"
                  >
                    Join Room
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        </main>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !createLoading && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white mb-4">
              Create Collab Room
            </h2>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Room name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Algorithm practice"
                  className="w-full rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="What will you work on?"
                  className="w-full rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Language
                </label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCreateLanguage(value)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        createLanguage === value
                          ? "bg-accent text-white"
                          : "border border-border bg-surface-muted/50 text-zinc-300 hover:bg-surface-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !createLoading && setModalOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !createName.trim()}
                  className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {createLoading ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}
