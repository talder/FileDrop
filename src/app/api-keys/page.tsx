"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Ban, Copy, Check, KeyRound, X, AlertTriangle } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import type { SanitizedUser, DropEndpoint } from "@/lib/types";

interface ApiKeyRow {
  id: string; partyName: string; keyPrefix: string; allowedEndpoints: string[];
  expiresAt: string | null; revokedAt: string | null; createdAt: string;
}

export default function ApiKeysPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [endpoints, setEndpoints] = useState<DropEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenModal, setShowGenModal] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyRow | null>(null);
  const [copied, setCopied] = useState(false);

  const [fPartyName, setFPartyName] = useState("");
  const [fEndpoints, setFEndpoints] = useState<string[]>([]);
  const [fExpiry, setFExpiry] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch("/api/api-keys").then((r) => r.json()),
      fetch("/api/endpoints").then((r) => r.json()),
    ]).then(([k, ep]) => {
      setKeys(Array.isArray(k) ? k : []);
      setEndpoints(Array.isArray(ep) ? ep : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const openGenerate = () => {
    setFPartyName(""); setFEndpoints([]); setFExpiry(""); setFormError("");
    setGeneratedKey(null); setCopied(false);
    setShowGenModal(true);
  };

  const handleGenerate = async () => {
    setFormError("");
    if (!fPartyName) { setFormError("Party name is required"); return; }
    if (fEndpoints.length === 0) { setFormError("Select at least one endpoint"); return; }

    const res = await fetch("/api/api-keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyName: fPartyName, allowedEndpoints: fEndpoints, expiresAt: fExpiry || null }),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setGeneratedKey(data.key);
    fetchData();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    await fetch(`/api/api-keys/${revokeTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) });
    setRevokeTarget(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/api-keys/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchData();
  };

  const copyKey = () => {
    if (generatedKey) { navigator.clipboard.writeText(generatedKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const toggleEndpoint = (slug: string) => {
    setFEndpoints((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
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
            <h1 className="page-title">API Keys</h1>
            <button className="btn btn-primary" onClick={openGenerate}><Plus className="w-4 h-4" /> Generate Key</button>
          </div>

          {keys.length === 0 && !loading ? (
            <div className="empty-state">
              <KeyRound className="empty-state-icon" />
              <p className="empty-state-title">No API keys generated</p>
              <p className="empty-state-description">Generate API keys and share them with external parties to allow file uploads.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Party</th><th>Key Prefix</th><th>Endpoints</th><th>Created</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium text-text-primary">{k.partyName}</td>
                    <td><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{k.keyPrefix}...</code></td>
                    <td className="text-xs">{k.allowedEndpoints.join(", ")}</td>
                    <td className="text-xs">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="text-xs">{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}</td>
                    <td>
                      {k.revokedAt ? (
                        <span className="badge badge-danger">Revoked</span>
                      ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                        <span className="badge badge-warning">Expired</span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {!k.revokedAt && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setRevokeTarget(k)} title="Revoke"><Ban className="w-3.5 h-3.5" /></button>
                        )}
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(k)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Generate modal */}
          {showGenModal && (
            <div className="modal-overlay" onClick={() => { if (!generatedKey) setShowGenModal(false); }}>
              <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{generatedKey ? "API Key Generated" : "Generate API Key"}</h2>
                  <button onClick={() => setShowGenModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  {generatedKey ? (
                    <>
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">Copy this key now. It will <strong>not</strong> be shown again.</p>
                      </div>
                      <div className="copy-box">
                        <span className="flex-1 select-all">{generatedKey}</span>
                        <button className="btn btn-ghost btn-sm flex-shrink-0" onClick={copyKey}>
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="input-label">Party Name</label>
                        <input className="input" value={fPartyName} onChange={(e) => setFPartyName(e.target.value)} placeholder="e.g. ACME Corp" />
                      </div>
                      <div>
                        <label className="input-label">Allowed Endpoints</label>
                        <div className="space-y-1 mt-1">
                          {endpoints.map((ep) => (
                            <label key={ep.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="checkbox" checked={fEndpoints.includes(ep.slug)} onChange={() => toggleEndpoint(ep.slug)} />
                              <span>{ep.slug}</span>
                              <span className="text-xs text-text-muted">— {ep.description}</span>
                            </label>
                          ))}
                          {endpoints.length === 0 && <p className="text-xs text-text-muted">No endpoints configured. Create an endpoint first.</p>}
                        </div>
                      </div>
                      <div>
                        <label className="input-label">Expiry Date (optional)</label>
                        <input className="input" type="date" value={fExpiry} onChange={(e) => setFExpiry(e.target.value)} />
                      </div>
                      {formError && <p className="text-sm text-red-500">{formError}</p>}
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  {generatedKey ? (
                    <button className="btn btn-primary" onClick={() => setShowGenModal(false)}>Done</button>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => setShowGenModal(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleGenerate}>Generate Key</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <ConfirmModal isOpen={!!revokeTarget} title="Revoke API Key" message={`Revoke the key for "${revokeTarget?.partyName}"? They will immediately lose access.`} confirmLabel="Revoke" onConfirm={handleRevoke} onClose={() => setRevokeTarget(null)} />
          <ConfirmModal isOpen={!!deleteTarget} title="Delete API Key" message={`Permanently delete the key for "${deleteTarget?.partyName}"?`} confirmLabel="Delete" onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
        </div>
      </div>
    </div>
  );
}
