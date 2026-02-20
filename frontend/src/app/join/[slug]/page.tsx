import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinRoom } from "@/lib/api";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/join/${slug}`);
  }

  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    redirect("/login");
  }

  try {
    const room = await joinRoom(token, slug);
    redirect(`/room/${room.id}`);
  } catch (e) {
    redirect("/dashboard?error=room_not_found");
  }
}
