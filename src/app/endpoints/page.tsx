"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Copy, Globe, X, Check } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import type { SanitizedUser, DropEndpoint, DestinationType, EndpointType, FileNaming } from "@/lib/types";
import { FILE_NAMING_TOKENS } from "@/lib/file-naming";

const FILE_NAMING_PRESETS = [
  { label: "Keep original", mode: "original" as const, mask: "" },
  { label: "DateTime + Original", mode: "mask" as const, mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" },
  { label: "DateTime + UUID", mode: "mask" as const, mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}{EXT}" },
  { label: "European Date + Original", mode: "mask" as const, mask: "{DD}{MM}{YYYY}_{ORIGINAL}{EXT}" },
  { label: "UUID only", mode: "mask" as const, mask: "{UUID}{EXT}" },
  { label: "Custom", mode: "mask" as const, mask: "" },
];

interface DestOption { id: string; name: string; type: DestinationType; }

export default function EndpointsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [endpoints, setEndpoints] = useState<DropEndpoint[]>([]);
  const [destinations, setDestinations] = useState<DestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<DropEndpoint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DropEndpoint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [fSlug, setFSlug] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fType, setFType] = useState<EndpointType>("api");
  const [fDestId, setFDestId] = useState("");
  const [fSubdir, setFSubdir] = useState("");
  const [fExtensions, setFExtensions] = useState("");
  const [fMaxSize, setFMaxSize] = useState("");
  const [fEnabled, setFEnabled] = useState(true);
  const [fNamingPreset, setFNamingPreset] = useState(1); // index in PRESETS
  const [fNamingMask, setFNamingMask] = useState("");
  const [fAllowRetrieval, setFAllowRetrieval] = useState(false);
  // Notifications
  const [fNotifyOn, setFNotifyOn] = useState<"none" | "failures" | "all">("none");
  const [fNotifyEmail, setFNotifyEmail] = useState("");
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
      fetch("/api/endpoints").then((r) => r.json()),
      fetch("/api/destinations").then((r) => r.json()),
    ]).then(([ep, dest]) => {
      setEndpoints(Array.isArray(ep) ? ep : []);
      setDestinations(Array.isArray(dest) ? dest : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const openCreate = () => {
    setEditTarget(null);
    setFSlug(""); setFDesc(""); setFType("api"); setFDestId(destinations[0]?.id || ""); setFSubdir("");
    setFExtensions(""); setFMaxSize(""); setFEnabled(true); setFNamingPreset(1); setFNamingMask("");
    setFAllowRetrieval(false);
    setFNotifyOn("none"); setFNotifyEmail(""); setFormError("");
    setShowModal(true);
  };

  const insertNamingToken = (token: string) => {
    setFNamingPreset(5);
    setFNamingMask((prev) => `${prev}${token}`);
  };

  const openEdit = (e: DropEndpoint) => {
    setEditTarget(e);
    setFSlug(e.slug); setFDesc(e.description); setFType(e.type || "api"); setFDestId(e.destinationId);
    setFSubdir(e.subdirectory || ""); setFExtensions(e.allowedExtensions.join(", "));
    setFMaxSize(e.maxFileSize > 0 ? String(e.maxFileSize / 1024 / 1024) : ""); setFEnabled(e.enabled);
    setFAllowRetrieval(e.allowRetrieval || false);
    // File naming
    const fn = e.fileNaming || { mode: "mask", mask: "" };
    if (fn.mode === "original") { setFNamingPreset(0); setFNamingMask(""); }
    else {
      const idx = FILE_NAMING_PRESETS.findIndex((p) => p.mode === "mask" && p.mask === fn.mask);
      if (idx >= 0) { setFNamingPreset(idx); setFNamingMask(""); }
      else { setFNamingPreset(5); setFNamingMask(fn.mask); } // Custom
    }
    setFNotifyOn(e.notifications?.on || "none"); setFNotifyEmail(e.notifications?.email || "");
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormError("");
    const exts = fExtensions.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.startsWith(".") ? s : `.${s}`);
    const preset = FILE_NAMING_PRESETS[fNamingPreset];
    const fileNaming: FileNaming = preset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fNamingPreset === 5 ? fNamingMask : preset.mask };
    const body: Record<string, unknown> = {
      slug: fSlug, description: fDesc, type: fType, destinationId: fDestId, subdirectory: fSubdir || undefined,
      allowedExtensions: exts, maxFileSize: fMaxSize ? parseFloat(fMaxSize) * 1024 * 1024 : 0, enabled: fEnabled,
      fileNaming, allowRetrieval: fAllowRetrieval,
    };
    if (fNotifyOn !== "none" && fNotifyEmail) {
      body.notifications = { on: fNotifyOn, email: fNotifyEmail };
    } else {
      body.notifications = { on: "none", email: "" };
    }
    const url = editTarget ? `/api/endpoints/${editTarget.id}` : "/api/endpoints";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/endpoints/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchData();
  };

  const toggleEnabled = async (e: DropEndpoint) => {
    await fetch(`/api/endpoints/${e.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !e.enabled }),
    });
    fetchData();
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/api/drop/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
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
            <h1 className="page-title">Drop Endpoints</h1>
            <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> New Endpoint</button>
          </div>

          {endpoints.length === 0 && !loading ? (
            <div className="empty-state">
              <Globe className="empty-state-icon" />
              <p className="empty-state-title">No endpoints configured</p>
              <p className="empty-state-description">Create drop endpoints where external parties can upload files. To move files to/from a remote SFTP server, use Transfers instead.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Slug</th><th>Type</th><th>Description</th><th>Destination</th><th>Naming</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {endpoints.map((e) => {
                  const dest = destinations.find((d) => d.id === e.destinationId);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">/api/drop/{e.slug}</code>
                          <button className="btn btn-ghost btn-sm p-1" onClick={() => copyUrl(e.slug)} title="Copy URL">
                            {copied === e.slug ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td><span className={`badge ${e.type === "sftp-server" ? "badge-warning" : "badge-info"}`}>{e.type === "sftp-server" ? "SFTP SERVER" : "API"}</span></td>
                      <td className="text-xs text-text-muted">{e.description || "—"}</td>
                      <td className="text-xs">{dest?.name || "Unknown"}</td>
                      <td className="text-xs">{e.fileNaming?.mode === "original" ? "Original" : "Mask"}{e.allowRetrieval ? " + Get" : ""}</td>
                      <td>
                        <button onClick={() => toggleEnabled(e)} className={`badge ${e.enabled ? "badge-success" : "badge-danger"}`} style={{ cursor: "pointer" }}>
                          {e.enabled ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(e)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {showModal && (
            <ModalOverlay onClose={() => setShowModal(false)} maxWidth={520}>
                <div className="modal-header">
                  <h2>{editTarget ? "Edit Endpoint" : "New Endpoint"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  <div>
                    <label className="input-label">Slug (URL path)</label>
                    <input className="input" value={fSlug} onChange={(e) => setFSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="invoices" disabled={!!editTarget} />
                    <p className="text-xs text-text-muted mt-1">URL: /api/drop/{fSlug || "..."}</p>
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Invoice uploads from external parties" />
                  </div>
                  <div>
                    <label className="input-label">Destination</label>
                    <select className="select" value={fDestId} onChange={(e) => setFDestId(e.target.value)}>
                      {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Subdirectory (optional)</label>
                    <input className="input" value={fSubdir} onChange={(e) => setFSubdir(e.target.value)} placeholder="e.g. 2024/invoices" />
                  </div>
                  <div>
                    <label className="input-label">Allowed Extensions (comma-separated, empty = all)</label>
                    <input className="input" value={fExtensions} onChange={(e) => setFExtensions(e.target.value)} placeholder=".pdf, .xml, .csv" />
                  </div>
                  <div>
                    <label className="input-label">Max File Size (MB, empty = global default)</label>
                    <input className="input" type="number" value={fMaxSize} onChange={(e) => setFMaxSize(e.target.value)} placeholder="50" />
                  </div>
                  {/* Endpoint Type */}
                  <div>
                    <label className="input-label">Endpoint Type</label>
                    <select className="select" value={fType} onChange={(e) => setFType(e.target.value as EndpointType)}>
                      <option value="api">HTTP API (upload/download)</option>
                      <option value="sftp-server">SFTP Server (parties connect here)</option>
                    </select>
                    {fType === "sftp-server" && (
                      <p className="text-xs text-text-muted mt-1">External parties connect via SFTP to your server and drop files into <code>/{fSlug || "slug"}/</code>. They authenticate with their API key as password.</p>
                    )}
                    <p className="text-xs text-text-muted mt-1">Moving files to/from a remote SFTP server is configured under <strong>Transfers</strong>.</p>
                  </div>

                  {/* File Naming */}
                  <div>
                    <label className="input-label">File Naming</label>
                    <select className="select" value={fNamingPreset} onChange={(e) => setFNamingPreset(parseInt(e.target.value))}>
                      {FILE_NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                    </select>
                    {fNamingPreset === 5 && (
                      <>
                        <input className="input mt-2" value={fNamingMask} onChange={(e) => setFNamingMask(e.target.value)} placeholder="{YYYY}{MM}{DD}_{ORIGINAL}{EXT}" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {FILE_NAMING_TOKENS.map((token) => (
                            <button
                              key={token}
                              type="button"
                              className="badge badge-muted"
                              onClick={() => insertNamingToken(token)}
                            >
                              {token}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="text-xs text-text-muted mt-1">Tip: click a tag to insert it into your custom mask.</p>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fEnabled ? "active" : ""}`} onClick={() => setFEnabled(!fEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm text-text-secondary">Endpoint enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fAllowRetrieval ? "active" : ""}`} onClick={() => setFAllowRetrieval(!fAllowRetrieval)}><span className="toggle-knob" /></button>
                      <span className="text-sm text-text-secondary">Allow file retrieval (GET)</span>
                    </div>
                  </div>

                  {/* Email Notifications */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase">Email Notifications</p>
                    <div>
                      <label className="input-label">Notify on</label>
                      <select className="select" value={fNotifyOn} onChange={(e) => setFNotifyOn(e.target.value as "none" | "failures" | "all")}>
                        <option value="none">Disabled</option>
                        <option value="failures">Failures only</option>
                        <option value="all">All uploads (success + failure)</option>
                      </select>
                    </div>
                    {fNotifyOn !== "none" && (
                      <div>
                        <label className="input-label">Email Address</label>
                        <input className="input" type="email" value={fNotifyEmail} onChange={(e) => setFNotifyEmail(e.target.value)} placeholder="alerts@example.com" />
                      </div>
                    )}
                  </div>
                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>{editTarget ? "Save" : "Create"}</button>
                </div>
            </ModalOverlay>
          )}

          <ConfirmModal isOpen={!!deleteTarget} title="Delete Endpoint" message={`Delete endpoint "${deleteTarget?.slug}"? External parties will no longer be able to upload to this URL.`} confirmLabel="Delete" onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
        </div>
      </div>
    </div>
  );
}
