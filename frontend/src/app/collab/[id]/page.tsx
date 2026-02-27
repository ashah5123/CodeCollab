import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CollabRoomDetail } from "@/lib/api";
import { CollabEditorClient } from "./CollabEditorClient";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function serverFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}

export default async function CollabRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/collab/${id}`);
  }

  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    redirect("/login");
  }

  let room: CollabRoomDetail;
  try {
    room = await serverFetch<CollabRoomDetail>(token, `/collab/rooms/${id}`);
  } catch {
    redirect("/collab");
  }

  if (!room!.is_member) {
    try {
      room = await serverFetch<CollabRoomDetail>(token, `/collab/rooms/${id}/join`, {
        method: "POST",
      });
    } catch {
      redirect("/collab");
    }
  }

  return (
    <CollabEditorClient
      roomId={room!.id}
      roomName={room!.name}
      roomLanguage={room!.language}
      initialCode={room!.code}
      userEmail={user.email ?? ""}
      userId={user.id}
      roomCreatedBy={room!.created_by}
    />
  );
}
