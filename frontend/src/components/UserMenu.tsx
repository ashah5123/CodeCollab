"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence, type Variants } from "framer-motion";

// ─── Avatar color ─────────────────────────────────────────────────────────────

const AVATAR_BG = [
  "bg-violet-500", "bg-cyan-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-blue-500", "bg-amber-500",
];

function avatarBg(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

// ─── Dropdown animation ───────────────────────────────────────────────────────

const dropdownVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1,    y: 0,
    transition: { duration: 0.18, ease: "easeOut" as const } },
  exit:    { opacity: 0, scale: 0.95, y: -4,
    transition: { duration: 0.13 } },
};

// ─── Separator ────────────────────────────────────────────────────────────────

function Sep() {
  return <div className="h-px bg-white/8 mx-1" />;
}

// ─── Menu item ────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  children,
  onClick,
  danger,
  as: Tag = "button",
  href,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  as?: "button" | "a";
  href?: string;
}) {
  const base = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    danger
      ? "text-red-400 hover:text-red-300 hover:bg-red-500/8"
      : "text-zinc-300 hover:text-white hover:bg-white/6"
  }`;

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={base}>
        <span className={`shrink-0 ${danger ? "text-red-400" : "text-zinc-500"}`}>{icon}</span>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={base}>
      <span className={`shrink-0 ${danger ? "text-red-400" : "text-zinc-500"}`}>{icon}</span>
      {children}
    </button>
  );
}

// ─── UserMenu ─────────────────────────────────────────────────────────────────

type UserMenuProps = {
  user?: { id: string; email: string };
};

export function UserMenu({ user: userProp }: UserMenuProps = {}) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null>(userProp ?? null);
  const [open, setOpen]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userProp) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, [userProp]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!user) return null;

  const bg          = avatarBg(user.email);
  const initial     = user.email[0]?.toUpperCase() ?? "?";
  const displayName = user.email.split("@")[0];

  return (
    <div className="relative shrink-0" ref={menuRef}>
      {/* ── Trigger ── */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors ${
          open ? "bg-white/8" : "hover:bg-white/5"
        }`}
      >
        {/* Avatar */}
        <span className={`${bg} flex h-8 w-8 shrink-0 items-center justify-center
          rounded-full text-sm font-bold text-white select-none
          ring-2 ring-offset-1 ring-offset-[hsl(var(--surface))]
          ${open ? "ring-accent/50" : "ring-transparent"} transition-all duration-200`}>
          {initial}
        </span>

        {/* Name + chevron */}
        <div className="hidden sm:flex flex-col items-start min-w-0">
          <span className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">
            {displayName}
          </span>
          <span className="text-[10px] text-zinc-500 leading-tight truncate max-w-[140px]">
            {user.email}
          </span>
        </div>

        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22 }}
          className="hidden sm:flex text-zinc-600"
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </motion.span>
      </motion.button>

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-white/10
              bg-zinc-900/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden origin-top-right"
          >
            {/* Identity header */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className={`${bg} flex h-10 w-10 shrink-0 items-center justify-center
                rounded-full text-base font-bold text-white select-none`}>
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>

            <Sep />

            {/* Nav links */}
            <div className="py-1.5 px-1.5">
              <MenuItem
                href={`/profile/${user.id}`}
                icon={<UserCircleIcon className="h-4 w-4" />}
                onClick={() => setOpen(false)}
              >
                View Profile
              </MenuItem>
              <MenuItem
                href="/settings"
                icon={<SettingsIcon className="h-4 w-4" />}
                onClick={() => setOpen(false)}
              >
                Settings
              </MenuItem>
            </div>

            <Sep />

            {/* Sign out */}
            <div className="py-1.5 px-1.5">
              <MenuItem
                icon={<LogoutIcon className="h-4 w-4" />}
                onClick={handleSignOut}
                danger
              >
                Sign Out
              </MenuItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function UserCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
