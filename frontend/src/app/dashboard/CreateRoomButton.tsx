"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createRoom } from "@/lib/api";

export function CreateRoomButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleCreate() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }
      const room = await createRoom(token, "Untitled Room");
      router.push(`/room/${room.id}`);
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {loading ? "Creating…" : "New room"}
    </button>
  );
}
