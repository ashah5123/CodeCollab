"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence, type Variants } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItemDef = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

// ─── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_BG = [
  "bg-violet-500", "bg-cyan-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-blue-500", "bg-amber-500",
];

function avatarBg(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

// ─── Tooltip (only rendered when sidebar is collapsed) ─────────────────────────

function Tooltip({ label, children, show }: { label: string; children: React.ReactNode; show: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <div className="relative group/tip flex">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[60]
        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-800 border border-zinc-700
          px-2.5 py-1.5 text-xs font-medium text-white shadow-xl">
          {label}
          {/* left arrow */}
          <span className="absolute right-full top-1/2 -translate-y-1/2
            border-4 border-transparent border-r-zinc-700" />
        </div>
      </div>
    </div>
  );
}

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: NavItemDef & { active: boolean; collapsed: boolean }) {
  return (
    <Tooltip label={label} show={collapsed}>
      <Link
        href={href}
        className={`relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 w-full transition-colors
          ${active ? "text-accent" : "text-zinc-500 hover:text-white hover:bg-surface-muted/40"}`}
      >
        {/* Animated active pill */}
        {active && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-xl bg-accent/12 border border-accent/20"
            transition={{ type: "spring", bounce: 0.12, duration: 0.4 }}
          />
        )}

        {/* Icon */}
        <span className="relative z-10 flex h-5 w-5 items-center justify-center shrink-0">
          {icon}
        </span>

        {/* Label — fades with sidebar width */}
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: 0.15, delay: collapsed ? 0 : 0.12 }}
          className="relative z-10 text-sm font-medium whitespace-nowrap overflow-hidden leading-none"
          aria-hidden={collapsed}
        >
          {label}
        </motion.span>
      </Link>
    </Tooltip>
  );
}

// ─── Theme toggle row ─────────────────────────────────────────────────────────

function ThemeToggleRow({
  isLight,
  onToggle,
  collapsed,
}: {
  isLight: boolean;
  onToggle: () => void;
  collapsed: boolean;
}) {
  return (
    <Tooltip label={isLight ? "Dark mode" : "Light mode"} show={collapsed}>
      <button
        onClick={onToggle}
        className="relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 w-full
          text-zinc-500 hover:text-white hover:bg-surface-muted/40 transition-colors group"
      >
        <span className="flex h-5 w-5 items-center justify-center shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {isLight ? (
              <motion.span
                key="moon"
                initial={{ rotate: -30, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 30, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <MoonIcon className="h-5 w-5" />
              </motion.span>
            ) : (
              <motion.span
                key="sun"
                initial={{ rotate: 30, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -30, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <SunIcon className="h-5 w-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <motion.span
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: 0.15, delay: collapsed ? 0 : 0.12 }}
          className="text-sm font-medium whitespace-nowrap overflow-hidden leading-none"
          aria-hidden={collapsed}
        >
          {isLight ? "Dark mode" : "Light mode"}
        </motion.span>
      </button>
    </Tooltip>
  );
}

// ─── Dropdown variants ────────────────────────────────────────────────────────

const dropdownVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.94, x: -6 },
  visible: { opacity: 1, scale: 1,    x: 0,
    transition: { duration: 0.18, ease: "easeOut" as const } },
  exit:    { opacity: 0, scale: 0.94, x: -6,
    transition: { duration: 0.13 } },
};

// ─── User avatar + dropdown (bottom of sidebar) ────────────────────────────────

