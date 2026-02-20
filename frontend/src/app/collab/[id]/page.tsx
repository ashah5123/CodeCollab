import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollabRoom, joinCollabRoom } from "@/lib/api";
import { CollabEditorClient } from "./CollabEditorClient";

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

  let room;
  try {
    room = await getCollabRoom(token, id);
  } catch {
    redirect("/collab");
  }

  if (!room.is_member) {
    try {
      room = await joinCollabRoom(token, id);
    } catch {
      redirect("/collab");
    }
  }

  return (
    <CollabEditorClient
      roomId={room.id}
      roomName={room.name}
      roomLanguage={room.language}
      initialCode={room.code}
      userEmail={user.email ?? ""}
      userId={user.id}
    />
  );
}
