const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type RoomWithDocument = {
  id: string;
  name: string;
  invite_slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  document_id: string | null;
  document_content: string;
  document_language: string;
};

export type RoomResponse = {
  id: string;
  name: string;
  invite_slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

async function fetchWithAuth(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  return res.json();
}

export async function createRoom(
  token: string,
  name: string = "Untitled Room"
): Promise<RoomWithDocument> {
  return fetchWithAuth("/rooms", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listRooms(token: string): Promise<RoomResponse[]> {
  return fetchWithAuth("/rooms", token);
}

export async function getRoom(
  token: string,
  roomId: string
): Promise<RoomWithDocument> {
  return fetchWithAuth(`/rooms/${roomId}`, token);
}

export async function joinRoom(
  token: string,
  inviteSlug: string
): Promise<RoomWithDocument> {
  return fetchWithAuth("/rooms/join", token, {
    method: "POST",
    body: JSON.stringify({ invite_slug: inviteSlug }),
  });
}