function UserAvatar({
  email,
  userId,
  collapsed,
  isLight,
  onToggleTheme,
  onSignOut,
}: {
  email: string;
  userId: string | null;
  collapsed: boolean;
  isLight: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = email[0]?.toUpperCase() ?? "?";
  const bg = avatarBg(email);
  const displayName = email.split("@")[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Tooltip label={displayName} show={collapsed && !open}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`relative flex items-center gap-3 rounded-xl px-2.5 py-2 w-full transition-colors
            ${open ? "bg-surface-muted/50" : "hover:bg-surface-muted/40"}`}
        >
          {/* Avatar circle */}
          <span className={`${bg} flex h-7 w-7 shrink-0 items-center justify-center
            rounded-full text-[11px] font-bold text-white select-none ring-2 ring-offset-1 ring-offset-surface-muted ring-transparent
            ${open ? "ring-accent/40" : "group-hover:ring-accent/20"} transition-all`}>
            {initial}
          </span>

          {/* Name + chevron */}
          <motion.div
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={{ duration: 0.15, delay: collapsed ? 0 : 0.12 }}
            className="flex flex-1 items-center justify-between overflow-hidden"
            aria-hidden={collapsed}
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs font-semibold text-white truncate max-w-[120px]">{displayName}</span>
              <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{email}</span>
            </div>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-zinc-600 shrink-0"
            >
              <ChevronUpIcon className="h-3.5 w-3.5" />
            </motion.span>
          </motion.div>
        </button>
      </Tooltip>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-full bottom-0 ml-2.5 w-56 rounded-2xl border border-white/10
              bg-zinc-900/95 backdrop-blur-xl shadow-2xl z-[60] overflow-hidden"
          >
            {/* Identity header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
              <span className={`${bg} flex h-9 w-9 shrink-0 items-center justify-center
                rounded-full text-sm font-bold text-white select-none`}>
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-zinc-500 truncate">{email}</p>
              </div>
            </div>

            {/* Theme toggle inside dropdown */}
            <div className="py-1.5 px-1.5 border-b border-white/8">
              <button
                onClick={() => { onToggleTheme(); }}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm
                  text-zinc-300 hover:text-white hover:bg-white/6 transition-colors"
              >
                <span className="flex h-4 w-4 items-center justify-center text-zinc-500">
                  {isLight ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
                </span>
                {isLight ? "Switch to Dark" : "Switch to Light"}
              </button>
            </div>

            {/* Nav items */}
            <div className="py-1.5 px-1.5">
              {userId && (
                <Link
                  href={`/profile/${userId}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                    text-zinc-300 hover:text-white hover:bg-white/6 transition-colors"
                >
                  <UserCircleIcon className="h-4 w-4 text-zinc-500 shrink-0" />
                  View Profile
                </Link>
              )}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                  text-zinc-300 hover:text-white hover:bg-white/6 transition-colors"
              >
                <SettingsIcon className="h-4 w-4 text-zinc-500 shrink-0" />
                Settings
              </Link>
            </div>

            {/* Sign out */}
            <div className="border-t border-white/8 py-1.5 px-1.5">
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                  text-red-400 hover:text-red-300 hover:bg-red-500/8 transition-colors"
              >
                <LogoutIcon className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const [collapsed, setCollapsed] = useState(true);
  const [isLight,   setIsLight]   = useState(false);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [email,     setEmail]     = useState("");

  // Restore collapse + theme from localStorage
  useEffect(() => {
    const c = localStorage.getItem("sidebar-collapsed");
    if (c === "false") setCollapsed(false);

    const t = localStorage.getItem("theme");
    if (t === "light") {
      document.documentElement.classList.add("light");
      setIsLight(true);
    }
  }, []);

  // Load user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setEmail(data.user.email ?? "");
      }
    });
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleTheme() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const NAV_ITEMS: NavItemDef[] = [
    { href: "/dashboard",  label: "Dashboard",    icon: <GridIcon className="h-5 w-5" /> },
    { href: "/collab",     label: "Collab Rooms", icon: <ZapIcon className="h-5 w-5" /> },
    { href: "/chat",       label: "Global Chat",  icon: <ChatBubbleIcon className="h-5 w-5" /> },
    { href: "/messages",   label: "Messages",     icon: <InboxIcon className="h-5 w-5" /> },
    { href: "/leaderboard",label: "Leaderboard",  icon: <TrophyIcon className="h-5 w-5" /> },
    { href: "/review",     label: "Review",       icon: <ClipboardCheckIcon className="h-5 w-5" /> },
    { href: "/org",        label: "Organisation", icon: <BuildingIcon className="h-5 w-5" /> },
  ];

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ type: "spring", bounce: 0, duration: 0.32 }}
      className="shrink-0 flex flex-col border-r border-border bg-surface-muted/20 overflow-hidden"
    >
      <div className="flex flex-col flex-1 py-3 px-2 gap-0.5">

        {/* ── Logo + collapse toggle ── */}
        <div className="flex items-center justify-between mb-2 h-10 px-0.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 flex items-center justify-center rounded-xl bg-accent shrink-0 shadow-md shadow-accent/20">
              <BracesIcon className="h-4 w-4 text-white" />
            </div>
            <motion.span
              animate={{ opacity: collapsed ? 0 : 1 }}
              transition={{ duration: 0.15, delay: collapsed ? 0 : 0.12 }}
              className="text-sm font-bold text-white whitespace-nowrap overflow-hidden"
              aria-hidden={collapsed}
            >
              CodeCollab
            </motion.span>
          </Link>

          <motion.button
            onClick={toggleCollapse}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="h-6 w-6 flex items-center justify-center rounded-md
              text-zinc-600 hover:text-white hover:bg-surface-muted/60 transition-colors shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <motion.span
              animate={{ rotate: collapsed ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </motion.span>
          </motion.button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-1 mb-1" />

        {/* ── Main nav ── */}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        {/* Spacer */}
        <div className="flex-1" />
        <div className="h-px bg-border mx-1 mb-1" />

        {/* ── Theme toggle ── */}
        <ThemeToggleRow isLight={isLight} onToggle={toggleTheme} collapsed={collapsed} />

        {/* ── User avatar + dropdown ── */}
        {email && (
          <UserAvatar
            email={email}
            userId={userId}
            collapsed={collapsed}
            isLight={isLight}
            onToggleTheme={toggleTheme}
            onSignOut={handleSignOut}
          />
        )}
      </div>
    </motion.aside>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BracesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
        d="M8 3H6a2 2 0 00-2 2v5a2 2 0 01-2 2 2 2 0 012 2v5a2 2 0 002 2h2M16 3h2a2 2 0 012 2v5a2 2 0 002 2 2 2 0 01-2 2v5a2 2 0 01-2 2h-2" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 8h10M7 12h6m-9 8l3.5-3.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h1L4 20z" />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 21h8m-4-4v4m-7-4h14V5H3v8zm14-8V3H7v2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 13c0 2 2 4 4 4s4-2 4-4M17 13c0 2-2 4-4 4" />
    </svg>
  );
}

function ClipboardCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2}
        d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  );
}
