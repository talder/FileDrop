"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, TestTube, X, Globe, Copy } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import type { SanitizedUser } from "@/lib/types";

interface SoapRow {
  id: string;
  name: string;
  url: string;
  username: string;
  hasPassword: boolean;
  soapAction: string;
  envelopeMode: "raw" | "template";
  envelopeTemplate?: string;
  extractBody: boolean;
  ignoreTlsErrors: boolean;
  createdAt: string;
}

export default function SoapConnectionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [rows, setRows] = useState<SoapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<SoapRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SoapRow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fUser, setFUser] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fSoapAction, setFSoapAction] = useState("");
  const [fEnvelopeMode, setFEnvelopeMode] = useState<"raw" | "template">("raw");
  const [fTemplate, setFTemplate] = useState("");
  const [fExtractBody, setFExtractBody] = useState(false);
  const [fIgnoreTls, setFIgnoreTls] = useState(false);
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

  const fetchRows = useCallback(() => {
    fetch("/api/soap-connections").then((r) => r.json()).then((data) => {
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchRows(); }, [user, fetchRows]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFUrl(""); setFUser(""); setFPassword(""); setFSoapAction("");
    setFEnvelopeMode("raw"); setFTemplate(""); setFExtractBody(false); setFIgnoreTls(false);
    setTestResult(null); setFormError("");
    setShowModal(true);
  };

  const fillFormFromConnection = (s: SoapRow) => {
    setFName(s.name); setFUrl(s.url); setFUser(s.username); setFPassword("");
    setFSoapAction(s.soapAction); setFEnvelopeMode(s.envelopeMode); setFTemplate(s.envelopeTemplate || "");
    setFExtractBody(s.extractBody); setFIgnoreTls(s.ignoreTlsErrors);
  };

  const openEdit = (s: SoapRow) => {
    setEditTarget(s);
    fillFormFromConnection(s);
    setTestResult(null); setFormError("");
    setShowModal(true);
  };

  // Duplicate: prefill the create modal from an existing endpoint (no id), so
  // saving POSTs a brand-new endpoint. The password is never sent to the
  // client, so it must be re-entered. Name is pre-suffixed to avoid the
  // server's duplicate-name rejection; the user can adjust before saving.
  const openDuplicate = (s: SoapRow) => {
    setEditTarget(null);
    fillFormFromConnection(s);
    setFName(`Copy of ${s.name}`);
    setTestResult(null); setFormError("");
    setShowModal(true);
  };

  const buildBody = () => {
    const body: Record<string, unknown> = {
      name: fName,
      url: fUrl,
      username: fUser,
      soapAction: fSoapAction,
      envelopeMode: fEnvelopeMode,
      envelopeTemplate: fEnvelopeMode === "template" ? fTemplate : "",
      extractBody: fExtractBody,
      ignoreTlsErrors: fIgnoreTls,
    };
    if (fPassword) body.password = fPassword;
    return body;
  };

  const handleSubmit = async () => {
    setFormError("");
    const url = editTarget ? `/api/soap-connections/${editTarget.id}` : "/api/soap-connections";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody()) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchRows();
  };

  const formatResult = (data: { success: boolean; statusCode?: number; responseTimeMs?: number; error?: string }) =>
    data.success
      ? `OK — HTTP ${data.statusCode ?? "?"} in ${data.responseTimeMs ?? "?"}ms`
      : `Failed: ${data.error || (data.statusCode ? `HTTP ${data.statusCode}` : "unknown error")}`;

  const handleTestInModal = async () => {
    setTesting(true);
    setTestResult(null);
    const id = editTarget ? editTarget.id : "new";
    const res = await fetch(`/api/soap-connections/${id}/test`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody()),
    });
    const data = await res.json();
    setTesting(false);
    setTestResult(formatResult(data));
  };

  const handleTestRow = async (s: SoapRow) => {
    setBanner(`Testing ${s.name}…`);
    const res = await fetch(`/api/soap-connections/${s.id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    setBanner(`${s.name}: ${formatResult(data)}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/soap-connections/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) setBanner(data.error || "Delete failed");
    setDeleteTarget(null);
    fetchRows();
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
            <h1 className="page-title">SOAP Endpoints</h1>
            <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Add Endpoint</button>
          </div>

          {banner && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{banner}</span>
              <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {rows.length === 0 && !loading ? (
            <div className="empty-state">
              <Globe className="empty-state-icon" />
              <p className="empty-state-title">No SOAP endpoints</p>
              <p className="empty-state-description">Add a reusable SOAP/HTTP endpoint, then use it from one or more Integrations.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>URL</th><th>Username</th><th>Envelope</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-text-primary">{s.name}</td>
                    <td className="font-mono text-xs">{s.url}</td>
                    <td className="text-xs">{s.username}</td>
                    <td className="text-xs">
                      <span className="badge badge-muted">{s.envelopeMode}</span>
                      {s.extractBody && <span className="badge badge-muted">extract body</span>}
                      {s.ignoreTlsErrors && <span className="badge badge-muted">insecure TLS</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTestRow(s)} title="Test"><TestTube className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDuplicate(s)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(s)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showModal && (
            <ModalOverlay onClose={() => setShowModal(false)} maxWidth={560}>
                <div className="modal-header">
                  <h2>{editTarget ? "Edit SOAP Endpoint" : "New SOAP Endpoint"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. SAP FMIS" />
                  </div>
                  <div>
                    <label className="input-label">URL</label>
                    <input className="input" value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://host:8443/sap/bc/srt/..." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="input-label">Username</label>
                      <input className="input" value={fUser} onChange={(e) => setFUser(e.target.value)} />
                    </div>
                    <div>
                      <label className="input-label">Password {editTarget ? "(leave empty to keep)" : ""}</label>
                      <input className="input" type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} placeholder={editTarget?.hasPassword ? "••••••••" : ""} />
                    </div>
                  </div>
                  <div>
                    <label className="input-label">SOAPAction</label>
                    <input className="input" value={fSoapAction} onChange={(e) => setFSoapAction(e.target.value)} placeholder="(optional)" />
                  </div>
                  <div>
                    <label className="input-label">Envelope mode</label>
                    <select className="input" value={fEnvelopeMode} onChange={(e) => setFEnvelopeMode(e.target.value === "template" ? "template" : "raw")}>
                      <option value="raw">Raw — source file is the full envelope</option>
                      <option value="template">Template — wrap payload at {"{PAYLOAD}"}</option>
                    </select>
                  </div>
                  {fEnvelopeMode === "template" && (
                    <div>
                      <label className="input-label">Envelope template</label>
                      <textarea className="input" rows={4} value={fTemplate} onChange={(e) => setFTemplate(e.target.value)} placeholder={"<soap:Envelope>...{PAYLOAD}...</soap:Envelope>"} />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fExtractBody} onChange={(e) => setFExtractBody(e.target.checked)} />
                    Extract SOAP body from response before saving
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fIgnoreTls} onChange={(e) => setFIgnoreTls(e.target.checked)} />
                    Ignore TLS certificate errors (self-signed certs)
                  </label>
                  <div className="p-3 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="input-label flex-1">Test endpoint with an empty envelope</span>
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

          <ConfirmModal
            isOpen={!!deleteTarget}
            title="Delete SOAP Endpoint"
            message={`Delete "${deleteTarget?.name}"? Integrations using this endpoint must be removed or reassigned first.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
