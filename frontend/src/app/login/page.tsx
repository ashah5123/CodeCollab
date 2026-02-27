"use client";

import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
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

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center">
        <Link href="/" className="text-2xl font-bold text-white">
          CodeCollab
        </Link>
      </div>
      <form className="space-y-4" onSubmit={handleSignIn}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface-muted/50 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-surface-muted/50 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {message && (
          <p
            className={
              message.type === "error"
                ? "text-sm text-red-400"
                : "text-sm text-green-400"
            }
          >
            {message.text}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-accent py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-surface-muted/50 py-3 text-sm font-medium text-zinc-300 hover:bg-surface-muted disabled:opacity-50"
          >
            Sign up
          </button>
        </div>
      </form>
      <p className="text-center text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-400">
          ← Back home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-zinc-400">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
