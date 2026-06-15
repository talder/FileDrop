"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, TestTube, X, Server, FolderOpen } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import SftpFolderBrowserModal from "@/components/SftpFolderBrowserModal";
import type { SanitizedUser } from "@/lib/types";

interface ServerRow {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  createdAt: string;
}

export default function SftpServersPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ServerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerRow | null>(null);
  const [browseTarget, setBrowseTarget] = useState<ServerRow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fHost, setFHost] = useState("");
  const [fPort, setFPort] = useState("22");
  const [fUser, setFUser] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fPrivateKey, setFPrivateKey] = useState("");
  const [fTestPath, setFTestPath] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchServers = useCallback(() => {
    fetch("/api/sftp-connections").then((r) => r.json()).then((data) => {
      setServers(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchServers(); }, [user, fetchServers]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFHost(""); setFPort("22"); setFUser(""); setFPassword(""); setFPrivateKey("");
    setFTestPath(""); setTestResult(null); setFormError("");
    setShowModal(true);
  };

  const openEdit = (s: ServerRow) => {
    setEditTarget(s);
    setFName(s.name); setFHost(s.host); setFPort(String(s.port)); setFUser(s.username);
    setFPassword(""); setFPrivateKey(""); setFTestPath(""); setTestResult(null); setFormError("");
    setShowModal(true);
  };

  const buildBody = () => {
    const body: Record<string, unknown> = { name: fName, host: fHost, port: parseInt(fPort) || 22, username: fUser };
    if (fPassword) body.password = fPassword;
    if (fPrivateKey) body.privateKey = fPrivateKey;
    return body;
  };

  const handleSubmit = async () => {
    setFormError("");
    const url = editTarget ? `/api/sftp-connections/${editTarget.id}` : "/api/sftp-connections";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody()) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchServers();
  };

  const handleTestInModal = async () => {
    setTesting(true);
    setTestResult(null);
    const id = editTarget ? editTarget.id : "new";
    const body: Record<string, unknown> = { ...buildBody(), remotePath: fTestPath || undefined };
    const res = await fetch(`/api/sftp-connections/${id}/test`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    setTesting(false);
    setTestResult(data.success ? `OK — ${data.fileCount ?? 0} item(s) found` : `Failed: ${data.error || "unknown error"}`);
  };

  const handleTestRow = async (s: ServerRow) => {
    setBanner(`Testing ${s.name}…`);
    const res = await fetch(`/api/sftp-connections/${s.id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    setBanner(data.success ? `${s.name}: connection OK (${data.fileCount ?? 0} item(s))` : `${s.name}: ${data.error || "connection failed"}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/sftp-connections/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) setBanner(data.error || "Delete failed");
    setDeleteTarget(null);
    fetchServers();
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">SFTP Servers</h1>
            <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Add Server</button>
          </div>

          {banner && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{banner}</span>
              <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {servers.length === 0 && !loading ? (
            <div className="empty-state">
              <Server className="empty-state-icon" />
              <p className="empty-state-title">No SFTP servers</p>
              <p className="empty-state-description">Add a reusable SFTP server connection, then use it from one or more Transfers.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Host</th><th>Username</th><th>Auth</th><th>Actions</th></tr></thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-text-primary">{s.name}</td>
                    <td className="font-mono text-xs">{s.host}:{s.port}</td>
                    <td className="text-xs">{s.username}</td>
                    <td className="text-xs">
                      {s.hasPassword && <span className="badge badge-muted">Password</span>}
                      {s.hasPrivateKey && <span className="badge badge-muted">Key</span>}
                      {!s.hasPassword && !s.hasPrivateKey && <span className="text-text-muted">—</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTestRow(s)} title="Test"><TestTube className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setBrowseTarget(s)} title="Browse"><FolderOpen className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(s)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showModal && (
            <ModalOverlay onClose={() => setShowModal(false)} maxWidth={520}>
                <div className="modal-header">
                  <h2>{editTarget ? "Edit SFTP Server" : "New SFTP Server"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. SAP PE2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="input-label">Host</label>
                      <input className="input" value={fHost} onChange={(e) => setFHost(e.target.value)} placeholder="sftp.example.com" />
                    </div>
                    <div>
                      <label className="input-label">Port</label>
                      <input className="input" type="number" value={fPort} onChange={(e) => setFPort(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="input-label">Username</label>
                    <input className="input" value={fUser} onChange={(e) => setFUser(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Password {editTarget ? "(leave empty to keep)" : ""}</label>
                    <input className="input" type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} placeholder={editTarget?.hasPassword ? "••••••••" : ""} />
                  </div>
                  <div>
                    <label className="input-label">Private Key (PEM, optional) {editTarget?.hasPrivateKey ? "— leave empty to keep" : ""}</label>
                    <textarea className="input" rows={3} value={fPrivateKey} onChange={(e) => setFPrivateKey(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                  </div>
                  <div className="p-3 rounded-lg border border-border space-y-2">
                    <label className="input-label">Test connection (optional remote path)</label>
                    <div className="flex items-center gap-2">
                      <input className="input flex-1" value={fTestPath} onChange={(e) => setFTestPath(e.target.value)} placeholder="/ (default)" />
                      <button className="btn btn-secondary" onClick={handleTestInModal} disabled={testing}><TestTube className="w-4 h-4" /> {testing ? "Testing…" : "Test"}</button>
                    </div>
                    {testResult && <p className={`text-sm ${testResult.startsWith("OK") ? "text-green-600" : "text-red-500"}`}>{testResult}</p>}
                  </div>
                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>{editTarget ? "Save Changes" : "Create"}</button>
                </div>
            </ModalOverlay>
          )}

          <SftpFolderBrowserModal
            isOpen={!!browseTarget}
            connectionId={browseTarget?.id || ""}
            serverName={browseTarget?.name}
            onClose={() => setBrowseTarget(null)}
            onSelect={(p) => {
              navigator.clipboard?.writeText(p).catch(() => {});
              setBanner(`Copied path: ${p}`);
              setBrowseTarget(null);
            }}
          />

          <ConfirmModal
            isOpen={!!deleteTarget}
            title="Delete SFTP Server"
            message={`Delete "${deleteTarget?.name}"? Transfers using this server must be removed or reassigned first.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
