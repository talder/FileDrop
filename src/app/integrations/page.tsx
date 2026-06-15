"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, History, X, Zap, Copy } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import { FILE_NAMING_TOKENS } from "@/lib/file-naming";
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
  { label: "Original + DateTime", mode: "mask" as const, mask: "{ORIGINAL}_{YYYY}{MM}{DD}{HH}{mm}{ss}{EXT}" },
  { label: "Custom", mode: "mask" as const, mask: "" },
];
const CUSTOM_NAMING_IDX = 5;

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
  // outbound (source) file naming sent to the SOAP request
  const [fOutboundNamingPreset, setFOutboundNamingPreset] = useState(0);
  const [fOutboundNamingMask, setFOutboundNamingMask] = useState("");
  // ftp delivery
  const [fFtpEnabled, setFFtpEnabled] = useState(false);
  const [fFtpId, setFFtpId] = useState("");
  const [fFtpRemotePath, setFFtpRemotePath] = useState("");
  // delete source
  const [fDeleteSource, setFDeleteSource] = useState(false);
  // archive on success
  const [fArchiveEnabled, setFArchiveEnabled] = useState(false);
  const [fArchiveSubdir, setFArchiveSubdir] = useState("success");
  const [fArchiveNamingPreset, setFArchiveNamingPreset] = useState(1);
  const [fArchiveNamingMask, setFArchiveNamingMask] = useState("");
  // byte-accurate posting
  const [fPostBytes, setFPostBytes] = useState(false);
  // schedule
  const [fSchedEnabled, setFSchedEnabled] = useState(false);
  const [fSchedEvery, setFSchedEvery] = useState("5");
  const [fSchedUnit, setFSchedUnit] = useState<TransferScheduleUnit>("minutes");
  const [fSchedAtTime, setFSchedAtTime] = useState("");
  const [fSchedMode, setFSchedMode] = useState<"interval" | "daily">("interval");
  // folder watcher
  const [fWatchEnabled, setFWatchEnabled] = useState(false);
  const [fWatchRecursive, setFWatchRecursive] = useState(false);
  const [fWatchDebounce, setFWatchDebounce] = useState("2");
  // notifications
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
    setFOutboundNamingPreset(0); setFOutboundNamingMask("");
    setFFtpEnabled(false); setFFtpId(ftps[0]?.id || ""); setFFtpRemotePath("");
    setFDeleteSource(false);
    setFArchiveEnabled(false); setFArchiveSubdir("success"); setFArchiveNamingPreset(1); setFArchiveNamingMask("");
    setFPostBytes(false);
    setFSchedEnabled(false); setFSchedEvery("5"); setFSchedUnit("minutes"); setFSchedAtTime(""); setFSchedMode("interval");
    setFWatchEnabled(false); setFWatchRecursive(false); setFWatchDebounce("2");
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

  const insertArchiveToken = (token: string) => {
    setFArchiveNamingPreset(CUSTOM_NAMING_IDX);
    setFArchiveNamingMask((prev) => `${prev}${token}`);
  };

  const insertOutboundToken = (token: string) => {
    setFOutboundNamingPreset(CUSTOM_NAMING_IDX);
    setFOutboundNamingMask((prev) => `${prev}${token}`);
  };

  const fillFormFromIntegration = (i: Integration) => {
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
    const ofn = i.outboundFileNaming || { mode: "original", mask: "" };
    if (ofn.mode === "original") { setFOutboundNamingPreset(0); setFOutboundNamingMask(""); }
    else {
      const oIdx = NAMING_PRESETS.findIndex((p) => p.mode === "mask" && p.mask === ofn.mask);
      if (oIdx >= 0) { setFOutboundNamingPreset(oIdx); setFOutboundNamingMask(""); }
      else { setFOutboundNamingPreset(CUSTOM_NAMING_IDX); setFOutboundNamingMask(ofn.mask); }
    }
    setFFtpEnabled(!!i.ftpConnectionId);
    setFFtpId(i.ftpConnectionId || ftps[0]?.id || "");
    setFFtpRemotePath(i.ftpRemotePath || "");
    setFDeleteSource(!!i.deleteSourceAfterRun);
    const ap = i.archivePolicy;
    setFArchiveEnabled(!!ap?.enabled);
    setFArchiveSubdir(ap?.subdirectory || "success");
    const apFn = ap?.fileNaming || { mode: "original" as const, mask: "" };
    if (apFn.mode === "original") { setFArchiveNamingPreset(0); setFArchiveNamingMask(""); }
    else {
      const apIdx = NAMING_PRESETS.findIndex((p) => p.mode === "mask" && p.mask === apFn.mask);
      if (apIdx >= 0) { setFArchiveNamingPreset(apIdx); setFArchiveNamingMask(""); }
      else { setFArchiveNamingPreset(CUSTOM_NAMING_IDX); setFArchiveNamingMask(apFn.mask); }
    }
    setFPostBytes(!!i.postSourceAsBytes);
    setFSchedEnabled(!!i.schedule?.enabled); setFSchedEvery(String(i.schedule?.every || 5));
    setFSchedUnit(i.schedule?.unit || "minutes"); setFSchedAtTime(i.schedule?.atTime || "");
    setFSchedMode(i.schedule?.unit === "days" && i.schedule?.atTime ? "daily" : "interval");
    setFWatchEnabled(!!i.watch?.enabled);
    setFWatchRecursive(!!i.watch?.recursive);
    setFWatchDebounce(String((i.watch?.debounceMs ?? 2000) / 1000));
    setFNotifyOn(i.notifications?.on || "none"); setFNotifyEmail(i.notifications?.email || "");
    setFWebhookOn(i.webhook?.on || "none");
    setFWebhookUrl(i.webhook?.url || "");
    setFWebhookSecret(i.webhook?.secret || "");
    setFRetryEnabled(!!i.retryPolicy?.enabled);
    setFRetryMaxAttempts(String(i.retryPolicy?.maxAttempts || 3));
    setFRetryBackoffSeconds(String(i.retryPolicy?.backoffSeconds || 5));
    setFRetryDeadLetter(i.retryPolicy?.deadLetterSubdirectory || "_dead-letter");
  };

  const openEdit = (i: Integration) => {
    setEditTarget(i);
    fillFormFromIntegration(i);
    setFormError("");
    setShowModal(true);
  };

  // Duplicate: prefill the create modal from an existing integration (no id),
  // so saving POSTs a brand-new integration. The name is pre-suffixed to avoid
  // the server's duplicate-name rejection; the user can adjust before saving.
  const openDuplicate = (i: Integration) => {
    setEditTarget(null);
    fillFormFromIntegration(i);
    setFName(`Copy of ${i.name}`);
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
    const responseFileNaming: FileNaming = preset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fNamingPreset === CUSTOM_NAMING_IDX ? fNamingMask : preset.mask };
    const outboundPreset = NAMING_PRESETS[fOutboundNamingPreset];
    const outboundFileNaming: FileNaming = outboundPreset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fOutboundNamingPreset === CUSTOM_NAMING_IDX ? fOutboundNamingMask : outboundPreset.mask };
    const archivePreset = NAMING_PRESETS[fArchiveNamingPreset];
    const archiveFileNaming: FileNaming = archivePreset.mode === "original"
      ? { mode: "original", mask: "" }
      : { mode: "mask", mask: fArchiveNamingPreset === CUSTOM_NAMING_IDX ? fArchiveNamingMask : archivePreset.mask };
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
      outboundFileNaming,
      ftpConnectionId: fFtpEnabled ? fFtpId : "",
      ftpRemotePath: fFtpEnabled ? (fFtpRemotePath || undefined) : undefined,
      deleteSourceAfterRun: fDeleteSource,
      archivePolicy: { enabled: fArchiveEnabled, subdirectory: fArchiveSubdir.trim() || "success", fileNaming: archiveFileNaming },
      postSourceAsBytes: fPostBytes,
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
      watch: {
        enabled: fWatchEnabled,
        recursive: fWatchRecursive,
        debounceMs: Math.round((parseFloat(fWatchDebounce) || 2) * 1000),
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
  const handleOpenCreate = () => {
    if (loading) return;
    if (noPrereqs) {
      setBanner("Create at least one Destination and one SOAP Endpoint before creating an integration.");
      return;
    }
    openCreate();
  };

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Integrations</h1>
            <button className="btn btn-primary" onClick={handleOpenCreate} disabled={loading}><Plus className="w-4 h-4" /> New Integration</button>
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
                    <td className="text-xs">
                      {describeSchedule(i.schedule)}
                      {i.watch?.enabled && <span className="badge badge-info ml-1">watch</span>}
                    </td>
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
                        <button className="btn btn-ghost btn-sm" onClick={() => openDuplicate(i)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
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

                  {/* Outbound file naming — name forwarded with the source file to the SOAP request */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <label className="input-label">Outbound File Naming</label>
                    <p className="text-xs text-text-muted">Names the source file as it is forwarded to the SOAP request. Available in the SOAP envelope template as the <code>{"{FILENAME}"}</code> token and sent as a Content-Disposition header. Pick a timestamp preset or Custom mask to add a timestamp or custom text before sending.</p>
                    <select className="select" value={fOutboundNamingPreset} onChange={(e) => setFOutboundNamingPreset(parseInt(e.target.value))}>
                      {NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                    </select>
                    {fOutboundNamingPreset === CUSTOM_NAMING_IDX && (
                      <>
                        <input className="input mt-2" value={fOutboundNamingMask} onChange={(e) => setFOutboundNamingMask(e.target.value)} placeholder="{ORIGINAL}_{YYYY}{MM}{DD}{HH}{mm}{ss}{EXT}" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {FILE_NAMING_TOKENS.map((token) => (
                            <button key={token} type="button" className="badge badge-muted" onClick={() => insertOutboundToken(token)}>{token}</button>
                          ))}
                        </div>
                      </>
                    )}
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

                  {/* Response file naming — applies to the saved and/or FTP-forwarded response */}
                  {(fSaveResponse || fFtpEnabled) && (
                    <div className="p-3 rounded-lg border border-border space-y-3">
                      <label className="input-label">Response File Naming</label>
                      <p className="text-xs text-text-muted">Applied to the saved and/or FTP-forwarded response, named from the source file. Choose a timestamp preset or Custom mask so files with the same name do not overwrite each other.</p>
                      <select className="select" value={fNamingPreset} onChange={(e) => setFNamingPreset(parseInt(e.target.value))}>
                        {NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                      </select>
                      {fNamingPreset === CUSTOM_NAMING_IDX && (
                        <>
                          <input className="input mt-2" value={fNamingMask} onChange={(e) => setFNamingMask(e.target.value)} placeholder="{ORIGINAL}_{YYYY}{MM}{DD}{HH}{mm}{ss}{EXT}" />
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
                  )}

                  {/* Delete source */}
                  <div className="flex items-center gap-2">
                    <button className={`toggle ${fDeleteSource ? "active" : ""}`} onClick={() => setFDeleteSource(!fDeleteSource)}><span className="toggle-knob" /></button>
                    <span className="text-sm text-text-secondary">Delete source file after successful SOAP call</span>
                  </div>

                  {/* Archive source on success */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fArchiveEnabled ? "active" : ""}`} onClick={() => setFArchiveEnabled(!fArchiveEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Archive source file on success</span>
                    </div>
                    {fArchiveEnabled && (
                      <>
                        <div>
                          <label className="input-label">Archive Subdirectory</label>
                          <input className="input" value={fArchiveSubdir} onChange={(e) => setFArchiveSubdir(e.target.value)} placeholder="success" />
                        </div>
                        <div>
                          <label className="input-label">Archive File Naming</label>
                          <select className="select" value={fArchiveNamingPreset} onChange={(e) => setFArchiveNamingPreset(parseInt(e.target.value))}>
                            {NAMING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}{p.mask ? ` — ${p.mask}` : ""}</option>)}
                          </select>
                          {fArchiveNamingPreset === CUSTOM_NAMING_IDX && (
                            <>
                              <input className="input mt-2" value={fArchiveNamingMask} onChange={(e) => setFArchiveNamingMask(e.target.value)} placeholder="{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" />
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {FILE_NAMING_TOKENS.map((token) => (
                                  <button key={token} type="button" className="badge badge-muted" onClick={() => insertArchiveToken(token)}>{token}</button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-text-muted">Moves each successful file here, out of the source folder. Takes precedence over deleting the source.</p>
                      </>
                    )}
                  </div>

                  {/* Byte-accurate posting */}
                  <div className="flex items-center gap-2">
                    <button className={`toggle ${fPostBytes ? "active" : ""}`} onClick={() => setFPostBytes(!fPostBytes)}><span className="toggle-knob" /></button>
                    <span className="text-sm text-text-secondary">Post source as raw bytes (preserve original encoding; raw-mode SOAP endpoints only)</span>
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

                  {/* Folder watcher */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fWatchEnabled ? "active" : ""}`} onClick={() => setFWatchEnabled(!fWatchEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Watch source folder and run on new files</span>
                    </div>
                    {fWatchEnabled && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <button className={`toggle ${fWatchRecursive ? "active" : ""}`} onClick={() => setFWatchRecursive(!fWatchRecursive)}><span className="toggle-knob" /></button>
                          <span className="text-sm text-text-secondary">Include subfolders</span>
                        </div>
                        <div>
                          <label className="input-label">Debounce (seconds)</label>
                          <input className="input" type="number" min={0.25} step={0.25} value={fWatchDebounce} onChange={(e) => setFWatchDebounce(e.target.value)} />
                          <p className="text-xs text-text-muted mt-1">Wait this long after the last change before running, so large or batched writes finish first.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Retry + Dead-letter */}
                  <div className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button className={`toggle ${fRetryEnabled ? "active" : ""}`} onClick={() => setFRetryEnabled(!fRetryEnabled)}><span className="toggle-knob" /></button>
                      <span className="text-sm font-medium text-text-secondary">Retry SOAP/FTP failures and dead-letter exhausted source files</span>
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
