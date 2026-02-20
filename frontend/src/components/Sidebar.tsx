"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { listCollabRooms } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const [hasActiveRooms, setHasActiveRooms] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      listCollabRooms(token)
        .then((rooms) => setHasActiveRooms(rooms.length > 0))
        .catch(() => {});
    });
  }, [pathname]);

  const linkClass = (path: string) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      pathname === path
        ? "bg-surface-muted text-white"
        : "text-zinc-400 hover:bg-surface-muted/50 hover:text-white"
    }`;

  return (
    <aside className="flex w-48 flex-col border-r border-border bg-surface-muted/20 p-3">
      <Link href="/dashboard" className="mb-2 text-lg font-semibold text-white">
        CodeCollab
      </Link>
      <nav className="flex flex-col gap-1">
        <Link href="/dashboard" className={linkClass("/dashboard")}>
          <DashboardIcon className="h-4 w-4" />
          Dashboard
        </Link>
        <Link href="/collab" className={linkClass("/collab")}>
          <ZapIcon className="h-4 w-4" />
          Collab
          {hasActiveRooms && (
            <span className="relative ml-1 h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-green-500 opacity-75 animate-pulse" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          )}
        </Link>
      </nav>
    </aside>
  );
}

function DashboardIcon({ className }: { className?: string }) {
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
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
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
