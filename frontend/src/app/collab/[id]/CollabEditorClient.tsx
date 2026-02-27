"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CodeMirror from "@uiw/react-codemirror";
import { basicDark } from "@uiw/codemirror-theme-basic";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { deleteCollabRoom } from "@/lib/api";
import {
  setupCollabChannel,
  type CursorPosition,
  type RoomPresenceState,
  type RoomChatMessage,
  type SelectionPayload,
} from "@/lib/realtime";
import { saveCollabRoomCode } from "@/lib/api";

const DEBOUNCE_MS = 50;
const CURSOR_STALE_MS = 10_000;
const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "json", label: "JSON" },
];

const langMap: Record<string, () => ReturnType<typeof javascript>> = {
  javascript: javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  json,
};

const USER_COLORS = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#06b6d4", // cyan
];

function colorFromEmail(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h << 5) - h + email.charCodeAt(i);
  const idx = Math.abs(h) % USER_COLORS.length;
  return USER_COLORS[idx];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function displayNameFromEmail(email: string): string {
  const beforeAt = email.split("@")[0];
  return beforeAt || email;
}

// ─── Remote cursor types ────────────────────────────────────────────────────

type RemoteCursor = {
  userEmail: string;
  userColor: string;
  position: CursorPosition;
};

// ─── CodeMirror cursor decorations (module-level so refs are stable) ────────

// Inject the fade-in keyframes once per page load (browser-only)
let cursorKeyframesInjected = false;

class RemoteCursorWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly label: string,
    private readonly nearTop: boolean
  ) {
    super();
  }

  eq(other: RemoteCursorWidget): boolean {
    return (
      this.color === other.color &&
      this.label === other.label &&
      this.nearTop === other.nearTop
    );
  }

  toDOM(): HTMLElement {
    // Inject @keyframes once so we can reference it in inline animation
    if (!cursorKeyframesInjected && typeof document !== "undefined") {
      const s = document.createElement("style");
      s.textContent =
        "@keyframes cm-cursor-fadein{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}";
      document.head.appendChild(s);
      cursorKeyframesInjected = true;
    }

    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = "position:relative;display:inline-block;overflow:visible;";

    const bar = document.createElement("span");
    bar.style.cssText = [
      "display:inline-block",
      "width:2px",
      "height:1.15em",
      `background:${this.color}`,
      "position:relative",
      "vertical-align:text-bottom",
      "margin-right:-1px",
      "border-radius:1px",
    ].join(";");

    const tag = document.createElement("span");
    tag.textContent = this.label;
    // When near the top of the editor show label below the cursor, otherwise above
    const vPos = this.nearTop ? "top:calc(100% + 3px)" : "bottom:calc(100% + 3px)";
    tag.style.cssText = [
      "position:absolute",
      vPos,
      "left:0",
      `background:${this.color}`,
      "color:#fff",
      "font-size:10px",
      "font-weight:500",
      "font-family:sans-serif",
      "line-height:1.4",
      "padding:2px 6px",
      "border-radius:9999px",
      "white-space:nowrap",
      "pointer-events:none",
      "z-index:100",
      "user-select:none",
      "animation:cm-cursor-fadein 150ms ease forwards",
    ].join(";");

    wrap.appendChild(bar);
    wrap.appendChild(tag);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const setCursorsEffect = StateEffect.define<RemoteCursor[]>();

const cursorsField = StateField.define<RemoteCursor[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCursorsEffect)) return effect.value;
    }
    return value;
  },
});

function buildCursorDecorations(view: EditorView): DecorationSet {
  const cursors = view.state.field(cursorsField);
  const ranges: Range<Decoration>[] = [];
  // Cache the editor rect once per rebuild — coordsAtPos uses client coordinates
  const editorRect = view.scrollDOM.getBoundingClientRect();

  for (const c of cursors) {
    if (!c.position) continue;
    try {
      const lineCount = view.state.doc.lines;
      if (c.position.line < 1 || c.position.line > lineCount) continue;
      const line = view.state.doc.line(c.position.line);
      const pos = Math.min(line.from + c.position.ch, line.to);
      const label = c.userEmail.split("@")[0];
      // If the cursor is within ~28px of the top edge, flip the label below
      const coords = view.coordsAtPos(pos);
      const nearTop = coords !== null && coords.top - editorRect.top < 28;
      ranges.push(
        Decoration.widget({
          widget: new RemoteCursorWidget(c.userColor, label, nearTop),
          side: 1,
        }).range(pos)
      );
    } catch {
      // Skip cursors at positions outside the current document
    }
  }

  return Decoration.set(ranges, true);
}

const cursorPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCursorDecorations(view);
    }
    update(update: ViewUpdate) {
      const cursorChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setCursorsEffect))
      );
      if (cursorChanged || update.docChanged) {
        this.decorations = buildCursorDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ─── Remote selection decorations ───────────────────────────────────────────

type RemoteSelection = {
  userEmail: string;
  userColor: string;
  from: number;
  to: number;
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const setSelectionsEffect = StateEffect.define<RemoteSelection[]>();

const selectionsField = StateField.define<RemoteSelection[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSelectionsEffect)) return effect.value;
    }
    return value;
  },
});

function buildSelectionDecorations(view: EditorView): DecorationSet {
  const selections = view.state.field(selectionsField);
  const ranges: Range<Decoration>[] = [];
  const docLength = view.state.doc.length;

  for (const s of selections) {
    try {
      const from = Math.max(0, Math.min(s.from, docLength));
      const to = Math.max(0, Math.min(s.to, docLength));
      if (from >= to) continue;
      ranges.push(
        Decoration.mark({
          attributes: {
            style: `background-color:${hexToRgba(s.userColor, 0.3)};border-radius:2px;`,
          },
        }).range(from, to)
      );
    } catch {
      // Skip invalid ranges
    }
  }

  return Decoration.set(ranges, true);
}

const selectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildSelectionDecorations(view);
    }
    update(update: ViewUpdate) {
      const selectionChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setSelectionsEffect))
      );
      if (selectionChanged || update.docChanged) {
        this.decorations = buildSelectionDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ─── Component ──────────────────────────────────────────────────────────────

type MemberInfo = { user_email: string; user_color: string };

type CollabEditorClientProps = {
  roomId: string;
  roomName: string;
  roomLanguage: string;
  initialCode: string;
  userEmail: string;
  userId: string;
  roomCreatedBy: string;
};

export function CollabEditorClient({
  roomId,
  roomName,
  roomLanguage,
  initialCode,
  userEmail,
  userId,
  roomCreatedBy,
}: CollabEditorClientProps) {
  const [code, setCode] = useState(initialCode);
  const [language] = useState(roomLanguage);
  const [savedToast, setSavedToast] = useState(false);
  const [deleteRoomConfirmOpen, setDeleteRoomConfirmOpen] = useState(false);
  const [deleteRoomLoading, setDeleteRoomLoading] = useState(false);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [otherCursors, setOtherCursors] = useState<RemoteCursor[]>([]);
  const [otherSelections, setOtherSelections] = useState<RemoteSelection[]>([]);

  const userColor = colorFromEmail(userEmail);
  const isRemoteRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelActionsRef = useRef<ReturnType<typeof setupCollabChannel> | null>(null);
  const lastCursorRef = useRef<CursorPosition>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const cursorTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingEmails = new Set(otherCursors.map((c) => c.userEmail));

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ effects: setCursorsEffect.of(otherCursors) });
  }, [otherCursors]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ effects: setSelectionsEffect.of(otherSelections) });
  }, [otherSelections]);

  const removeUserDecorations = useCallback((email: string) => {
    setOtherCursors((prev) => prev.filter((c) => c.userEmail !== email));
    setOtherSelections((prev) => prev.filter((s) => s.userEmail !== email));
  }, []);

  useEffect(() => {
    const actions = setupCollabChannel(roomId, {
      onCode: (payload) => {
        if (payload.userEmail === userEmail) return;
        isRemoteRef.current = true;
        setCode(payload.code);
      },
      onCursor: (payload) => {
        if (payload.userEmail === userEmail) return;
        // Reset the stale-cursor timeout for this user
        const existing = cursorTimeoutsRef.current.get(payload.userEmail);
        if (existing) clearTimeout(existing);
        const staleTimer = setTimeout(() => {
          cursorTimeoutsRef.current.delete(payload.userEmail);
          removeUserDecorations(payload.userEmail);
        }, CURSOR_STALE_MS);
        cursorTimeoutsRef.current.set(payload.userEmail, staleTimer);

        setOtherCursors((prev) => {
          const next = prev.filter((c) => c.userEmail !== payload.userEmail);
          if (payload.cursorPosition)
            next.push({
              userEmail: payload.userEmail,
              userColor: payload.userColor,
              position: payload.cursorPosition,
            });
          return next;
        });
      },
      onSelection: (payload: SelectionPayload) => {
        if (payload.userEmail === userEmail) return;
        setOtherSelections((prev) => {
          const next = prev.filter((s) => s.userEmail !== payload.userEmail);
          if (
            payload.selectionFrom !== null &&
            payload.selectionTo !== null &&
            payload.selectionFrom < payload.selectionTo
          ) {
            next.push({
              userEmail: payload.userEmail,
              userColor: payload.userColor,
              from: payload.selectionFrom,
              to: payload.selectionTo,
            });
          }
          return next;
        });
      },
      onPresenceSync: (state: RoomPresenceState) => {
        const list: MemberInfo[] = [];
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            if (p.user_email)
              list.push({ user_email: p.user_email, user_color: p.user_color });
          }
        }
        setMembers(list);
      },
      onPresenceLeave: (leaveEmail) => {
        // Cancel pending stale timer — the user is definitively gone
        const existing = cursorTimeoutsRef.current.get(leaveEmail);
        if (existing) {
          clearTimeout(existing);
          cursorTimeoutsRef.current.delete(leaveEmail);
        }
        removeUserDecorations(leaveEmail);
      },
      onChat: (msg) => {
        setChatMessages((prev) => [...prev, msg]);
      },
    });
    channelActionsRef.current = actions;
    actions.trackPresence(userEmail, userColor);
    return () => {
      actions.unsubscribe();
      channelActionsRef.current = null;
      // Clear all per-user stale timers
      for (const timer of cursorTimeoutsRef.current.values()) clearTimeout(timer);
      cursorTimeoutsRef.current.clear();
    };
  }, [roomId, userEmail, userColor, removeUserDecorations]);

  const sendCodeUpdate = useCallback(
    (newCode: string, cursorPosition: CursorPosition) => {
      if (isRemoteRef.current) {
        isRemoteRef.current = false;
        return;
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        channelActionsRef.current?.sendCode(newCode, userEmail, userColor, cursorPosition);
      }, DEBOUNCE_MS);
    },
    [userEmail, userColor]
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      setCode(value);
      sendCodeUpdate(value, lastCursorRef.current);
    },
    [sendCodeUpdate]
  );

  // Debounced cursor broadcast — 50ms to avoid flooding
  const handleCursorChange = useCallback(
    (pos: CursorPosition) => {
      lastCursorRef.current = pos;
      if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
      cursorDebounceRef.current = setTimeout(() => {
        cursorDebounceRef.current = null;
        channelActionsRef.current?.sendCursor(userEmail, userColor, pos);
      }, DEBOUNCE_MS);
    },
    [userEmail, userColor]
  );

  // Debounced selection broadcast — 50ms; null/null clears the remote highlight
  const handleSelectionChange = useCallback(
    (from: number | null, to: number | null) => {
      if (selectionDebounceRef.current) clearTimeout(selectionDebounceRef.current);
      selectionDebounceRef.current = setTimeout(() => {
        selectionDebounceRef.current = null;
        channelActionsRef.current?.sendSelection(userEmail, userColor, from, to);
      }, DEBOUNCE_MS);
    },
    [userEmail, userColor]
  );

  const handleSaveSnapshot = useCallback(async () => {
    await saveCollabRoomCode(roomId, code);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  }, [roomId, code]);

  const handleSubmitToReview = useCallback(async () => {
    await saveCollabRoomCode(roomId, code);
    window.location.href = "/dashboard";
  }, [roomId, code]);

  const handleDeleteRoom = useCallback(async () => {
    setDeleteRoomLoading(true);
    try {
      await deleteCollabRoom(roomId);
      window.location.href = "/collab";
    } catch {
      setDeleteRoomLoading(false);
      setDeleteRoomConfirmOpen(false);
    }
  }, [roomId]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    channelActionsRef.current?.sendChat(userEmail, msg);
    setChatInput("");
  };

  const extensions = [
    EditorView.lineWrapping,
    cursorsField,
    cursorPlugin,
    selectionsField,
    selectionPlugin,
    (langMap[language] || javascript)(),
    EditorView.updateListener.of((vu) => {
      if (vu.selectionSet) {
        const main = vu.state.selection.main;
        const pos: CursorPosition = {
          line: vu.state.doc.lineAt(main.head).number,
          ch: main.head - vu.state.doc.lineAt(main.head).from,
        };
        handleCursorChange(pos);
        // Broadcast selection range; null/null when cursor is collapsed
        handleSelectionChange(
          main.empty ? null : main.from,
          main.empty ? null : main.to
        );
      }
    }),
  ];

  const uniqueMembers = Array.from(
    new Map(members.map((m) => [m.user_email, m])).values()
  );
  // Emails of users who have sent a cursor broadcast recently (stale timer hasn't fired)
  const activeTypers = new Set(otherCursors.map((c) => c.userEmail));

  return (
    <div className="h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-surface-muted/30 px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/collab" className="text-zinc-400 hover:text-white text-sm">
            ← Collab
          </Link>
          <h1 className="font-semibold text-white truncate max-w-[200px]">
            {roomName}
          </h1>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-zinc-300">
            {LANGUAGES.find((l) => l.value === language)?.label ?? language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {savedToast && (
            <span className="text-sm text-green-400">Saved!</span>
          )}
          <button
            type="button"
            onClick={handleSaveSnapshot}
            className="rounded-lg border border-border bg-surface-muted/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface-muted"
          >
            Save Snapshot
          </button>
          <button
            type="button"
            onClick={handleSubmitToReview}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Submit to Review
          </button>
          {userId === roomCreatedBy && (
            <button
              type="button"
              onClick={() => setDeleteRoomConfirmOpen(true)}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
            >
              Delete Room
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-[0.7] flex flex-col min-w-0 border-r border-border">
          <div className="flex-1 min-h-0">
            <CodeMirror
              value={code}
              height="100%"
              theme={basicDark}
              extensions={extensions}
              onChange={handleEditorChange}
              onCreateEditor={(view) => {
                editorViewRef.current = view;
              }}
              editable={true}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
              }}
              className="h-full text-left"
            />
          </div>
        </div>

        <aside className="flex-[0.3] flex flex-col bg-surface-muted/20 min-w-0 w-[30%]">
          <div className="shrink-0 border-b border-border p-3">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">
              Members ({uniqueMembers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {uniqueMembers.map((m) => (
                <div key={m.user_email} className="flex items-center gap-2 text-sm">
                  <span
                    className="relative inline-block h-6 w-6 rounded-full flex-shrink-0"
                    style={{ backgroundColor: m.user_color }}
                  >
                    <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  </span>
                  <span className="text-zinc-300 truncate max-w-[100px]">
                    {m.user_email === userEmail ? "You" : m.user_email}
                  </span>
                  {m.user_email !== userEmail && activeTypers.has(m.user_email) && (
                    <span
                      className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: m.user_color }}
                      title="Typing…"
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {uniqueMembers.length} member{uniqueMembers.length !== 1 ? "s" : ""} coding
            </p>
          </div>

          {otherCursors.length > 0 && (
            <div className="shrink-0 border-b border-border p-3">
              <h3 className="text-xs font-medium text-zinc-500 mb-1">
                Cursors
              </h3>
              {otherCursors.map((c) => (
                <div key={c.userEmail} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.userColor }}
                  />
                  <span className="truncate">{c.userEmail.split("@")[0]}</span>
                  <span className="text-zinc-600 shrink-0">
                    L{c.position?.line ?? "?"}:{c.position?.ch ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 border-t border-border">
            <div className="px-3 py-2 border-b border-border">
              <h3 className="text-sm font-medium text-zinc-300">Room Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {chatMessages.map((msg, i) => (
                <div key={i} className="text-sm">
                  <span className="text-zinc-500 text-xs">
                    {msg.userEmail === userEmail ? "You" : msg.userEmail}
                  </span>
                  <p className="text-zinc-300 break-words mt-0.5">{msg.message}</p>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="p-2 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 rounded border border-border bg-surface-muted/50 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>

    {/* ── Confirm: delete room ── */}
    {deleteRoomConfirmOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => { if (!deleteRoomLoading) setDeleteRoomConfirmOpen(false); }}
      >
        <div
          className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium text-white mb-1">Delete this room?</p>
          <p className="text-xs text-zinc-500 mb-4">
            All members will lose access and the code will be gone. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!deleteRoomLoading) setDeleteRoomConfirmOpen(false); }}
              disabled={deleteRoomLoading}
              className="flex-1 rounded-lg border border-border py-2 text-sm text-zinc-300 hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteRoom}
              disabled={deleteRoomLoading}
              className="flex-1 rounded-lg bg-red-500/20 border border-red-500/30 py-2 text-sm text-red-400 hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleteRoomLoading ? "Deleting…" : "Delete Room"}
            </button>
          </div>
        </div>
      </div>
    )}
  );
}
