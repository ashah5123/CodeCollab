"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function apiFetch(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `${res.status}`);
  }
  return res.json();
}

async function apiPut(path: string, body: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Section = "profile" | "account" | "notifications";

// ─── Avatar preview ───────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-rose-600",
  "from-pink-500 to-fuchsia-600",
  "from-amber-500 to-yellow-600",
];

function avatarGradient(username: string) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function AvatarPreview({ avatarUrl, username }: { avatarUrl: string; username: string }) {
  const [imgErr, setImgErr] = useState(false);
  const initial = (username || "?")[0]?.toUpperCase();
  // Reset error when URL changes
  useEffect(() => setImgErr(false), [avatarUrl]);
  if (avatarUrl && !imgErr) {
    return (
      <img
        src={avatarUrl}
        alt="avatar preview"
        onError={() => setImgErr(true)}
        className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/10 shadow-lg shrink-0"
      />
    );
  }
  return (
    <div
      className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${avatarGradient(username || "user")}
        flex items-center justify-center text-2xl font-bold text-white ring-2 ring-white/10
        shadow-lg select-none shrink-0`}
    >
      {initial}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("profile");
  const [userEmail, setUserEmail] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [loading, setLoading] = useState(true);

  // Profile form fields
  const [username, setUsername]   = useState("");
  const [fullName, setFullName]   = useState("");
  const [bio, setBio]             = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Profile save state
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Account — email change
  const [newEmail, setNewEmail]       = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg]       = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Account — password change
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving]               = useState(false);
  const [pwMsg, setPwMsg]                     = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Notifications (UI-only toggles)
  const [notifCode,   setNotifCode]   = useState(true);
  const [notifReview, setNotifReview] = useState(true);
  const [notifChat,   setNotifChat]   = useState(false);

  // Load current user + profile
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUserEmail(user.email ?? "");
      try {
        const profile: Profile = await apiFetch("/api/v1/profiles/me");
        setProfileUsername(profile.username);
        setUsername(profile.username ?? "");
        setFullName(profile.full_name ?? "");
        setBio(profile.bio ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
      } catch {
        setSaveError("Could not load profile. Check your connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setSaveError("Username cannot be empty."); return; }
    setSaving(true);
    setSaveError(null);
    setSuccess(false);

    const payload: Record<string, string> = {};
    if (username.trim())  payload.username   = username.trim();
    if (fullName.trim())  payload.full_name  = fullName.trim();
    if (bio.trim())       payload.bio        = bio.trim();
    if (avatarUrl.trim()) payload.avatar_url = avatarUrl.trim();

    try {
      const updated: Profile = await apiPut("/api/v1/profiles/me", payload);
      setProfileUsername(updated.username);
      setUsername(updated.username ?? "");
      setFullName(updated.full_name ?? "");
      setBio(updated.bio ?? "");
      setAvatarUrl(updated.avatar_url ?? "");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      setEmailMsg({ type: "error", text: error.message });
    } else {
      setEmailMsg({
        type: "ok",
        text: "Confirmation email sent. Check your inbox to confirm the new address.",
      });
      setNewEmail("");
    }
    setEmailSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwMsg({ type: "error", text: error.message });
    } else {
      setPwMsg({ type: "ok", text: "Password updated successfully." });
      setNewPassword("");
      setConfirmPassword("");
    }
    setPwSaving(false);
  };

  const SECTIONS: { id: Section; label: string }[] = [
    { id: "profile",       label: "Profile" },
    { id: "account",       label: "Account" },
    { id: "notifications", label: "Notifications" },
  ];

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border bg-surface-muted/20 h-14 px-6 flex items-center">
            <div className="h-4 w-20 rounded bg-zinc-800 animate-pulse" />
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-10">
            <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
              <div className="h-px bg-zinc-800 w-full" />
              <div className="rounded-2xl border border-border bg-surface-muted/20 p-6 space-y-5">
                <div className="flex gap-4">
                  <div className="h-20 w-20 rounded-2xl bg-zinc-800 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-20 rounded bg-zinc-800" />
                    <div className="h-9 rounded-lg bg-zinc-800/70" />
                  </div>
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-16 rounded bg-zinc-800" />
                    <div className="h-9 rounded-lg bg-zinc-800/70" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-surface-muted/20 h-14 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="h-4 w-4 text-zinc-500" />
            <h1 className="text-sm font-semibold text-white">Settings</h1>
          </div>
          {profileUsername && (
            <Link
              href={`/profile/${profileUsername}`}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
            >
              <UserCircleIcon className="h-3.5 w-3.5" />
              View Profile
            </Link>
          )}
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">

            {/* Section tabs */}
            <div className="flex gap-0.5 mb-7 border-b border-border">
              {SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    section === id
                      ? "border-accent text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Profile section ── */}
            {section === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Success toast */}
                <AnimatePresence>
                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-2.5 rounded-xl border border-green-500/30
                        bg-green-500/10 px-4 py-3 text-sm text-green-400">
                        <CheckIcon className="h-4 w-4 shrink-0" />
                        Profile saved successfully!
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSaveProfile}>
                  <div className="rounded-2xl border border-border bg-surface-muted/15 overflow-hidden">

                    {/* Section header */}
                    <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
                      <UserCircleIcon className="h-4 w-4 text-accent shrink-0" />
                      <h2 className="text-sm font-semibold text-white">Public Profile</h2>
                      <span className="text-xs text-zinc-600 ml-auto font-mono truncate max-w-[200px]">
                        {userEmail}
                      </span>
                    </div>

                    <div className="px-6 py-6 space-y-5">

                      {/* Avatar row */}
                      <div className="flex items-start gap-5">
                        <AvatarPreview avatarUrl={avatarUrl} username={username} />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <label className="text-xs font-medium text-zinc-400">Avatar URL</label>
                          <input
                            type="url"
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            placeholder="https://example.com/avatar.png"
                            disabled={saving}
                            className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                              text-sm text-white placeholder:text-zinc-600 focus:outline-none
                              focus:border-accent/60 disabled:opacity-50 transition-colors"
                          />
                          <p className="text-[11px] text-zinc-600">
                            Paste a direct image link. Leave blank for your initials avatar.
                          </p>
                        </div>
                      </div>

                      <div className="h-px bg-border" />

                      {/* Full name */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400">Full Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Alex Johnson"
                          maxLength={100}
                          disabled={saving}
                          className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                            text-sm text-white placeholder:text-zinc-600 focus:outline-none
                            focus:border-accent/60 disabled:opacity-50 transition-colors"
                        />
                      </div>

                      {/* Username */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400">Username</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm
                            pointer-events-none select-none">@</span>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(
                              e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                            )}
                            placeholder="your_username"
                            maxLength={50}
                            disabled={saving}
                            required
                            className="w-full rounded-lg border border-border bg-surface-muted/30 pl-7 pr-3 py-2.5
                              text-sm text-white placeholder:text-zinc-600 focus:outline-none
                              focus:border-accent/60 disabled:opacity-50 transition-colors font-mono"
                          />
                        </div>
                        <p className="text-[11px] text-zinc-600">
                          Lowercase letters, numbers, and underscores only. Must be unique.
                        </p>
                      </div>

                      {/* Bio */}
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <label className="text-xs font-medium text-zinc-400">Bio</label>
                          <span className="text-[10px] text-zinc-600">{bio.length}/500</span>
                        </div>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell others a bit about yourself…"
                          maxLength={500}
                          rows={4}
                          disabled={saving}
                          className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                            text-sm text-white placeholder:text-zinc-600 focus:outline-none
                            focus:border-accent/60 disabled:opacity-50 resize-none transition-colors
                            leading-relaxed"
                        />
                      </div>

                    </div>

                    {/* Section footer with error + save */}
                    <div className="px-6 py-4 border-t border-border bg-surface-muted/10">
                      <AnimatePresence>
                        {saveError && (
                          <motion.p
                            key="err"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="text-xs text-red-400 bg-red-500/10 border border-red-500/20
                              rounded-lg px-3 py-2 mb-3 overflow-hidden"
                          >
                            {saveError}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center justify-between gap-4">
                        <p className="text-[11px] text-zinc-600">
                          Changes appear on your public profile immediately.
                        </p>
                        <button
                          type="submit"
                          disabled={saving || !username.trim()}
                          className="flex items-center gap-2 shrink-0 rounded-lg bg-accent px-5 py-2.5
                            text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50
                            disabled:cursor-not-allowed transition-all"
                        >
                          {saving ? (
                            <>
                              <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                              Saving…
                            </>
                          ) : success ? (
                            <>
                              <CheckIcon className="h-3.5 w-3.5 text-green-300" />
                              Saved!
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </motion.div>
            )}

            {/* ── Account section ── */}
            {section === "account" && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Change Email */}
                <div className="rounded-2xl border border-border bg-surface-muted/15 overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
                    <ShieldIcon className="h-4 w-4 text-zinc-500 shrink-0" />
                    <h2 className="text-sm font-semibold text-white">Change Email</h2>
                  </div>
                  <form onSubmit={handleChangeEmail} className="px-6 py-5 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Current Email</label>
                      <input
                        type="email"
                        value={userEmail}
                        disabled
                        className="w-full rounded-lg border border-border bg-surface-muted/20 px-3 py-2.5
                          text-sm text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">New Email</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="new@example.com"
                        disabled={emailSaving}
                        className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                          text-sm text-white placeholder:text-zinc-600 focus:outline-none
                          focus:border-accent/60 disabled:opacity-50 transition-colors"
                      />
                    </div>
                    {emailMsg && (
                      <p className={`text-sm ${emailMsg.type === "error" ? "text-red-400" : "text-green-400"}`}>
                        {emailMsg.text}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={emailSaving || !newEmail.trim()}
                      className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white
                        hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      {emailSaving ? "Sending…" : "Change Email"}
                    </button>
                  </form>
                </div>

                {/* Password change */}
                <div className="rounded-2xl border border-border bg-surface-muted/15 overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-sm font-semibold text-white">Change Password</h2>
                  </div>
                  <form onSubmit={handleChangePassword} className="px-6 py-5 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                          text-sm text-white placeholder:text-zinc-600 focus:outline-none
                          focus:border-accent/60 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5
                          text-sm text-white placeholder:text-zinc-600 focus:outline-none
                          focus:border-accent/60 transition-colors"
                      />
                    </div>
                    {pwMsg && (
                      <p className={`text-sm ${pwMsg.type === "error" ? "text-red-400" : "text-green-400"}`}>
                        {pwMsg.text}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={pwSaving || !newPassword || !confirmPassword}
                      className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white
                        hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      {pwSaving ? "Updating…" : "Update Password"}
                    </button>
                  </form>
                </div>

                {/* Danger zone */}
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                  <div className="px-6 py-4 border-b border-red-500/20">
                    <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
                  </div>
                  <div className="px-6 py-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white">Delete Account</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Permanently remove your account and all associated data.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => alert("Contact support to delete your account.")}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5
                        text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Notifications section ── */}
            {section === "notifications" && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="rounded-2xl border border-border bg-surface-muted/15 overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
                    <BellIcon className="h-4 w-4 text-zinc-500 shrink-0" />
                    <h2 className="text-sm font-semibold text-white">Notification Preferences</h2>
                  </div>
                  <div className="px-6 py-3 divide-y divide-border">
                    {[
                      {
                        id: "code",
                        label: "Code Review Updates",
                        desc: "When your submission is reviewed or approved",
                        value: notifCode,
                        set: setNotifCode,
                      },
                      {
                        id: "review",
                        label: "New Submissions",
                        desc: "When someone submits code for peer review",
                        value: notifReview,
                        set: setNotifReview,
                      },
                      {
                        id: "chat",
                        label: "Chat Messages",
                        desc: "New messages in org or global chat",
                        value: notifChat,
                        set: setNotifChat,
                      },
                    ].map(({ id, label, desc, value, set }) => (
                      <div key={id} className="flex items-center justify-between py-4">
                        <div>
                          <p className="text-sm font-medium text-white">{label}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => set(!value)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                            transition-colors ${value ? "bg-accent" : "bg-zinc-700"}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                              ${value ? "translate-x-6" : "translate-x-1"}`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-6 py-3 border-t border-border">
                    <p className="text-[11px] text-zinc-600">
                      Notification delivery is coming soon. These preferences will be applied when available.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function UserCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
