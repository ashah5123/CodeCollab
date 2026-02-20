import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listRooms } from "@/lib/api";
import { CreateRoomButton } from "./CreateRoomButton";
import { SignOutButton } from "./SignOutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    redirect("/login");
  }

  let rooms: { id: string; name: string; invite_slug: string; updated_at: string }[] = [];
  try {
    rooms = await listRooms(token);
  } catch {
    // API may be down or misconfigured
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface-muted/30">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-lg font-semibold text-white">
            CodeCollab
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">{user.email}</span>
            <CreateRoomButton />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h2 className="text-xl font-semibold text-white mb-4">Your rooms</h2>
        {rooms.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-muted/30 p-8 text-center text-zinc-400">
            No rooms yet. Create one to start collaborating.
          </div>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/room/${room.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/30 px-4 py-3 text-white hover:bg-surface-muted transition"
                >
                  <span>{room.name}</span>
                  <span className="text-xs text-zinc-500">
                    /{room.invite_slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8 rounded-xl border border-border bg-surface-muted/20 p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Join with a link</h3>
          <p className="text-sm text-zinc-500">
            Open a share link from a teammate (e.g.{" "}
            <code className="rounded bg-surface-muted px-1 text-accent">
              /join/abc123...
            </code>
            ) to join their room.
          </p>
        </div>
      </main>
    </div>
  );
}
