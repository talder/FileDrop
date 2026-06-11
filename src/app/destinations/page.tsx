"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Power, PowerOff, TestTube, X, FolderOpen } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import DataFolderBrowserModal from "@/components/DataFolderBrowserModal";
import type { SanitizedUser, DestinationType } from "@/lib/types";

interface DestinationRow {
  id: string;
  name: string;
  type: DestinationType;
  localPath: string;
  remoteHost?: string;
  remotePath?: string;
  smbDomain?: string;
  smbUsername?: string;
  mountOptions?: string;
  mountStatus: "mounted" | "unmounted" | "local";
  createdAt: string;
}

export default function DestinationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<DestinationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DestinationRow | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  // Form state
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState<DestinationType>("local");
  const [fLocalPath, setFLocalPath] = useState("");
  const [fRemoteHost, setFRemoteHost] = useState("");
  const [fRemotePath, setFRemotePath] = useState("");
  const [fSmbDomain, setFSmbDomain] = useState("");
  const [fSmbUsername, setFSmbUsername] = useState("");
  const [fSmbPassword, setFSmbPassword] = useState("");
  const [fMountOptions, setFMountOptions] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchDestinations = useCallback(() => {
    fetch("/api/destinations").then((r) => r.json()).then((data) => {
      setDestinations(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchDestinations(); }, [user, fetchDestinations]);
  useEffect(() => { if (!showModal) setShowFolderBrowser(false); }, [showModal]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFType("local"); setFLocalPath(""); setFRemoteHost(""); setFRemotePath("");
    setFSmbDomain(""); setFSmbUsername(""); setFSmbPassword(""); setFMountOptions("");
    setFormError("");
    setShowModal(true);
  };

  const openCreateWithBrowser = () => {
    openCreate();
    setShowFolderBrowser(true);
  };

  const openEdit = (d: DestinationRow) => {
    setEditTarget(d);
    setFName(d.name); setFType(d.type); setFLocalPath(d.localPath);
    setFRemoteHost(d.remoteHost || ""); setFRemotePath(d.remotePath || "");
    setFSmbDomain(d.smbDomain || ""); setFSmbUsername(d.smbUsername || "");
    setFSmbPassword(""); setFMountOptions(d.mountOptions || "");
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormError("");
    const body: Record<string, string> = { name: fName, type: fType, localPath: fLocalPath };
    if (fType !== "local") { body.remoteHost = fRemoteHost; body.remotePath = fRemotePath; }
    if (fType === "smb") {
      body.smbDomain = fSmbDomain; body.smbUsername = fSmbUsername;
      if (fSmbPassword) body.smbPassword = fSmbPassword;
    }
    if (fType === "nfs") body.mountOptions = fMountOptions;

    const url = editTarget ? `/api/destinations/${editTarget.id}` : "/api/destinations";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchDestinations();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/destinations/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchDestinations();
  };

  const handleMount = async (id: string) => {
    const res = await fetch(`/api/destinations/${id}/mount`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setTestResult(`Mount failed: ${data.error}`);
    else setTestResult("Mounted successfully");
    fetchDestinations();
  };

  const handleUnmount = async (id: string) => {
    const res = await fetch(`/api/destinations/${id}/unmount`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setTestResult(`Unmount failed: ${data.error}`);
    else setTestResult("Unmounted successfully");
    fetchDestinations();
  };

  const handleTest = async (id: string) => {
    const res = await fetch(`/api/destinations/${id}/test`, { method: "POST" });
    const data = await res.json();
    setTestResult(data.message);
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
            <h1 className="page-title">Destinations</h1>
            <div className="flex items-center gap-2">
              <button className="btn btn-secondary" onClick={openCreateWithBrowser}><FolderOpen className="w-4 h-4" /> Browse /DATA</button>
              <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Add Destination</button>
            </div>
          </div>
          <p className="mb-4 text-xs text-text-muted">Folder browser tip: click <span className="font-medium text-text-secondary">Browse /DATA</span> here, or open Add/Edit Destination and use the same button next to the path field.</p>

          {testResult && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{testResult}</span>
              <button onClick={() => setTestResult(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {destinations.length === 0 && !loading ? (
            <div className="empty-state">
              <FolderOpen className="empty-state-icon" />
              <p className="empty-state-title">No destinations configured</p>
              <p className="empty-state-description">Add a local path, NFS, or SMB share to store dropped files.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Type</th><th>Path</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {destinations.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium text-text-primary">{d.name}</td>
                    <td><span className="badge badge-info">{d.type.toUpperCase()}</span></td>
                    <td className="font-mono text-xs">{d.type === "local" ? d.localPath : `${d.remoteHost}:${d.remotePath} → ${d.localPath}`}</td>
                    <td>
                      {d.mountStatus === "local" ? (
                        <span className="badge badge-muted">Local</span>
                      ) : d.mountStatus === "mounted" ? (
                        <span className="flex items-center gap-1.5"><span className="mount-dot mounted" /> Mounted</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><span className="mount-dot unmounted" /> Unmounted</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTest(d.id)} title="Test"><TestTube className="w-3.5 h-3.5" /></button>
                        {d.type !== "local" && d.mountStatus === "unmounted" && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMount(d.id)} title="Mount"><Power className="w-3.5 h-3.5" /></button>
                        )}
                        {d.type !== "local" && d.mountStatus === "mounted" && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleUnmount(d.id)} title="Unmount"><PowerOff className="w-3.5 h-3.5" /></button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(d)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <ModalOverlay onClose={() => setShowModal(false)} maxWidth={520}>
                <div className="modal-header">
                  <h2>{editTarget ? "Edit Destination" : "New Destination"}</h2>
                  <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="modal-body space-y-4">
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Invoice Storage" />
                  </div>
                  <div>
                    <label className="input-label">Type</label>
                    <select className="select" value={fType} onChange={(e) => setFType(e.target.value as DestinationType)}>
                      <option value="local">Local Path</option>
                      <option value="nfs">NFS Share</option>
                      <option value="smb">SMB/CIFS Share</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">{fType === "local" ? "Directory Path" : "Local Mount Point"}</label>
                    <div className="flex items-center gap-2">
                      <input className="input flex-1" value={fLocalPath} onChange={(e) => setFLocalPath(e.target.value)} placeholder="/mnt/filedrop/invoices" />
                      <button className="btn btn-secondary whitespace-nowrap" onClick={() => setShowFolderBrowser(true)}>Browse /DATA</button>
                    </div>
                    <p className="text-xs text-text-muted mt-1">Use the browser to pick folders under <span className="font-mono">/DATA</span>.</p>
                  </div>
                  {fType !== "local" && (
                    <>
                      <div>
                        <label className="input-label">Remote Host</label>
                        <input className="input" value={fRemoteHost} onChange={(e) => setFRemoteHost(e.target.value)} placeholder="192.168.1.100" />
                      </div>
                      <div>
                        <label className="input-label">{fType === "nfs" ? "Remote Export Path" : "Share Name"}</label>
                        <input className="input" value={fRemotePath} onChange={(e) => setFRemotePath(e.target.value)} placeholder={fType === "nfs" ? "/exports/data" : "shared$"} />
                      </div>
                    </>
                  )}
                  {fType === "smb" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="input-label">Domain</label>
                          <input className="input" value={fSmbDomain} onChange={(e) => setFSmbDomain(e.target.value)} placeholder="WORKGROUP" />
                        </div>
                        <div>
                          <label className="input-label">Username</label>
                          <input className="input" value={fSmbUsername} onChange={(e) => setFSmbUsername(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="input-label">Password {editTarget ? "(leave empty to keep)" : ""}</label>
                        <input className="input" type="password" value={fSmbPassword} onChange={(e) => setFSmbPassword(e.target.value)} />
                      </div>
                    </>
                  )}
                  {fType === "nfs" && (
                    <div>
                      <label className="input-label">Mount Options</label>
                      <input className="input" value={fMountOptions} onChange={(e) => setFMountOptions(e.target.value)} placeholder="vers=4,rw" />
                    </div>
                  )}
                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>{editTarget ? "Save Changes" : "Create"}</button>
                </div>
            </ModalOverlay>
          )}

          <DataFolderBrowserModal
            isOpen={showFolderBrowser}
            initialPath={fLocalPath}
            onClose={() => setShowFolderBrowser(false)}
            onSelect={(selectedPath) => {
              setFLocalPath(selectedPath);
              setShowFolderBrowser(false);
            }}
          />

          <ConfirmModal
            isOpen={!!deleteTarget}
            title="Delete Destination"
            message={`Are you sure you want to delete "${deleteTarget?.name}"? Endpoints using this destination will stop working.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
