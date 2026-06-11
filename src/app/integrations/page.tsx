"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, History, X, Zap } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import type {
  SanitizedUser,
  Integration,
  IntegrationRun,
  TransferScheduleUnit,
  TransferSelectionMode,
  FileNaming,
} from "@/lib/types";

const NAMING_PRESETS = [
  { label: "Keep original", mode: "original" as const, mask: "" },
  { label: "DateTime + Original", mode: "mask" as const, mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" },
  { label: "DateTime + UUID", mode: "mask" as const, mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}{EXT}" },
  { label: "UUID only", mode: "mask" as const, mask: "{UUID}{EXT}" },
  { label: "Custom", mode: "mask" as const, mask: "" },
];
const CUSTOM_NAMING_IDX = 4;

interface SoapOption { id: string; name: string; url: string; }
interface FtpOption { id: string; name: string; host: string; port: number; }
interface DestOption { id: string; name: string; type: string; }

function describeSchedule(s?: Integration["schedule"]): string {
  if (!s || !s.enabled) return "Manual only";
  if (s.unit === "days" && s.atTime) return s.every === 1 ? `Daily at ${s.atTime}` : `Every ${s.every} days at ${s.atTime}`;
  const unit = s.every === 1 ? s.unit.replace(/s$/, "") : s.unit;
  return `Every ${s.every} ${unit}`;
}

function statusBadgeClass(status?: string): string {
  switch (status) {
    case "success": return "badge-success";
    case "partial": return "badge-warning";
    case "failed": return "badge-danger";
    case "running": return "badge-info";
    default: return "badge-muted";
  }
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [soaps, setSoaps] = useState<SoapOption[]>([]);
  const [ftps, setFtps] = useState<FtpOption[]>([]);
  const [destinations, setDestinations] = useState<DestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Integration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [runsTarget, setRunsTarget] = useState<Integration | null>(null);
  const [runs, setRuns] = useState<IntegrationRun[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state — basic
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fEnabled, setFEnabled] = useState(true);
  // source selection
  const [fSourceDestId, setFSourceDestId] = useState("");
  const [fSourceSubdir, setFSourceSubdir] = useState("");
  const [fSelMode, setFSelMode] = useState<TransferSelectionMode>("all");
  const [fSelValue, setFSelValue] = useState("");
  const [fSelList, setFSelList] = useState("");
  const [fSelExts, setFSelExts] = useState("");
  const [fSelRecursive, setFSelRecursive] = useState(false);
  // soap
  const [fSoapId, setFSoapId] = useState("");
  // response save
  const [fSaveResponse, setFSaveResponse] = useState(false);
  const [fResponseDestId, setFResponseDestId] = useState("");
  const [fResponseSubdir, setFResponseSubdir] = useState("");
  const [fNamingPreset, setFNamingPreset] = useState(0);
  const [fNamingMask, setFNamingMask] = useState("");
  // ftp delivery
  const [fFtpEnabled, setFFtpEnabled] = useState(false);
  const [fFtpId, setFFtpId] = useState("");
  const [fFtpRemotePath, setFFtpRemotePath] = useState("");
  // delete source
  const [fDeleteSource, setFDeleteSource] = useState(false);
  // schedule
  const [fSchedEnabled, setFSchedEnabled] = useState(false);
  const [fSchedEvery, setFSchedEvery] = useState("5");
  const [fSchedUnit, setFSchedUnit] = useState<TransferScheduleUnit>("minutes");
  const [fSchedAtTime, setFSchedAtTime] = useState("");
  // notifications
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
      fetch("/api/integrations").then((r) => r.json()),
      fetch("/api/soap-connections").then((r) => r.json()),
      fetch("/api/ftp-connections").then((r) => r.json()),
      fetch("/api/destinations").then((r) => r.json()),
    ]).then(([i, s, f, d]) => {
      setIntegrations(Array.isArray(i) ? i : []);
      setSoaps(Array.isArray(s) ? s : []);
      setFtps(Array.isArray(f) ? f : []);
      setDestinations(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFDesc(""); setFEnabled(true);
    setFSourceDestId(destinations[0]?.id || ""); setFSourceSubdir("");
    setFSelMode("all"); setFSelValue(""); setFSelList(""); setFSelExts(".xml"); setFSelRecursive(false);
    setFSoapId(soaps[0]?.id || "");
    setFSaveResponse(false); setFResponseDestId(destinations[0]?.id || ""); setFResponseSubdir("");
    setFNamingPreset(0); setFNamingMask("");
    setFFtpEnabled(false); setFFtpId(ftps[0]?.id || ""); setFFtpRemotePath("");
    setFDeleteSource(false);
    setFSchedEnabled(false); setFSchedEvery("5"); setFSchedUnit("minutes"); setFSchedAtTime("");
    setFNotifyOn("none"); setFNotifyEmail(""); setFormError("");
    setShowModal(true);
  };

  const openEdit = (i: Integration) => {
    setEditTarget(i);
    setFName(i.name); setFDesc(i.description || ""); setFEnabled(i.enabled);
    setFSourceDestId(i.sourceDestinationId); setFSourceSubdir(i.sourceSubdirectory || "");
    setFSelMode(i.sourceSelection?.mode || "all");
    setFSelValue(i.sourceSelection?.value || "");
    setFSelList((i.sourceSelection?.list || []).join("\n"));
    setFSelExts((i.sourceSelection?.extensions || []).join(", "));
    setFSelRecursive(!!i.sourceSelection?.recursive);
    setFSoapId(i.soapConnectionId);
    setFSaveResponse(!!i.responseDestinationId);
    setFResponseDestId(i.responseDestinationId || destinations[0]?.id || "");
    setFResponseSubdir(i.responseSubdirectory || "");
    const fn = i.responseFileNaming || { mode: "original", mask: "" };
    if (fn.mode === "original") { setFNamingPreset(0); setFNamingMask(""); }
    else {
      const idx = NAMING_PRESETS.findIndex((p) => p.mode === "mask" && p.mask === fn.mask);
      if (idx >= 0) { setFNamingPreset(idx); setFNamingMask(""); }
      else { setFNamingPreset(CUSTOM_NAMING_IDX); setFNamingMask(fn.mask); }
    }
    setFFtpEnabled(!!i.ftpConnectionId);
    setFFtpId(i.ftpConnectionId || ftps[0]?.id || "");
    setFFtpRemotePath(i.ftpRemotePath || "");
    setFDeleteSource(!!i.deleteSourceAfterRun);
    setFSchedEnabled(!!i.schedule?.enabled); setFSchedEvery(String(i.schedule?.every || 5));
    setFSchedUnit(i.schedule?.unit || "minutes"); setFSchedAtTime(i.schedule?.atTime || "");
    setFNotifyOn(i.notifications?.on || "none"); setFNotifyEmail(i.notifications?.email || "");
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormError("");
    const preset = NAMING_PRESETS[fNamingPreset];
    const responseFileNaming: FileNaming = preset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fNamingPreset === CUSTOM_NAMING_IDX ? fNamingMask : preset.mask };
    const exts = fSelExts.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.startsWith(".") ? s : `.${s}`);
    const sourceSelection: Integration["sourceSelection"] = { mode: fSelMode, recursive: fSelRecursive };
    if (fSelMode === "single" || fSelMode === "glob") sourceSelection.value = fSelValue;
    if (fSelMode === "list") sourceSelection.list = fSelList.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (exts.length > 0) sourceSelection.extensions = exts;

    const body: Record<string, unknown> = {
      name: fName, description: fDesc, enabled: fEnabled,
      sourceDestinationId: fSourceDestId, sourceSubdirectory: fSourceSubdir || undefined,
      sourceSelection,
      soapConnectionId: fSoapId,
      responseDestinationId: fSaveResponse ? fResponseDestId : "",
      responseSubdirectory: fSaveResponse ? (fResponseSubdir || undefined) : undefined,
      responseFileNaming,
      ftpConnectionId: fFtpEnabled ? fFtpId : "",
      ftpRemotePath: fFtpEnabled ? (fFtpRemotePath || undefined) : undefined,
      deleteSourceAfterRun: fDeleteSource,
      schedule: {
        enabled: fSchedEnabled,
        every: Math.max(1, parseInt(fSchedEvery) || 1),
        unit: fSchedUnit,
        atTime: fSchedUnit === "days" && fSchedAtTime ? fSchedAtTime : undefined,
      },
      notifications: fNotifyOn !== "none" && fNotifyEmail ? { on: fNotifyOn, email: fNotifyEmail } : { on: "none", email: "" },
    };

    const url = editTarget ? `/api/integrations/${editTarget.id}` : "/api/integrations";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchData();
  };

  const handleRun = async (i: Integration) => {
    setRunningId(i.id);
    setBanner(`Running "${i.name}"…`);
    const res = await fetch(`/api/integrations/${i.id}/run`, { method: "POST" });
    const data = await res.json();
    setRunningId(null);
    if (!res.ok) { setBanner(data.error || "Run failed"); return; }
    setBanner(`"${i.name}" ${data.status}: ${data.filesOk} ok, ${data.filesSkipped} skipped, ${data.filesFailed} failed`);
    fetchData();
    if (runsTarget?.id === i.id) openRuns(i);
  };

  const openRuns = async (i: Integration) => {
    setRunsTarget(i);
    const res = await fetch(`/api/integrations/${i.id}/runs`);
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
  };

  const toggleEnabled = async (i: Integration) => {
    await fetch(`/api/integrations/${i.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !i.enabled }),
    });
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/integrations/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchData();
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const soapName = (id: string) => soaps.find((s) => s.id === id)?.name || "Unknown";
  const soapUrl = (id: string) => soaps.find((s) => s.id === id)?.url || "";
  const destName = (id: string) => destinations.find((d) => d.id === id)?.name || "Unknown";
  const noPrereqs = destinations.length === 0 || soaps.length === 0;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Integrations</h1>
            <button className="btn btn-primary" onClick={openCreate} disabled={noPrereqs}><Plus className="w-4 h-4" /> New Integration</button>
          </div>

          {banner && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{banner}</span>
              <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {noPrereqs && !loading && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-muted text-sm text-text-secondary">
              Integrations need at least one Destination and one SOAP Endpoint. Add those first.
            </div>
          )}

          {integrations.length === 0 && !loading ? (
            <div className="empty-state">
              <Zap className="empty-state-icon" />
              <p className="empty-state-title">No integrations configured</p>
              <p className="empty-state-description">Create an integration to read XML files, POST them to a SOAP endpoint, and deliver the responses.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>SOAP Endpoint</th><th>Source</th><th>Schedule</th><th>Last Run</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {integrations.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium text-text-primary">{i.name}</td>
                    <td className="text-xs">{soapName(i.soapConnectionId)}<span className="text-text-muted"> {soapUrl(i.soapConnectionId)}</span></td>
                    <td className="text-xs">{destName(i.sourceDestinationId)}{i.sourceSubdirectory ? `/${i.sourceSubdirectory}` : ""}</td>
                    <td className="text-xs">{describeSchedule(i.schedule)}</td>
                    <td className="text-xs">{i.lastRunAt ? new Date(i.lastRunAt).toLocaleString() : "—"}</td>
                    <td>
                      <button onClick={() => toggleEnabled(i)} className={`badge ${i.enabled ? "badge-success" : "badge-danger"}`} style={{ cursor: "pointer" }}>
                        {i.enabled ? "Active" : "Disabled"}
                      </button>
                      {i.lastStatus && <span className={`badge ${statusBadgeClass(i.lastStatus)} ml-1`}>{i.lastStatus}</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRun(i)} disabled={runningId === i.id} title="Run now"><Play className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openRuns(i)} title="Run history"><History className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(i)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(i)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
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
                  <h2>{editTarget ? "Edit Integration" : "New Integration"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  {/* Basic */}
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. SAP FMIS post" />
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Optional" />
                  </div>

                  {/* Source selection */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase">Source</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="input-label">Source Destination</label>
                        <select className="select" value={fSourceDestId} onChange={(e) => setFSourceDestId(e.target.value)}>
                          {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Subdirectory (optional)</label>
                        <input className="input" value={fSourceSubdir} onChange={(e) => setFSourceSubdir(e.target.value)} placeholder="e.g. inbound" />
                      </div>
                    </div>
                    <div>
                      <label className="input-label">File Selection Mode</label>
                      <select className="select" value={fSelMode} onChange={(e) => setFSelMode(e.target.value as TransferSelectionMode)}>
                        <option value="all">All files in folder</option>
                        <option value="single">Single file (exact name)</option>
                        <option value="glob">Glob pattern (e.g. *.xml)</option>
                        <option value="list">Explicit list</option>
                      </select>
                    </div>
                    {(fSelMode === "single" || fSelMode === "glob") && (
                      <div>
                        <label className="input-label">{fSelMode === "single" ? "Filename" : "Pattern"}</label>
                        <input className="input" value={fSelValue} onChange={(e) => setFSelValue(e.target.value)} placeholder={fSelMode === "single" ? "request.xml" : "*.xml"} />
                      </div>
                    )}
                    {fSelMode === "list" && (
                      <div>
                        <label className="input-label">Filenames (one per line or comma-separated)</label>
                        <textarea className="input" rows={3} value={fSelList} onChange={(e) => setFSelList(e.target.value)} placeholder={"a.xml\nb.xml"} />
                      </div>
                    )}
                    <div>
                      <label className="input-label">Extension filter (optional, comma-separated)</label>
                      <input className="input" value={fSelExts} onChange={(e) => setFSelExts(e.target.value)} placeholder=".xml" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fSelRecursive ? "active" : ""}`} onClick={() => setFSelRecursive(!fSelRecursive)}><span className="toggle-knob" /></button>
                      <span className="text-sm text-text-secondary">Recurse into subdirectories</span>
                    </div>
                  </div>

                  {/* SOAP picker */}
                  <div>
                    <label className="input-label">SOAP Endpoint</label>
                    <select className="select" value={fSoapId} onChange={(e) => setFSoapId(e.target.value)}>
                      {soaps.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.url})</option>)}
                    </select>
                  </div>

                  {/* Optional response save */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fSaveResponse ? "active" : ""}`} onClick={() => setFSaveResponse(!fSaveResponse)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Save SOAP response locally</span>
                    </div>
                    {fSaveResponse && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="input-label">Response Destination</label>
                            <select className="select" value={fResponseDestId} onChange={(e) => setFResponseDestId(e.target.value)}>
                              {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="input-label">Subdirectory (optional)</label>
                            <input className="input" value={fResponseSubdir} onChange={(e) => setFResponseSubdir(e.target.value)} placeholder="e.g. responses" />
                          </div>
                        </div>
                        <div>
                          <label className="input-label">Response File Naming</label>
                          <select className="select" value={fNamingPreset} onChange={(e) => setFNamingPreset(parseInt(e.target.value))}>
                            {NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                          </select>
                          {fNamingPreset === CUSTOM_NAMING_IDX && (
                            <input className="input mt-2" value={fNamingMask} onChange={(e) => setFNamingMask(e.target.value)} placeholder="{YYYY}{MM}{DD}_{ORIGINAL}{EXT}" />
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Optional FTP delivery */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fFtpEnabled ? "active" : ""}`} onClick={() => setFFtpEnabled(!fFtpEnabled)} disabled={ftps.length === 0}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Deliver response to FTP {ftps.length === 0 ? "(no FTP servers configured)" : ""}</span>
                    </div>
                    {fFtpEnabled && ftps.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="input-label">FTP Server</label>
                          <select className="select" value={fFtpId} onChange={(e) => setFFtpId(e.target.value)}>
                            {ftps.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.host})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Remote Path</label>
                          <input className="input" value={fFtpRemotePath} onChange={(e) => setFFtpRemotePath(e.target.value)} placeholder="/outbound" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Delete source */}
                  <div className="flex items-center gap-2">
                    <button className={`toggle ${fDeleteSource ? "active" : ""}`} onClick={() => setFDeleteSource(!fDeleteSource)}><span className="toggle-knob" /></button>
                    <span className="text-sm text-text-secondary">Delete source file after successful SOAP call</span>
                  </div>

                  {/* Schedule */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fSchedEnabled ? "active" : ""}`} onClick={() => setFSchedEnabled(!fSchedEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Run on a schedule</span>
                    </div>
                    {fSchedEnabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="input-label">Every</label>
                          <input className="input" type="number" min={1} value={fSchedEvery} onChange={(e) => setFSchedEvery(e.target.value)} />
                        </div>
                        <div>
                          <label className="input-label">Unit</label>
                          <select className="select" value={fSchedUnit} onChange={(e) => setFSchedUnit(e.target.value as TransferScheduleUnit)}>
                            <option value="seconds">Seconds</option>
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                        {fSchedUnit === "days" && (
                          <div className="col-span-2">
                            <label className="input-label">At time (HH:MM, optional)</label>
                            <input className="input" value={fSchedAtTime} onChange={(e) => setFSchedAtTime(e.target.value)} placeholder="03:00" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notifications */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase">Email Notifications</p>
                    <div>
                      <label className="input-label">Notify on</label>
                      <select className="select" value={fNotifyOn} onChange={(e) => setFNotifyOn(e.target.value as "none" | "failures" | "all")}>
                        <option value="none">Disabled</option>
                        <option value="failures">Failures only</option>
                        <option value="all">Every run</option>
                      </select>
                    </div>
                    {fNotifyOn !== "none" && (
                      <div>
                        <label className="input-label">Email Address</label>
                        <input className="input" type="email" value={fNotifyEmail} onChange={(e) => setFNotifyEmail(e.target.value)} placeholder="alerts@example.com" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button className={`toggle ${fEnabled ? "active" : ""}`} onClick={() => setFEnabled(!fEnabled)}><span className="toggle-knob" /></button>
                    <span className="text-sm text-text-secondary">Integration enabled</span>
                  </div>
                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>{editTarget ? "Save Changes" : "Create"}</button>
                </div>
            </ModalOverlay>
          )}

          {/* Run history modal */}
          {runsTarget && (
            <ModalOverlay onClose={() => setRunsTarget(null)} maxWidth={620}>
                <div className="modal-header">
                  <h2>Run History — {runsTarget.name}</h2>
                  <button onClick={() => setRunsTarget(null)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3 flex justify-end">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRun(runsTarget)} disabled={runningId === runsTarget.id}><Play className="w-3.5 h-3.5" /> Run now</button>
                  </div>
                  {runs.length === 0 ? (
                    <p className="text-sm text-text-muted">No runs yet.</p>
                  ) : (
                    <table className="data-table">
                      <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Files</th></tr></thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id}>
                            <td className="text-xs">{new Date(r.startedAt).toLocaleString()}</td>
                            <td className="text-xs">{r.trigger}</td>
                            <td><span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                            <td className="text-xs">{r.filesOk}/{r.filesTotal}{r.filesFailed > 0 ? ` (${r.filesFailed} failed)` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setRunsTarget(null)}>Close</button>
                </div>
            </ModalOverlay>
          )}

          <ConfirmModal
            isOpen={!!deleteTarget}
            title="Delete Integration"
            message={`Delete integration "${deleteTarget?.name}"? Its schedule will be removed. Run history is retained.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
