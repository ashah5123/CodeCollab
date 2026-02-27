import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ─── Core helper ──────────────────────────────────────────────────────────────

async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const token = session.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

export async function createRoom(name: string = "Untitled Room"): Promise<RoomWithDocument> {
  return fetchWithAuth("/rooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listRooms(): Promise<RoomResponse[]> {
  return fetchWithAuth("/rooms");
}

export async function getRoom(roomId: string): Promise<RoomWithDocument> {
  return fetchWithAuth(`/rooms/${roomId}`);
}

export async function joinRoom(inviteSlug: string): Promise<RoomWithDocument> {
  return fetchWithAuth("/rooms/join", {
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

export async function listCollabRooms(): Promise<CollabRoomResponse[]> {
  return fetchWithAuth("/collab/rooms");
}

export async function createCollabRoom(payload: CollabRoomCreatePayload): Promise<CollabRoomResponse> {
  return fetchWithAuth("/collab/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCollabRoom(roomId: string): Promise<CollabRoomDetail> {
  return fetchWithAuth(`/collab/rooms/${roomId}`);
}

export async function deleteCollabRoom(roomId: string): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}`, { method: "DELETE" });
}

export async function joinCollabRoom(roomId: string): Promise<CollabRoomDetail> {
  return fetchWithAuth(`/collab/rooms/${roomId}/join`, { method: "POST" });
}

export async function leaveCollabRoom(roomId: string): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}/leave`, { method: "POST" });
}

export async function saveCollabRoomCode(roomId: string, code: string): Promise<void> {
  await fetchWithAuth(`/collab/rooms/${roomId}/code`, {
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
  status: "open" | "in_review" | "resolved" | "pending" | "reviewed" | "approved" | "rejected";
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

export async function listSubmissions(): Promise<Submission[]> {
  return fetchWithAuth("/api/v1/submissions");
}

export async function getSubmission(id: string): Promise<Submission> {
  return fetchWithAuth(`/api/v1/submissions/${id}`);
}

export async function createSubmission(
  payload: { title: string; language: string; code: string; description?: string; room_id?: string }
): Promise<Submission> {
  return fetchWithAuth("/api/v1/submissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listReviewComments(submissionId: string): Promise<ReviewComment[]> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/comments`);
}

export async function addReviewComment(
  submissionId: string,
  body: string,
  lineNumber?: number
): Promise<ReviewComment> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, line_number: lineNumber }),
  });
}

export async function editComment(
  submissionId: string,
  commentId: string,
  body: string
): Promise<ReviewComment> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/comments/${commentId}`, {
    method: "PUT",
    body: JSON.stringify({ body }),
  });
}

export async function deleteComment(submissionId: string, commentId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/submissions/${submissionId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/submissions/${submissionId}`, { method: "DELETE" });
}

export async function approveSubmission(submissionId: string, feedback?: string): Promise<Submission> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

export async function rejectSubmission(submissionId: string, feedback?: string): Promise<Submission> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type LeaderboardRow = {
  user_id: string;
  user_email: string;
  count: number;
};

export type LeaderboardResponse = {
  by_submissions: LeaderboardRow[];
  by_comments: LeaderboardRow[];
  by_reactions_received: LeaderboardRow[];
};

export async function getLeaderboard(): Promise<LeaderboardResponse> {
  return fetchWithAuth("/api/v1/leaderboard");
}

/** @deprecated Used by dashboard only; leaderboard is now per-category. */
export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  email: string;
  score: number;
  submissions_count: number;
  approved_count: number;
};

export async function getMyRank(): Promise<LeaderboardEntry | null> {
  return fetchWithAuth("/api/v1/leaderboard/me").catch(() => null);
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

export async function getProfile(userId?: string): Promise<UserProfile> {
  return fetchWithAuth(userId ? `/profile/${userId}` : "/profile/me");
}

export async function updateProfile(payload: { display_name?: string; bio?: string }): Promise<UserProfile> {
  return fetchWithAuth("/profile/me", {
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

export async function getMyOrg(): Promise<Organisation | null> {
  const data = await fetchWithAuth("/organisations/me").catch(() => null);
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  return fetchWithAuth(`/organisations/${orgId}/members`).catch(() => []);
}

export async function createOrg(name: string): Promise<Organisation> {
  return fetchWithAuth("/organisations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinOrg(inviteCode: string): Promise<Organisation> {
  return fetchWithAuth("/organisations/join", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export async function leaveOrg(orgId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}/organisations/${orgId}/leave`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
}

export async function getOrgChatMessages(orgId: string): Promise<OrgChatMessage[]> {
  return fetchWithAuth(`/organisations/${orgId}/chat`).catch(() => []);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type Notification = {
  id: string;
  user_id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

export async function listNotifications(): Promise<Notification[]> {
  return fetchWithAuth("/api/v1/notifications");
}

export async function markNotificationsRead(): Promise<void> {
  await fetchWithAuth("/api/v1/notifications/read", { method: "PATCH" });
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export type Attachment = {
  id: string;
  submission_id: string;
  filename: string;
  url: string;
  size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
};

export async function listAttachments(submissionId: string): Promise<Attachment[]> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/attachments`);
}

/** Upload a file as multipart form-data — does NOT use fetchWithAuth (no JSON header). */
export async function uploadAttachment(submissionId: string, file: File): Promise<Attachment> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/v1/submissions/${submissionId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  return res.json();
}

export async function deleteAttachment(submissionId: string, attachmentId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/submissions/${submissionId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

// ─── Comment Votes ─────────────────────────────────────────────────────────────

export type VoteTally = {
  upvotes: number;
  downvotes: number;
  net: number;
  user_vote: number; // 1, -1, or 0
};

export async function getSubmissionCommentVotes(
  submissionId: string
): Promise<Record<string, VoteTally>> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/comment_votes`);
}

export async function voteComment(commentId: string, vote: 1 | -1 | 0): Promise<void> {
  await fetchWithAuth(`/api/v1/comments/${commentId}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export async function removeCommentVote(commentId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/comments/${commentId}/vote`, { method: "DELETE" });
}

// ─── Submission Status ─────────────────────────────────────────────────────────

export async function changeSubmissionStatus(
  submissionId: string,
  newStatus: "open" | "in_review" | "resolved"
): Promise<Submission> {
  return fetchWithAuth(`/api/v1/submissions/${submissionId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: newStatus }),
  });
}

export async function sendOrgChatMessage(
  orgId: string,
  body: string,
  userName?: string
): Promise<OrgChatMessage> {
  return fetchWithAuth(`/organisations/${orgId}/chat`, {
    method: "POST",
    body: JSON.stringify({ body, user_name: userName }),
  });
}
