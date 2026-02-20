const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ─── Core helper ──────────────────────────────────────────────────────────────

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

// ─── Rooms ────────────────────────────────────────────────────────────────────

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

// ─── Collab Rooms ─────────────────────────────────────────────────────────────

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

export async function listCollabRooms(token: string): Promise<CollabRoomResponse[]> {
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

export async function deleteCollabRoom(token: string, roomId: string): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}`, token, { method: "DELETE" });
}

export async function joinCollabRoom(
  token: string,
  roomId: string
): Promise<CollabRoomDetail> {
  return fetchWithAuth(`/collab/rooms/${roomId}/join`, token, { method: "POST" });
}

export async function leaveCollabRoom(token: string, roomId: string): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}/leave`, token, { method: "POST" });
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

// ─── Submissions & Review ─────────────────────────────────────────────────────

export type Submission = {
  id: string;
  title: string;
  language: string;
  code: string;
  status: "pending" | "reviewed" | "approved" | "rejected";
  author_id: string;
  author_email: string;
  created_at: string;
  room_name?: string;
  room_id?: string;
  score?: number;
  feedback?: string;
};

export type ReviewComment = {
  id: string;
  submission_id: string;
  author_id: string;
  author_email: string;
  body: string;
  line_number?: number;
  created_at: string;
};

export async function listSubmissions(token: string): Promise<Submission[]> {
  return fetchWithAuth("/submissions", token);
}

export async function getSubmission(token: string, id: string): Promise<Submission> {
  return fetchWithAuth(`/submissions/${id}`, token);
}

export async function createSubmission(
  token: string,
  payload: { title: string; language: string; code: string; room_id?: string }
): Promise<Submission> {
  return fetchWithAuth("/submissions", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listReviewComments(
  token: string,
  submissionId: string
): Promise<ReviewComment[]> {
  return fetchWithAuth(`/submissions/${submissionId}/comments`, token);
}

export async function addReviewComment(
  token: string,
  submissionId: string,
  body: string,
  lineNumber?: number
): Promise<ReviewComment> {
  return fetchWithAuth(`/submissions/${submissionId}/comments`, token, {
    method: "POST",
    body: JSON.stringify({ body, line_number: lineNumber }),
  });
}

export async function approveSubmission(
  token: string,
  submissionId: string,
  feedback?: string
): Promise<Submission> {
  return fetchWithAuth(`/submissions/${submissionId}/approve`, token, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

export async function rejectSubmission(
  token: string,
  submissionId: string,
  feedback?: string
): Promise<Submission> {
  return fetchWithAuth(`/submissions/${submissionId}/reject`, token, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  email: string;
  display_name?: string;
  score: number;
  submissions_count: number;
  approved_count: number;
};

export async function getLeaderboard(token: string): Promise<LeaderboardEntry[]> {
  return fetchWithAuth("/leaderboard", token);
}

export async function getMyRank(token: string): Promise<LeaderboardEntry | null> {
  return fetchWithAuth("/leaderboard/me", token).catch(() => null);
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export type UserProfile = {
  user_id: string;
  email: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  score: number;
  rank: number | null;
  submissions_count: number;
  approved_count: number;
  created_at: string;
};

export async function getProfile(
  token: string,
  userId?: string
): Promise<UserProfile> {
  return fetchWithAuth(userId ? `/profile/${userId}` : "/profile/me", token);
}

export async function updateProfile(
  token: string,
  payload: { display_name?: string; bio?: string }
): Promise<UserProfile> {
  return fetchWithAuth("/profile/me", token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ─── Organisation ─────────────────────────────────────────────────────────────

export type Organisation = {
  id: string;
  name: string;
  invite_code?: string;
  created_by: string;
  created_at: string;
  role?: string;
};

export type OrgMember = {
  id: string;
  organisation_id: string;
  user_id: string;
  user_email?: string;
  role: string;
};

export type OrgChatMessage = {
  id: string;
  user_email: string;
  user_name: string;
  body: string;
  created_at: string;
};

export async function getMyOrg(token: string): Promise<Organisation | null> {
  return fetchWithAuth("/organisations/me", token).catch(() => null);
}

export async function getOrgMembers(
  token: string,
  orgId: string
): Promise<OrgMember[]> {
  return fetchWithAuth(`/organisations/${orgId}/members`, token).catch(() => []);
}

export async function createOrg(token: string, name: string): Promise<Organisation> {
  return fetchWithAuth("/organisations", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinOrg(
  token: string,
  inviteCode: string
): Promise<Organisation> {
  return fetchWithAuth("/organisations/join", token, {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export async function getOrgChatMessages(
  token: string,
  orgId: string
): Promise<OrgChatMessage[]> {
  return fetchWithAuth(`/organisations/${orgId}/chat`, token).catch(() => []);
}

export async function sendOrgChatMessage(
  token: string,
  orgId: string,
  body: string,
  userName?: string
): Promise<OrgChatMessage> {
  return fetchWithAuth(`/organisations/${orgId}/chat`, token, {
    method: "POST",
    body: JSON.stringify({ body, user_name: userName }),
  });
}
