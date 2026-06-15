"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, RefreshCw, FolderPlus, Upload, FolderUp, Download, Archive,
  FolderOpen, FileText, Pencil, Trash2, Check, X, ChevronRight,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import type { SanitizedUser } from "@/lib/types";

interface DirEntry { name: string; path: string; }
interface FileEntry { name: string; path: string; size: number; modifiedAt: string; }
interface Listing {
  root: string;
  currentPath: string;
  parentPath: string | null;
  directories: DirEntry[];
  files: FileEntry[];
}

const DATA_ROOT = "/DATA";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function downloadUrl(targetPath: string): string {
  return `/api/data/download?path=${encodeURIComponent(targetPath)}`;
}

export default function DataPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);

  const [currentPath, setCurrentPath] = useState(DATA_ROOT);
  const [root, setRoot] = useState(DATA_ROOT);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState(false);

  // Folder management UI
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  // Mark the folder input as a directory picker (non-standard attributes).
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, [user]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setCreating(false); setNewName("");
    setRenamePath(null); setDeleteTarget(null); setDeleteConfirm("");

    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/data/list?path=${encodeURIComponent(currentPath)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to list directory");
        if (!active) return;
        const payload = data as Listing;
        setRoot(payload.root || DATA_ROOT);
        setParentPath(payload.parentPath ?? null);
        setDirectories(Array.isArray(payload.directories) ? payload.directories : []);
        setFiles(Array.isArray(payload.files) ? payload.files : []);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to list directory");
        setDirectories([]); setFiles([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user, currentPath, reloadKey]);

  const doUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true); setStatus(null); setError(null);
    try {
      const fd = new FormData();
      fd.append("path", currentPath);
      for (const file of Array.from(fileList)) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        fd.append("files", file, rel && rel.length > 0 ? rel : file.name);
      }
      const res = await fetch("/api/data/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (Array.isArray(data.errors) ? data.errors.join("; ") : "Upload failed"));
      } else {
        setStatus(`Uploaded ${data.received} file${data.received === 1 ? "" : "s"}${data.failed ? `, ${data.failed} failed` : ""}`);
        if (Array.isArray(data.errors) && data.errors.length > 0) setError(data.errors.join("; "));
        reload();
      }
    } catch (err) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const runMutation = async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<boolean> => {
    setWorking(true); setError(null);
    try {
      const res = await fetch("/api/destinations/folders", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Operation failed"); return false; }
      return true;
    } catch (err) {
      setError((err as Error).message || "Operation failed");
      return false;
    } finally {
      setWorking(false);
    }
  };

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) { setError("Enter a folder name"); return; }
    if (await runMutation("POST", { parentPath: currentPath, name })) { setStatus(`Created folder "${name}"`); reload(); }
  };

  const submitRename = async () => {
    if (!renamePath) return;
    const name = renameName.trim();
    if (!name) { setError("Enter a folder name"); return; }
    if (await runMutation("PATCH", { path: renamePath, newName: name })) { setStatus("Folder renamed"); reload(); }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (await runMutation("DELETE", { path: deleteTarget.path, recursive: true })) { setStatus(`Deleted "${deleteTarget.name}"`); reload(); }
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const crumbs = currentPath.startsWith(root) ? currentPath.slice(root.length).split("/").filter(Boolean) : [];
  const crumbPath = (index: number) => root + (index >= 0 ? "/" + crumbs.slice(0, index + 1).join("/") : "");
  const isEmpty = directories.length === 0 && files.length === 0;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Data</h1>
            <div className="flex items-center gap-2">
              <button className="btn btn-secondary" onClick={() => filesInputRef.current?.click()} disabled={uploading}>
                <Upload className="w-4 h-4" /> Upload files
              </button>
              <button className="btn btn-secondary" onClick={() => folderInputRef.current?.click()} disabled={uploading}>
                <FolderUp className="w-4 h-4" /> Upload folder
              </button>
            </div>
          </div>

          <input
            ref={filesInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => { void doUpload(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => { void doUpload(e.target.files); e.target.value = ""; }}
          />

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPath(parentPath || root)} disabled={!parentPath || loading}>
              <ArrowUp className="w-3.5 h-3.5" /> Up
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPath(root)} disabled={loading}>/DATA</button>
            <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setCreating((v) => !v); setRenamePath(null); setDeleteTarget(null); setError(null); setNewName(""); }}
              disabled={loading || working}
            >
              <FolderPlus className="w-3.5 h-3.5" /> New folder
            </button>
            <div className="flex-1" />
            <a className="btn btn-secondary btn-sm" href={downloadUrl(currentPath)}>
              <Archive className="w-3.5 h-3.5" /> Download folder
            </a>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 flex-wrap mb-3 text-sm">
            <button className="font-mono text-accent-text hover:underline" onClick={() => setCurrentPath(root)}>/DATA</button>
            {crumbs.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                <button className="font-mono hover:underline" onClick={() => setCurrentPath(crumbPath(i))}>{seg}</button>
              </span>
            ))}
          </div>

          {uploading && (
            <div className="mb-3 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">Uploading…</div>
          )}
          {status && !uploading && (
            <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-light)] text-sm text-accent-text">
              <span className="flex-1">{status}</span>
              <button onClick={() => setStatus(null)}><X className="w-4 h-4" /></button>
            </div>
          )}
          {error && (
            <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-sm text-red-600">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {creating && (
            <div className="flex items-center gap-2 mb-3">
              <input
                className="input flex-1 max-w-sm"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }}
                placeholder="New folder name"
              />
              <button className="btn btn-primary btn-sm" onClick={submitCreate} disabled={working || !newName.trim()}>Create</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setCreating(false); setNewName(""); }} disabled={working}>Cancel</button>
            </div>
          )}

          {deleteTarget && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2 mb-3">
              <p className="text-sm text-text-primary">Permanently delete <span className="font-mono">{deleteTarget.name}</span> and all of its contents?</p>
              <p className="text-xs text-text-muted">Type the folder name to confirm.</p>
              <input
                className="input max-w-sm"
                autoFocus
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirm === deleteTarget.name) submitDelete(); }}
                placeholder={deleteTarget.name}
              />
              <div className="flex items-center gap-2">
                <button className="btn btn-sm" style={{ background: "#dc2626", color: "#fff" }} onClick={submitDelete} disabled={working || deleteConfirm !== deleteTarget.name}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete folder
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }} disabled={working}>Cancel</button>
              </div>
            </div>
          )}

          {isEmpty && !loading ? (
            <div className="empty-state">
              <FolderOpen className="empty-state-icon" />
              <p className="empty-state-title">This folder is empty</p>
              <p className="empty-state-description">Upload files or a folder, or create a subfolder to get started.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th>Actions</th></tr></thead>
              <tbody>
                {directories.map((dir) => (
                  <tr key={dir.path}>
                    <td>
                      {renamePath === dir.path ? (
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
                          <input
                            className="input flex-1 max-w-xs"
                            autoFocus
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamePath(null); }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={submitRename} disabled={working || !renameName.trim()}><Check className="w-3.5 h-3.5" /></button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setRenamePath(null)} disabled={working}><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button className="flex items-center gap-2 text-left hover:underline" onClick={() => setCurrentPath(dir.path)}>
                          <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
                          <span className="text-sm font-medium text-text-primary">{dir.name}</span>
                        </button>
                      )}
                    </td>
                    <td className="text-xs text-text-muted">—</td>
                    <td className="text-xs text-text-muted">—</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <a className="btn btn-ghost btn-sm" title="Download as zip" href={downloadUrl(dir.path)}><Archive className="w-3.5 h-3.5" /></a>
                        <button className="btn btn-ghost btn-sm" title="Rename" onClick={() => { setRenamePath(dir.path); setRenameName(dir.name); setError(null); setCreating(false); setDeleteTarget(null); }} disabled={working}><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" title="Delete" onClick={() => { setDeleteTarget(dir); setDeleteConfirm(""); setError(null); setCreating(false); setRenamePath(null); }} disabled={working}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {files.map((file) => (
                  <tr key={file.path}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                        <span className="text-sm text-text-primary">{file.name}</span>
                      </div>
                    </td>
                    <td className="text-xs text-text-muted">{formatBytes(file.size)}</td>
                    <td className="text-xs text-text-muted">{formatDate(file.modifiedAt)}</td>
                    <td>
                      <a className="btn btn-ghost btn-sm" title="Download" href={downloadUrl(file.path)}><Download className="w-3.5 h-3.5" /></a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-xs text-text-muted mt-3">Browsing, upload, and download are restricted to /DATA. Folders download as a store-only (uncompressed) zip.</p>
        </div>
      </div>
    </div>
  );
}
