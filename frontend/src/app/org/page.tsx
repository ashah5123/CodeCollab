"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  getMyOrg,
  getOrgMembers,
  getOrgChatMessages,
  sendOrgChatMessage,
  createOrg,
  joinOrg,
  type Organisation,
  type OrgMember,
  type OrgChatMessage,
} from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

function Avatar({ email, size = "sm" }: { email: string; size?: "sm" | "md" | "lg" }) {
  const letter = (email[0] ?? "?").toUpperCase();
  const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  const sz = size === "lg" ? "h-12 w-12 text-lg" : size === "md" ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sz}`}
      style={{ background: `hsl(${hue},55%,45%)` }}
    >
      {letter}
    </span>
  );
}

const ROLE_STYLES: Record<string, string> = {
  owner: "bg-yellow-500/10 text-yellow-400",
  admin: "bg-accent/10 text-accent",
  member: "bg-zinc-500/10 text-zinc-400",
};

export default function OrgPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [chatMessages, setChatMessages] = useState<OrgChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<"members" | "chat">("members");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async (tok: string) => {
    const orgData = await getMyOrg(tok);
    setOrg(orgData);
    if (orgData) {
      const [mems, msgs] = await Promise.allSettled([
        getOrgMembers(tok, orgData.id),
        getOrgChatMessages(tok, orgData.id),
      ]);
      if (mems.status === "fulfilled") setMembers(mems.value);
      if (msgs.status === "fulfilled") setChatMessages(msgs.value);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setMe({ id: data.user.id, email: data.user.email ?? "" });
    });
    supabase.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token;
      if (tok) { setToken(tok); fetchAll(tok); }
      else setLoading(false);
    });
  }, [router, fetchAll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !token || !org) return;
    setSending(true);
    try {
      const msg = await sendOrgChatMessage(token, org.id, text, me?.email);
      setChatMessages((prev) => [...prev, msg]);
      setChatInput("");
    } finally {
      setSending(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !orgName.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await createOrg(token, orgName.trim());
      setOrgName("");
      router.refresh();
      await fetchAll(token);
    } catch (err) {
      setError((err as Error).message || "Failed to create organisation.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteCode.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await joinOrg(token, inviteCode.trim());
      setInviteCode("");
      router.refresh();
      await fetchAll(token);
    } catch (err) {
      setError((err as Error).message || "Invalid invite code.");
    } finally {
      setActionLoading(false);
    }
  };

  const copyInvite = () => {
    if (!org?.invite_code) return;
    navigator.clipboard.writeText(org.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-400 text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center">
            <h1 className="font-semibold text-white">Organisation</h1>
          </header>
          <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
            <div className="max-w-2xl w-full">
              <div className="text-center mb-8">
                <BuildingIcon className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <h2 className="text-xl font-semibold text-white mb-1">No Organisation</h2>
                <p className="text-sm text-zinc-500">
                  Create a new organisation or join one with an invite code.
                </p>
              </div>

              {error && (
                <p className="mb-4 text-center text-sm text-red-400">{error}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Card 1 — Create */}
                <div className="rounded-xl border border-border bg-surface-muted/20 p-6 flex flex-col gap-4">
                  <div>
                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
                      <PlusIcon className="h-5 w-5 text-accent" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Create Organisation</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Start fresh and invite your team with a code.
                    </p>
                  </div>
                  <form onSubmit={handleCreateOrg} className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Organisation name"
                      className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !orgName.trim()}
                      className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {actionLoading ? "Creating…" : "Create Organisation"}
                    </button>
                  </form>
                </div>

                {/* Card 2 — Join */}
                <div className="rounded-xl border border-border bg-surface-muted/20 p-6 flex flex-col gap-4">
                  <div>
                    <div className="h-10 w-10 rounded-lg bg-zinc-500/10 flex items-center justify-center mb-3">
                      <KeyIcon className="h-5 w-5 text-zinc-400" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Join with Invite Code</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Enter the invite code shared by your team.
                    </p>
                  </div>
                  <form onSubmit={handleJoinOrg} className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="Invite code"
                      className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none font-mono tracking-widest text-center"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !inviteCode.trim()}
                      className="w-full rounded-lg border border-border bg-surface-muted/30 py-2.5 text-sm font-medium text-zinc-300 hover:bg-surface-muted disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? "Joining…" : "Join Organisation"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center gap-3">
          <BuildingIcon className="h-5 w-5 text-accent" />
          <h1 className="font-semibold text-white">{org.name}</h1>
          {org.role && (
            <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${ROLE_STYLES[org.role] ?? ROLE_STYLES.member}`}>
              {org.role}
            </span>
          )}
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="shrink-0 flex border-b border-border px-4">
              {(["members", "chat"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                    tab === t
                      ? "border-accent text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t}
                  {t === "members" && (
                    <span className="ml-1.5 text-xs text-zinc-600">({members.length})</span>
                  )}
                </button>
              ))}
            </div>

            {tab === "members" && (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-lg space-y-2">
                  {members.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">No members found.</p>
                  ) : (
                    members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/20 px-4 py-3"
                      >
                        <Avatar email={m.user_email ?? m.user_id} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            {m.user_email ?? m.user_id}
                            {m.user_id === me?.id && (
                              <span className="ml-1.5 text-[10px] text-zinc-600">(you)</span>
                            )}
                          </p>
                        </div>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${ROLE_STYLES[m.role] ?? ROLE_STYLES.member}`}>
                          {m.role}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === "chat" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-zinc-600 text-center py-8">
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-2.5">
                        <Avatar email={msg.user_email} />
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium text-zinc-300">
                              {msg.user_name || msg.user_email}
                            </span>
                            <span className="text-[10px] text-zinc-600">
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-300 mt-0.5 break-words">{msg.body}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="shrink-0 border-t border-border px-4 py-3">
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Message the team…"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !chatInput.trim()}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="w-64 shrink-0 border-l border-border bg-surface-muted/10 p-4 space-y-5 overflow-y-auto">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Organisation</p>
              <p className="text-sm font-medium text-white">{org.name}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Members</p>
              <p className="text-2xl font-bold text-white">{members.length}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Created</p>
              <p className="text-xs text-zinc-400">
                {new Date(org.created_at).toLocaleDateString([], {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            {org.invite_code && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">Invite Code</p>
                <div className="rounded-xl border border-border bg-surface-muted/30 px-4 py-4 flex flex-col items-center gap-3">
                  <p className="font-mono text-2xl font-bold tracking-widest text-accent select-all">
                    {org.invite_code}
                  </p>
                  <button
                    onClick={copyInvite}
                    className="w-full rounded-lg border border-border bg-surface-muted/40 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface-muted transition-colors"
                  >
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 text-center">
                  Share this code to invite teammates
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}
