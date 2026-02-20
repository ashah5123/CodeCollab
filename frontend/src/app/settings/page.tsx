"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getProfile, updateProfile, type UserProfile } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

type Section = "profile" | "account" | "notifications";

export default function SettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("profile");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [notifCode, setNotifCode] = useState(true);
  const [notifReview, setNotifReview] = useState(true);
  const [notifChat, setNotifChat] = useState(false);

  const fetchProfile = useCallback(async (tok: string) => {
    try {
      const p = await getProfile(tok);
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setBio(p.bio ?? "");
    } catch {
      // profile endpoint may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setEmail(data.user.email ?? "");
    });
    supabase.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token;
      if (tok) { setToken(tok); fetchProfile(tok); }
      else setLoading(false);
    });
  }, [router, fetchProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateProfile(token, {
        display_name: displayName || undefined,
        bio: bio || undefined,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    setPwSaving(true);
    setPwMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwMsg({ type: "error", text: error.message });
    } else {
      setPwMsg({ type: "ok", text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
    }
    setPwSaving(false);
  };

  const SECTIONS: { id: Section; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "account", label: "Account" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-surface-muted/20 px-6 h-14 flex items-center">
          <h1 className="font-semibold text-white">Settings</h1>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Section tabs */}
            <div className="flex gap-1 mb-8 border-b border-border pb-0">
              {SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    section === id
                      ? "border-accent text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Profile section */}
            {section === "profile" && (
              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
                    style={{
                      background: `hsl(${[...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360},55%,45%)`,
                    }}
                  >
                    {(displayName || email)[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {displayName || email}
                    </p>
                    <p className="text-xs text-zinc-500">{email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How you appear to others"
                      className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell others a bit about yourself…"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full rounded-lg border border-border bg-surface-muted/20 px-3 py-2.5 text-sm text-zinc-500 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Email is managed through your account.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                  {saved && (
                    <span className="text-sm text-green-400">Saved!</span>
                  )}
                </div>

                {profile && (
                  <div className="rounded-xl border border-border bg-surface-muted/20 p-4 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{profile.score}</p>
                      <p className="text-xs text-zinc-500">Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">
                        {profile.rank != null ? `#${profile.rank}` : "—"}
                      </p>
                      <p className="text-xs text-zinc-500">Rank</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">{profile.submissions_count}</p>
                      <p className="text-xs text-zinc-500">Submissions</p>
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* Account section */}
            {section === "account" && (
              <div className="space-y-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <h2 className="text-sm font-semibold text-white">Change Password</h2>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-accent focus:outline-none"
                    />
                  </div>
                  {pwMsg && (
                    <p
                      className={`text-sm ${
                        pwMsg.type === "error" ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {pwMsg.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={pwSaving || !newPassword}
                    className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {pwSaving ? "Updating…" : "Update Password"}
                  </button>
                </form>

                <div className="border-t border-border pt-6 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Danger Zone</h2>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Delete Account</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Permanently remove your account and all data.
                      </p>
                    </div>
                    <button
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                      onClick={() => alert("Contact support to delete your account.")}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications section */}
            {section === "notifications" && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-white mb-4">
                  Notification Preferences
                </h2>
                {[
                  {
                    id: "code",
                    label: "Code Review Updates",
                    desc: "Notified when your submission is reviewed",
                    value: notifCode,
                    set: setNotifCode,
                  },
                  {
                    id: "review",
                    label: "New Submissions",
                    desc: "Notified when someone submits code for review",
                    value: notifReview,
                    set: setNotifReview,
                  },
                  {
                    id: "chat",
                    label: "Chat Messages",
                    desc: "Notified for new messages in org or global chat",
                    value: notifChat,
                    set: setNotifChat,
                  },
                ].map(({ id, label, desc, value, set }) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/20 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => set(!value)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        value ? "bg-accent" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                          value ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-zinc-600 mt-2">
                  Notification delivery is coming soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
