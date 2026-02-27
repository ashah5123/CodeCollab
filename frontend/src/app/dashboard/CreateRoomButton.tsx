"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/api";

export function CreateRoomButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleCreate() {
    setLoading(true);
    try {
      const room = await createRoom("Untitled Room");
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
