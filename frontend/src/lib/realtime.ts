import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

const CHANNEL_PREFIX = "collab-room:";

export type CursorPosition = {
  line: number;
  ch: number;
} | null;

export type CodeChangePayload = {
  code: string;
  cursorPosition: CursorPosition;
  userEmail: string;
  userColor: string;
};

export type CursorPayload = {
  userEmail: string;
  userColor: string;
  cursorPosition: CursorPosition;
};

export type RoomPresenceState = Record<
  string,
  Array<{ user_email: string; user_color: string }>
>;

export type RoomChatMessage = {
  userEmail: string;
  message: string;
  timestamp: number;
};

function getChannelName(roomId: string): string {
  return `${CHANNEL_PREFIX}${roomId}`;
}

/**
 * Broadcast code change to all members in the room.
 * Debounce should be applied by the caller (e.g. 50ms).
 */
export function broadcastCodeChange(
  roomId: string,
  code: string,
  userEmail: string,
  userColor: string,
  cursorPosition: CursorPosition
): void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.send({
    type: "broadcast",
    event: "code",
    payload: {
      code,
      cursorPosition,
      userEmail,
      userColor,
    } as CodeChangePayload,
  });
}

/**
 * Subscribe to code changes from other users in the room.
 * Call onUpdate when receiving a code update (ignore if userEmail matches local user to avoid echo).
 */
export function subscribeToCodeChanges(
  roomId: string,
  onUpdate: (payload: CodeChangePayload) => void
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.on("broadcast", { event: "code" }, ({ payload }) => {
    onUpdate(payload as CodeChangePayload);
  }).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Broadcast cursor position (e.g. for live cursors).
 */
export function broadcastCursor(
  roomId: string,
  userEmail: string,
  userColor: string,
  cursorPosition: CursorPosition
): void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.send({
    type: "broadcast",
    event: "cursor",
    payload: {
      userEmail,
      userColor,
      cursorPosition,
    } as CursorPayload,
  });
}

/**
 * Subscribe to cursor updates from other users.
 */
export function subscribeToCursors(
  roomId: string,
  onUpdate: (payload: CursorPayload) => void
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
    onUpdate(payload as CursorPayload);
  }).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Join room presence (track this user so others see them in the members list).
 */
export function joinRoomPresence(
  roomId: string,
  userEmail: string,
  userColor: string
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.track({
    user_email: userEmail,
    user_color: userColor,
  });
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to presence sync to get the list of currently connected members.
 * onSync receives the presence state (keyed by presence ref, values are arrays of payloads).
 */
export function subscribeToRoomPresence(
  roomId: string,
  onSync: (state: RoomPresenceState) => void
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    const normalized: RoomPresenceState = {};
    for (const [key, presences] of Object.entries(state)) {
      normalized[key] = (presences as Array<{ user_email?: string; user_color?: string }>).map(
        (p) => ({
          user_email: p.user_email ?? "",
          user_color: p.user_color ?? "",
        })
      );
    }
    onSync(normalized);
  }).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Broadcast a chat message to the room (ephemeral, not stored in DB).
 */
export function broadcastRoomChat(
  roomId: string,
  userEmail: string,
  message: string
): void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.send({
    type: "broadcast",
    event: "chat",
    payload: {
      userEmail,
      message,
      timestamp: Date.now(),
    } as RoomChatMessage,
  });
}

/**
 * Subscribe to room chat messages.
 */
export function subscribeToRoomChat(
  roomId: string,
  onMessage: (msg: RoomChatMessage) => void
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(getChannelName(roomId));
  channel.on("broadcast", { event: "chat" }, ({ payload }) => {
    onMessage(payload as RoomChatMessage);
  }).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export type CollabChannelCallbacks = {
  onCode: (payload: CodeChangePayload) => void;
  onCursor: (payload: CursorPayload) => void;
  onPresenceSync: (state: RoomPresenceState) => void;
  onChat: (msg: RoomChatMessage) => void;
};

export type CollabChannelActions = {
  sendCode: (
    code: string,
    userEmail: string,
    userColor: string,
    cursorPosition: CursorPosition
  ) => void;
  sendCursor: (
    userEmail: string,
    userColor: string,
    cursorPosition: CursorPosition
  ) => void;
  sendChat: (userEmail: string, message: string) => void;
  trackPresence: (userEmail: string, userColor: string) => void;
  unsubscribe: () => void;
};

/**
 * Single channel for a collab room: broadcast (code, cursor, chat) + presence.
 * Use this in the editor so send and receive share the same subscribed channel.
 */
export function setupCollabChannel(
  roomId: string,
  callbacks: CollabChannelCallbacks
): CollabChannelActions {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(getChannelName(roomId));

  channel
    .on("broadcast", { event: "code" }, ({ payload }) => {
      callbacks.onCode(payload as CodeChangePayload);
    })
    .on("broadcast", { event: "cursor" }, ({ payload }) => {
      callbacks.onCursor(payload as CursorPayload);
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      callbacks.onChat(payload as RoomChatMessage);
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const normalized: RoomPresenceState = {};
      for (const [key, presences] of Object.entries(state)) {
        normalized[key] = (
          presences as Array<{ user_email?: string; user_color?: string }>
        ).map((p) => ({
          user_email: p.user_email ?? "",
          user_color: p.user_color ?? "",
        }));
      }
      callbacks.onPresenceSync(normalized);
    })
    .subscribe();

  return {
    sendCode: (code, userEmail, userColor, cursorPosition) => {
      channel.send({
        type: "broadcast",
        event: "code",
        payload: { code, cursorPosition, userEmail, userColor },
      });
    },
    sendCursor: (userEmail, userColor, cursorPosition) => {
      channel.send({
        type: "broadcast",
        event: "cursor",
        payload: { userEmail, userColor, cursorPosition },
      });
    },
    sendChat: (userEmail, message) => {
      channel.send({
        type: "broadcast",
        event: "chat",
        payload: { userEmail, message, timestamp: Date.now() },
      });
    },
    trackPresence: (userEmail, userColor) => {
      channel.track({ user_email: userEmail, user_color: userColor });
    },
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
