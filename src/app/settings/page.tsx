"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, Unlock, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import type { SanitizedUser, AppSettings, DEFAULT_SETTINGS } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [tab, setTab] = useState<"general" | "users" | "security" | "email">("general");

  // General settings
  const [appName, setAppName] = useState("FileDrop");
  const [maxFileSize, setMaxFileSize] = useState("50");
  const [retentionDays, setRetentionDays] = useState("0");
  const [saved, setSaved] = useState(false);

  // Users
  const [users, setUsers] = useState<SanitizedUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [userError, setUserError] = useState("");
  const [deleteUserTarget, setDeleteUserTarget] = useState<SanitizedUser | null>(null);

  // Security
  const [rateLimit, setRateLimit] = useState("60");

  // Email / SMTP
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpAdmin, setSmtpAdmin] = useState("");
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);
  const [smtpSaved, setSmtpSaved] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchSettings = useCallback(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      setAppName(s.appName || "FileDrop");
      setMaxFileSize(String((s.maxFileSize || 52428800) / 1024 / 1024));
      setRetentionDays(String(s.fileRetentionDays || 0));
      setRateLimit(String(s.rateLimitPerKey || 60));
    });
  }, []);

  const fetchUsers = useCallback(() => {
    fetch("/api/users").then((r) => r.json()).then((u) => setUsers(Array.isArray(u) ? u : []));
  }, []);

  const fetchSmtp = useCallback(() => {
    fetch("/api/settings/smtp").then((r) => r.json()).then((s) => {
      setSmtpHost(s.host || ""); setSmtpPort(String(s.port || 587)); setSmtpSecure(s.secure || false);
      setSmtpUser(s.user || ""); setSmtpPass(s.pass || ""); setSmtpFrom(s.from || ""); setSmtpAdmin(s.adminEmail || "");
    });
  }, []);

  useEffect(() => { if (user) { fetchSettings(); fetchUsers(); fetchSmtp(); } }, [user, fetchSettings, fetchUsers, fetchSmtp]);

  const handleSaveSettings = async () => {
    await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName, maxFileSize: parseFloat(maxFileSize) * 1024 * 1024,
        fileRetentionDays: parseInt(retentionDays), rateLimitPerKey: parseInt(rateLimit),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddUser = async () => {
    setUserError("");
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, fullName: newFullName }),
    });
    const data = await res.json();
    if (!res.ok) { setUserError(data.error || "Failed"); return; }
    setShowAddUser(false);
    setNewUsername(""); setNewPassword(""); setNewFullName("");
    fetchUsers();
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    await fetch(`/api/users/${deleteUserTarget.username}`, { method: "DELETE" });
    setDeleteUserTarget(null);
    fetchUsers();
  };

  const handleUnlockUser = async (username: string) => {
    await fetch(`/api/users/${username}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlock: true }),
    });
    fetchUsers();
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <h1 className="page-title mb-4">Settings</h1>

          <div className="tabs">
            <button className={`tab ${tab === "general" ? "active" : ""}`} onClick={() => setTab("general")}>General</button>
            <button className={`tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Users</button>
            <button className={`tab ${tab === "security" ? "active" : ""}`} onClick={() => setTab("security")}>Security</button>
            <button className={`tab ${tab === "email" ? "active" : ""}`} onClick={() => setTab("email")}>Email</button>
          </div>

          {tab === "general" && (
            <div className="max-w-lg space-y-4">
              <div>
                <label className="input-label">Application Name</label>
                <input className="input" value={appName} onChange={(e) => setAppName(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Default Max File Size (MB)</label>
                <input className="input" type="number" value={maxFileSize} onChange={(e) => setMaxFileSize(e.target.value)} />
              </div>
              <div>
                <label className="input-label">File Retention (days, 0 = keep forever)</label>
                <input className="input" type="number" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleSaveSettings}>
                <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save Settings"}
              </button>
            </div>
          )}

          {tab === "users" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-text-muted">{users.length} user{users.length !== 1 ? "s" : ""}</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}><Plus className="w-3.5 h-3.5" /> Add User</button>
              </div>
              <table className="data-table">
                <thead><tr><th>Username</th><th>Full Name</th><th>Admin</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username}>
                      <td className="font-medium text-text-primary">{u.username}</td>
                      <td>{u.fullName || "—"}</td>
                      <td>{u.isAdmin ? <span className="badge badge-info">Admin</span> : "—"}</td>
                      <td>{u.isLocked ? <span className="badge badge-danger">Locked</span> : <span className="badge badge-success">Active</span>}</td>
                      <td className="text-xs">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "Never"}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          {u.isLocked && <button className="btn btn-ghost btn-sm" onClick={() => handleUnlockUser(u.username)} title="Unlock"><Unlock className="w-3.5 h-3.5" /></button>}
                          {u.username !== user?.username && <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteUserTarget(u)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {showAddUser && (
                <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
                  <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>Add User</h2>
                      <button onClick={() => setShowAddUser(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="modal-body space-y-4">
                      <div><label className="input-label">Full Name</label><input className="input" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} /></div>
                      <div><label className="input-label">Username</label><input className="input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></div>
                      <div><label className="input-label">Password</label><input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" /></div>
                      {userError && <p className="text-sm text-red-500">{userError}</p>}
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleAddUser}>Create User</button>
                    </div>
                  </div>
                </div>
              )}

              <ConfirmModal isOpen={!!deleteUserTarget} title="Delete User" message={`Delete user "${deleteUserTarget?.username}"?`} confirmLabel="Delete" onConfirm={handleDeleteUser} onClose={() => setDeleteUserTarget(null)} />
            </div>
          )}

          {tab === "security" && (
            <div className="max-w-lg space-y-4">
              <div>
                <label className="input-label">Rate Limit per API Key (requests/minute)</label>
                <input className="input" type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleSaveSettings}>
                <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save Settings"}
              </button>
            </div>
          )}
          {tab === "email" && (
            <div className="max-w-lg space-y-4">
              <p className="text-sm text-text-muted">Configure SMTP to send email notifications when files are uploaded or fail. Set notification preferences per endpoint.</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><label className="input-label">SMTP Host</label><input className="input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" /></div>
                <div><label className="input-label">Port</label><input className="input" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-2">
                <button className={`toggle ${smtpSecure ? "active" : ""}`} onClick={() => setSmtpSecure(!smtpSecure)}><span className="toggle-knob" /></button>
                <span className="text-sm text-text-secondary">Use TLS/SSL</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="input-label">Username</label><input className="input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></div>
                <div><label className="input-label">Password</label><input className="input" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} /></div>
              </div>
              <div><label className="input-label">From Address</label><input className="input" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="filedrop@example.com" /></div>
              <div><label className="input-label">Admin Email (for system alerts)</label><input className="input" value={smtpAdmin} onChange={(e) => setSmtpAdmin(e.target.value)} placeholder="admin@example.com" /></div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={async () => {
                  await fetch("/api/settings/smtp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: smtpHost, port: parseInt(smtpPort), secure: smtpSecure, user: smtpUser, pass: smtpPass, from: smtpFrom, adminEmail: smtpAdmin }) });
                  setSmtpSaved(true); setTimeout(() => setSmtpSaved(false), 2000);
                }}><Save className="w-4 h-4" /> {smtpSaved ? "Saved!" : "Save SMTP"}</button>
              </div>
              <div className="p-4 border border-border rounded-lg space-y-3 mt-4">
                <p className="text-xs font-semibold text-text-muted uppercase">Test Email</p>
                <div className="flex gap-2">
                  <input className="input flex-1" value={smtpTestTo} onChange={(e) => setSmtpTestTo(e.target.value)} placeholder="test@example.com" />
                  <button className="btn btn-secondary" onClick={async () => {
                    setSmtpTestResult(null);
                    const res = await fetch("/api/settings/smtp/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: smtpTestTo }) });
                    const d = await res.json();
                    setSmtpTestResult(res.ok ? "Test email sent!" : d.error || "Failed");
                  }}>Send Test</button>
                </div>
                {smtpTestResult && <p className={`text-sm ${smtpTestResult.includes("sent") ? "text-green-600" : "text-red-500"}`}>{smtpTestResult}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
