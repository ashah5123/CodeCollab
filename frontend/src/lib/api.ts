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

// Collab rooms (real-time collaborative coding)
export type CollabRoomCreatePayload = {
  name: string;
  description?: string;
  language?: string;
};

export type CollabRoomResponse = {
  id: string;
  name: string;
  description: string;
  language: string;
  code: string;
  created_by: string;
  creator_email: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
};

export type CollabRoomDetail = {
  id: string;
  name: string;
  description: string;
  language: string;
  code: string;
  created_by: string;
  creator_email: string | null;
  is_active: boolean;
  created_at: string;
  is_member: boolean;
};

export async function listCollabRooms(
  token: string
): Promise<CollabRoomResponse[]> {
  return fetchWithAuth("/collab/rooms", token);
}

export async function createCollabRoom(
  token: string,
  payload: CollabRoomCreatePayload
): Promise<CollabRoomResponse> {
  return fetchWithAuth("/collab/rooms", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCollabRoom(
  token: string,
  roomId: string
): Promise<CollabRoomDetail> {
  return fetchWithAuth(`/collab/rooms/${roomId}`, token);
}

export async function deleteCollabRoom(
  token: string,
  roomId: string
): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}`, token, {
    method: "DELETE",
  });
}

export async function joinCollabRoom(
  token: string,
  roomId: string
): Promise<CollabRoomDetail> {
  return fetchWithAuth(`/collab/rooms/${roomId}/join`, token, {
    method: "POST",
  });
}

export async function leaveCollabRoom(
  token: string,
  roomId: string
): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}/leave`, token, {
    method: "POST",
  });
}

export async function saveCollabRoomCode(
  token: string,
  roomId: string,
  code: string
): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}/code`, token, {
    method: "PATCH",
    body: JSON.stringify({ code }),
  });
}
