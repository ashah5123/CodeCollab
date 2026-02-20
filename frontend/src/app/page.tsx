import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-xl text-center space-y-8">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          CodeCollab
        </h1>
        <p className="text-lg text-zinc-400">
          Google Docs for code. Create rooms, invite others, and edit together in real time.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:opacity-90 transition"
          >
            Sign in to get started
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-muted/50 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-surface-muted transition"
          >
            View dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
