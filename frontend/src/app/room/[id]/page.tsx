import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRoom } from "@/lib/api";
import { RoomClient } from "./RoomClient";

export default async function RoomPage({
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
    redirect(`/login?redirect=/room/${id}`);
  }

  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    redirect("/login");
  }

  let room;
  try {
    room = await getRoom(token, id);
  } catch {
    redirect("/dashboard");
  }

  return (
    <RoomClient
      roomId={room.id}
      roomName={room.name}
      inviteSlug={room.invite_slug}
      documentId={room.document_id!}
      initialContent={room.document_content}
      initialLanguage={room.document_language}
      user={user}
    />
  );
}
