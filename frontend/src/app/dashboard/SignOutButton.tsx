"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-surface-muted"
    >
      Sign out
    </button>
  );
}
