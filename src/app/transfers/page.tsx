"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, History, X, ArrowRightLeft } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import { FILE_NAMING_TOKENS } from "@/lib/file-naming";
import type {
  SanitizedUser,
  Transfer,
  TransferRun,
  TransferConflictPolicy,
  TransferDirection,
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

interface ServerOption { id: string; name: string; host: string; port: number; }
interface DestOption { id: string; name: string; type: string; }

function describeSchedule(s?: Transfer["schedule"]): string {
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

export default function TransfersPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [destinations, setDestinations] = useState<DestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Transfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [runsTarget, setRunsTarget] = useState<Transfer | null>(null);
  const [runs, setRuns] = useState<TransferRun[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fEnabled, setFEnabled] = useState(true);
  const [fConnId, setFConnId] = useState("");
  const [fDirection, setFDirection] = useState<TransferDirection>("pull");
  const [fRemotePath, setFRemotePath] = useState("");
  const [fDestId, setFDestId] = useState("");
  const [fSubdir, setFSubdir] = useState("");
  const [fSelMode, setFSelMode] = useState<TransferSelectionMode>("all");
  const [fSelValue, setFSelValue] = useState("");
  const [fSelList, setFSelList] = useState("");
  const [fSelExts, setFSelExts] = useState("");
  const [fSelRecursive, setFSelRecursive] = useState(false);
  const [fNamingPreset, setFNamingPreset] = useState(0);
  const [fNamingMask, setFNamingMask] = useState("");
  const [fConflict, setFConflict] = useState<TransferConflictPolicy>("skip");
  const [fDeleteSource, setFDeleteSource] = useState(false);
  const [fSchedEnabled, setFSchedEnabled] = useState(false);
  const [fSchedEvery, setFSchedEvery] = useState("5");
  const [fSchedUnit, setFSchedUnit] = useState<TransferScheduleUnit>("minutes");
  const [fSchedAtTime, setFSchedAtTime] = useState("");
  const [fSchedMode, setFSchedMode] = useState<"interval" | "daily">("interval");
  const [fNotifyOn, setFNotifyOn] = useState<"none" | "failures" | "all">("none");
  const [fNotifyEmail, setFNotifyEmail] = useState("");
  const [fWebhookOn, setFWebhookOn] = useState<"none" | "failures" | "all">("none");
  const [fWebhookUrl, setFWebhookUrl] = useState("");
  const [fWebhookSecret, setFWebhookSecret] = useState("");
  const [fRetryEnabled, setFRetryEnabled] = useState(false);
  const [fRetryMaxAttempts, setFRetryMaxAttempts] = useState("3");
  const [fRetryBackoffSeconds, setFRetryBackoffSeconds] = useState("5");
  const [fRetryDeadLetter, setFRetryDeadLetter] = useState("_dead-letter");
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
      fetch("/api/transfers").then((r) => r.json()),
      fetch("/api/sftp-connections").then((r) => r.json()),
      fetch("/api/destinations").then((r) => r.json()),
    ]).then(([t, s, d]) => {
      setTransfers(Array.isArray(t) ? t : []);
      setServers(Array.isArray(s) ? s : []);
      setDestinations(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFDesc(""); setFEnabled(true);
    setFConnId(servers[0]?.id || ""); setFDirection("pull"); setFRemotePath("");
    setFDestId(destinations[0]?.id || ""); setFSubdir("");
    setFSelMode("all"); setFSelValue(""); setFSelList(""); setFSelExts(""); setFSelRecursive(false);
    setFNamingPreset(0); setFNamingMask("");
    setFConflict("skip"); setFDeleteSource(false);
    setFSchedEnabled(false); setFSchedEvery("5"); setFSchedUnit("minutes"); setFSchedAtTime(""); setFSchedMode("interval");
    setFNotifyOn("none"); setFNotifyEmail("");
    setFWebhookOn("none"); setFWebhookUrl(""); setFWebhookSecret("");
    setFRetryEnabled(false); setFRetryMaxAttempts("3"); setFRetryBackoffSeconds("5"); setFRetryDeadLetter("_dead-letter");
    setFormError("");
    setShowModal(true);
  };

  const insertNamingToken = (token: string) => {
    setFNamingPreset(CUSTOM_NAMING_IDX);
    setFNamingMask((prev) => `${prev}${token}`);
  };

  const openEdit = (t: Transfer) => {
    setEditTarget(t);
    setFName(t.name); setFDesc(t.description || ""); setFEnabled(t.enabled);
    setFConnId(t.connectionId); setFDirection(t.direction); setFRemotePath(t.remotePath || "");
    setFDestId(t.destinationId); setFSubdir(t.subdirectory || "");
    setFSelMode(t.selection?.mode || "all");
    setFSelValue(t.selection?.value || "");
    setFSelList((t.selection?.list || []).join("\n"));
    setFSelExts((t.selection?.extensions || []).join(", "));
    setFSelRecursive(!!t.selection?.recursive);
    const fn = t.fileNaming || { mode: "original", mask: "" };
    if (fn.mode === "original") { setFNamingPreset(0); setFNamingMask(""); }
    else {
      const idx = NAMING_PRESETS.findIndex((p) => p.mode === "mask" && p.mask === fn.mask);
      if (idx >= 0) { setFNamingPreset(idx); setFNamingMask(""); }
      else { setFNamingPreset(CUSTOM_NAMING_IDX); setFNamingMask(fn.mask); }
    }
    setFConflict(t.conflictPolicy || "skip"); setFDeleteSource(!!t.deleteSourceAfterTransfer);
    setFSchedEnabled(!!t.schedule?.enabled); setFSchedEvery(String(t.schedule?.every || 5));
    setFSchedUnit(t.schedule?.unit || "minutes"); setFSchedAtTime(t.schedule?.atTime || "");
    setFSchedMode(t.schedule?.unit === "days" && t.schedule?.atTime ? "daily" : "interval");
    setFNotifyOn(t.notifications?.on || "none"); setFNotifyEmail(t.notifications?.email || "");
    setFWebhookOn(t.webhook?.on || "none");
    setFWebhookUrl(t.webhook?.url || "");
    setFWebhookSecret(t.webhook?.secret || "");
    setFRetryEnabled(!!t.retryPolicy?.enabled);
    setFRetryMaxAttempts(String(t.retryPolicy?.maxAttempts || 3));
    setFRetryBackoffSeconds(String(t.retryPolicy?.backoffSeconds || 5));
    setFRetryDeadLetter(t.retryPolicy?.deadLetterSubdirectory || "_dead-letter");
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormError("");
    if (fSchedEnabled && fSchedMode === "daily" && !fSchedAtTime) {
      setFormError("Choose a time of day for the daily schedule.");
      return;
    }
    const preset = NAMING_PRESETS[fNamingPreset];
    const fileNaming: FileNaming = preset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fNamingPreset === CUSTOM_NAMING_IDX ? fNamingMask : preset.mask };
    const exts = fSelExts.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.startsWith(".") ? s : `.${s}`);
    const selection: Transfer["selection"] = { mode: fSelMode, recursive: fSelRecursive };
    if (fSelMode === "single" || fSelMode === "glob") selection.value = fSelValue;
    if (fSelMode === "list") selection.list = fSelList.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (exts.length > 0) selection.extensions = exts;

    const body: Record<string, unknown> = {
      name: fName, description: fDesc, enabled: fEnabled,
      connectionId: fConnId, direction: fDirection, remotePath: fRemotePath || ".",
      destinationId: fDestId, subdirectory: fSubdir || undefined,
      selection, fileNaming, conflictPolicy: fConflict, deleteSourceAfterTransfer: fDeleteSource,
      schedule: fSchedMode === "daily"
        ? {
            enabled: fSchedEnabled,
            every: Math.max(1, parseInt(fSchedEvery) || 1),
            unit: "days",
            atTime: fSchedAtTime,
          }
        : {
            enabled: fSchedEnabled,
            every: Math.max(1, parseInt(fSchedEvery) || 1),
            unit: fSchedUnit,
            atTime: fSchedUnit === "days" && fSchedAtTime ? fSchedAtTime : undefined,
          },
      notifications: fNotifyOn !== "none" && fNotifyEmail ? { on: fNotifyOn, email: fNotifyEmail } : { on: "none", email: "" },
      webhook: fWebhookOn !== "none" && fWebhookUrl.trim()
        ? { on: fWebhookOn, url: fWebhookUrl.trim(), secret: fWebhookSecret.trim() || undefined }
        : { on: "none", url: "" },
      retryPolicy: {
        enabled: fRetryEnabled,
        maxAttempts: Math.max(1, parseInt(fRetryMaxAttempts) || 3),
        backoffSeconds: Math.max(0, parseInt(fRetryBackoffSeconds) || 5),
        deadLetterSubdirectory: fRetryDeadLetter.trim() || "_dead-letter",
      },
    };

    const url = editTarget ? `/api/transfers/${editTarget.id}` : "/api/transfers";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchData();
  };

  const handleRun = async (t: Transfer) => {
    setRunningId(t.id);
    setBanner(`Running "${t.name}"…`);
    const res = await fetch(`/api/transfers/${t.id}/run`, { method: "POST" });
    const data = await res.json();
    setRunningId(null);
    if (!res.ok) { setBanner(data.error || "Run failed"); return; }
    setBanner(`"${t.name}" ${data.status}: ${data.filesOk} ok, ${data.filesSkipped} skipped, ${data.filesFailed} failed`);
    fetchData();
    if (runsTarget?.id === t.id) openRuns(t);
  };

  const openRuns = async (t: Transfer) => {
    setRunsTarget(t);
    const res = await fetch(`/api/transfers/${t.id}/runs`);
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
  };

  const toggleEnabled = async (t: Transfer) => {
    await fetch(`/api/transfers/${t.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/transfers/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchData();
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const serverName = (id: string) => servers.find((s) => s.id === id)?.name || "Unknown";
  const destName = (id: string) => destinations.find((d) => d.id === id)?.name || "Unknown";
  const noPrereqs = servers.length === 0 || destinations.length === 0;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Transfers</h1>
            <button className="btn btn-primary" onClick={openCreate} disabled={noPrereqs}><Plus className="w-4 h-4" /> New Transfer</button>
          </div>

          {banner && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{banner}</span>
              <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {noPrereqs && !loading && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-muted text-sm text-text-secondary">
              Transfers need at least one SFTP Server and one Destination. Add those first.
            </div>
          )}

          {transfers.length === 0 && !loading ? (
            <div className="empty-state">
              <ArrowRightLeft className="empty-state-icon" />
              <p className="empty-state-title">No transfers configured</p>
              <p className="empty-state-description">Create a transfer to pull files from, or push files to, a remote SFTP server.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Direction</th><th>Server</th><th>Destination</th><th>Schedule</th><th>Last Run</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-text-primary">{t.name}</td>
                    <td><span className="badge badge-info">{t.direction === "pull" ? "Pull ↓" : "Push ↑"}</span></td>
                    <td className="text-xs">{serverName(t.connectionId)}<span className="text-text-muted"> :{t.remotePath}</span></td>
                    <td className="text-xs">{destName(t.destinationId)}{t.subdirectory ? `/${t.subdirectory}` : ""}</td>
                    <td className="text-xs">{describeSchedule(t.schedule)}</td>
                    <td className="text-xs">{t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : "—"}</td>
                    <td>
                      <button onClick={() => toggleEnabled(t)} className={`badge ${t.enabled ? "badge-success" : "badge-danger"}`} style={{ cursor: "pointer" }}>
                        {t.enabled ? "Active" : "Disabled"}
                      </button>
                      {t.lastStatus && <span className={`badge ${statusBadgeClass(t.lastStatus)} ml-1`}>{t.lastStatus}</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRun(t)} disabled={runningId === t.id} title="Run now"><Play className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openRuns(t)} title="Run history"><History className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(t)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
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
                  <h2>{editTarget ? "Edit Transfer" : "New Transfer"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. POM inbound" />
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="input-label">Direction</label>
                      <select className="select" value={fDirection} onChange={(e) => setFDirection(e.target.value as TransferDirection)}>
                        <option value="pull">Pull (remote → destination)</option>
                        <option value="push">Push (destination → remote)</option>
                      </select>
                    </div>
                    <div>
                      <label className="input-label">SFTP Server</label>
                      <select className="select" value={fConnId} onChange={(e) => setFConnId(e.target.value)}>
                        {servers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="input-label">Remote Path ({fDirection === "pull" ? "source" : "target"} on server)</label>
                    <input className="input" value={fRemotePath} onChange={(e) => setFRemotePath(e.target.value)} placeholder="/outbound" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="input-label">Destination ({fDirection === "pull" ? "target" : "source"})</label>
                      <select className="select" value={fDestId} onChange={(e) => setFDestId(e.target.value)}>
                        {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">Subdirectory (optional)</label>
                      <input className="input" value={fSubdir} onChange={(e) => setFSubdir(e.target.value)} placeholder="e.g. 2024" />
                    </div>
                  </div>

                  {/* Selection */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase">File Selection</p>
                    <div>
                      <label className="input-label">Mode</label>
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
                        <input className="input" value={fSelValue} onChange={(e) => setFSelValue(e.target.value)} placeholder={fSelMode === "single" ? "invoice.xml" : "*.xml"} />
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
                      <input className="input" value={fSelExts} onChange={(e) => setFSelExts(e.target.value)} placeholder=".xml, .pdf" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fSelRecursive ? "active" : ""}`} onClick={() => setFSelRecursive(!fSelRecursive)}><span className="toggle-knob" /></button>
                      <span className="text-sm text-text-secondary">Recurse into subdirectories</span>
                    </div>
                  </div>

                  {/* File naming */}
                  <div>
                    <label className="input-label">File Naming (applied on the target)</label>
                    <select className="select" value={fNamingPreset} onChange={(e) => setFNamingPreset(parseInt(e.target.value))}>
                      {NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                    </select>
                    {fNamingPreset === CUSTOM_NAMING_IDX && (
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
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="input-label">On filename conflict</label>
                      <select className="select" value={fConflict} onChange={(e) => setFConflict(e.target.value as TransferConflictPolicy)}>
                        <option value="skip">Skip (keep existing)</option>
                        <option value="rename">Rename (add suffix)</option>
                        <option value="overwrite">Overwrite</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <div className="flex items-center gap-2">
                        <button className={`toggle ${fDeleteSource ? "active" : ""}`} onClick={() => setFDeleteSource(!fDeleteSource)}><span className="toggle-knob" /></button>
                        <span className="text-sm text-text-secondary">Delete source after transfer</span>
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fSchedEnabled ? "active" : ""}`} onClick={() => setFSchedEnabled(!fSchedEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Run on a schedule</span>
                    </div>
                    {fSchedEnabled && (
                      <div className="space-y-3">
                        <div>
                          <label className="input-label">Schedule type</label>
                          <select
                            className="select"
                            value={fSchedMode}
                            onChange={(e) => {
                              const mode = e.target.value as "interval" | "daily";
                              setFSchedMode(mode);
                              if (mode === "daily") {
                                setFSchedUnit("days");
                                setFSchedEvery("1");
                                if (!fSchedAtTime) setFSchedAtTime("13:30");
                              } else {
                                setFSchedEvery("5");
                                setFSchedUnit("minutes");
                                setFSchedAtTime("");
                              }
                            }}
                          >
                            <option value="interval">Repeat every interval</option>
                            <option value="daily">Daily at a specific time (HH:MM)</option>
                          </select>
                        </div>
                        {fSchedMode === "daily" ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="input-label">At time (24h)</label>
                                <input className="input" type="time" value={fSchedAtTime} onChange={(e) => setFSchedAtTime(e.target.value)} />
                              </div>
                              <div>
                                <label className="input-label">Every (days)</label>
                                <input className="input" type="number" min={1} value={fSchedEvery} onChange={(e) => setFSchedEvery(e.target.value)} />
                              </div>
                            </div>
                            <p className="text-xs text-text-muted">Runs at {fSchedAtTime || "the chosen time"} {(parseInt(fSchedEvery) || 1) > 1 ? `every ${fSchedEvery} days` : "every day"}.</p>
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="input-label">Every</label>
                                <input className="input" type="number" min={1} value={fSchedEvery} onChange={(e) => setFSchedEvery(e.target.value)} />
                              </div>
                              <div>
                                <label className="input-label">Unit</label>
                                <select
                                  className="select"
                                  value={fSchedUnit}
                                  onChange={(e) => {
                                    const unit = e.target.value as TransferScheduleUnit;
                                    setFSchedUnit(unit);
                                    if (unit !== "days") setFSchedAtTime("");
                                  }}
                                >
                                  <option value="seconds">Seconds</option>
                                  <option value="minutes">Minutes</option>
                                  <option value="hours">Hours</option>
                                  <option value="days">Days</option>
                                </select>
                              </div>
                            </div>
                            {fSchedUnit === "days" && (
                              <div>
                                <label className="input-label">At time (optional HH:MM)</label>
                                <input className="input" type="time" value={fSchedAtTime} onChange={(e) => setFSchedAtTime(e.target.value)} />
                                <p className="text-xs text-text-muted mt-1">Set this to run every {parseInt(fSchedEvery) || 1} day(s) at a fixed time.</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Retry + Dead-letter */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fRetryEnabled ? "active" : ""}`} onClick={() => setFRetryEnabled(!fRetryEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Retry failed file operations and dead-letter exhausted failures</span>
                    </div>
                    {fRetryEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="input-label">Max Attempts</label>
                            <input className="input" type="number" min={1} value={fRetryMaxAttempts} onChange={(e) => setFRetryMaxAttempts(e.target.value)} />
                          </div>
                          <div>
                            <label className="input-label">Backoff Seconds</label>
                            <input className="input" type="number" min={0} value={fRetryBackoffSeconds} onChange={(e) => setFRetryBackoffSeconds(e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="input-label">Dead-letter Subdirectory</label>
                          <input className="input" value={fRetryDeadLetter} onChange={(e) => setFRetryDeadLetter(e.target.value)} placeholder="_dead-letter" />
                        </div>
                      </>
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

                  {/* Webhook Notifications */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase">Webhook Notifications</p>
                    <div>
                      <label className="input-label">Notify on</label>
                      <select className="select" value={fWebhookOn} onChange={(e) => setFWebhookOn(e.target.value as "none" | "failures" | "all")}>
                        <option value="none">Disabled</option>
                        <option value="failures">Failures only</option>
                        <option value="all">Every run</option>
                      </select>
                    </div>
                    {fWebhookOn !== "none" && (
                      <>
                        <div>
                          <label className="input-label">Webhook URL</label>
                          <input className="input" value={fWebhookUrl} onChange={(e) => setFWebhookUrl(e.target.value)} placeholder="https://example.com/webhooks/filedrop" />
                        </div>
                        <div>
                          <label className="input-label">Webhook Secret (optional)</label>
                          <input className="input" value={fWebhookSecret} onChange={(e) => setFWebhookSecret(e.target.value)} placeholder="shared secret for signature verification" />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button className={`toggle ${fEnabled ? "active" : ""}`} onClick={() => setFEnabled(!fEnabled)}><span className="toggle-knob" /></button>
                    <span className="text-sm text-text-secondary">Transfer enabled</span>
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
                      <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Files</th><th>Bytes</th></tr></thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id}>
                            <td className="text-xs">{new Date(r.startedAt).toLocaleString()}</td>
                            <td className="text-xs">{r.trigger}</td>
                            <td><span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                            <td className="text-xs">{r.filesOk}/{r.filesTotal}{r.filesFailed > 0 ? ` (${r.filesFailed} failed)` : ""}</td>
                            <td className="text-xs">{r.bytes}</td>
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
            title="Delete Transfer"
            message={`Delete transfer "${deleteTarget?.name}"? Its schedule will be removed. Run history is retained.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
