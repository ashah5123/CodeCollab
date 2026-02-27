"use client";

import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ─── Feature bullets shown in the hero section ───────────────────────────────
const features = [
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    text: "Real-time collaborative editing",
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    text: "Invite teammates instantly",
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    text: "Multi-language syntax highlighting",
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    text: "Inline comments & code review",
  },
];

// ─── Input component with animated focus ring ─────────────────────────────────
function AnimatedInput({
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      className="relative"
      animate={focused ? { scale: 1.01 } : { scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full rounded-xl border bg-white/5 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none transition-all duration-200"
        style={{
          borderColor: focused ? "hsl(var(--accent))" : "hsl(var(--border))",
          boxShadow: focused ? "0 0 0 2px hsl(var(--accent) / 0.2)" : "none",
        }}
      />
    </motion.div>
  );
}

// ─── Auth form (sign in + sign up tabs) ──────────────────────────────────────
function LoginForm() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setMessage({ type: "ok", text: "Check your email to confirm your account." });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  const isSignUp = tab === "signup";

  return (
    <div className="relative min-h-screen flex overflow-hidden">
      {/* ── Animated gradient background ── */}
      <div className="absolute inset-0 bg-[hsl(220_18%_8%)]" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Orb 1 — cyan/blue */}
        <div
          className="orb-1 absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(199 89% 48%) 0%, transparent 70%)" }}
        />
        {/* Orb 2 — purple */}
        <div
          className="orb-2 absolute top-1/2 -right-48 w-[480px] h-[480px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }}
        />
        {/* Orb 3 — indigo */}
        <div
          className="orb-3 absolute -bottom-40 left-1/3 w-[420px] h-[420px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Hero section (desktop left) ── */}
      <motion.div
        className="hidden lg:flex flex-col justify-between w-1/2 p-16 relative z-10"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[hsl(var(--accent))] shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">CodeCollab</span>
        </Link>

        {/* Hero copy */}
        <div className="space-y-10">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 text-xs font-medium text-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.12)] border border-[hsl(var(--accent)/0.25)] rounded-full px-3 py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-pulse" />
              Live collaborative editing
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.55 }}
              className="text-5xl xl:text-6xl font-bold text-white leading-tight tracking-tight"
            >
              Code together,{" "}
              <span
                className="animated-gradient bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, hsl(199 89% 58%), #a78bfa, hsl(199 89% 48%))",
                }}
              >
                ship faster.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-lg text-zinc-400 leading-relaxed max-w-sm"
            >
              Google Docs for your code. Real-time rooms, live cursors, inline review — everything your team needs to build together.
            </motion.p>
          </div>

          {/* Feature list */}
          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } },
              hidden: {},
            }}
            className="space-y-3"
          >
            {features.map((f) => (
              <motion.li
                key={f.text}
                variants={{
                  hidden: { opacity: 0, x: -12 },
                  visible: { opacity: 1, x: 0 },
                }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-3 text-zinc-300 text-sm"
              >
                <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]">
                  {f.icon}
                </span>
                {f.text}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {/* Bottom quote */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="text-zinc-600 text-xs"
        >
          © {new Date().getFullYear()} CodeCollab. All rights reserved.
        </motion.p>
      </motion.div>

      {/* ── Auth card (right / center on mobile) ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
        >
          {/* Mobile logo */}
          <Link href="/" className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[hsl(var(--accent))] shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">CodeCollab</span>
          </Link>

          {/* Glass card */}
          <div
            className="rounded-2xl p-8 border border-white/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)" }}
          >
            {/* Card header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-1">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-zinc-400 text-sm">
                {isSignUp
                  ? "Start collaborating with your team today."
                  : "Sign in to your CodeCollab workspace."}
              </p>
            </div>

            {/* Tab toggle */}
            <div className="relative flex rounded-xl bg-white/5 p-1 mb-6">
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setMessage(null); }}
                  className="relative flex-1 text-sm font-medium py-2 rounded-lg transition-colors duration-200 z-10"
                  style={{
                    color: tab === t ? "white" : "hsl(215 16% 65%)",
                  }}
                >
                  {t === "signin" ? "Sign in" : "Sign up"}
                  {tab === t && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 rounded-lg bg-[hsl(var(--accent)/0.85)]"
                      style={{ zIndex: -1 }}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Form */}
            <form
              onSubmit={isSignUp ? handleSignUp : handleSignIn}
              className="space-y-4"
            >
              <AnimatedInput
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <AnimatedInput
                type="password"
                placeholder={isSignUp ? "Create a password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {/* Message */}
              <AnimatePresence mode="wait">
                {message && (
                  <motion.p
                    key={message.text}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className={`text-sm ${
                      message.type === "error" ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {message.type === "error" ? "⚠ " : "✓ "}{message.text}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50 overflow-hidden transition-opacity duration-150"
                style={{
                  background: "linear-gradient(135deg, hsl(199 89% 42%) 0%, hsl(199 89% 52%) 100%)",
                  boxShadow: "0 4px 24px hsl(199 89% 48% / 0.35)",
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {isSignUp ? "Creating account…" : "Signing in…"}
                  </span>
                ) : (
                  isSignUp ? "Create account" : "Sign in"
                )}
              </motion.button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-zinc-500">
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <button
                type="button"
                onClick={() => { setTab(isSignUp ? "signin" : "signup"); setMessage(null); }}
                className="text-[hsl(var(--accent))] hover:underline font-medium"
              >
                {isSignUp ? "Sign in" : "Sign up for free"}
              </button>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-600">
            <Link href="/" className="hover:text-zinc-400 transition-colors">
              ← Back to home
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[hsl(220_18%_8%)]">
        <div className="w-5 h-5 rounded-full border-2 border-[hsl(var(--accent))] border-t-transparent animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
