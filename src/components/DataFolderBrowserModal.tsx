"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FolderOpen, FileText, ArrowUp, RefreshCw, Check, X, FolderPlus, Pencil, Trash2 } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";

interface BrowseDirectory {
  name: string;
  path: string;
}
interface BrowseFile {
  name: string;
  path: string;
}

interface BrowseResponse {
  root: string;
  currentPath: string;
  parentPath: string | null;
  directories: BrowseDirectory[];
  files?: BrowseFile[];
}

interface DataFolderBrowserModalProps {
  isOpen: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
}

const DATA_ROOT = "/DATA";

function clampPathToDataRoot(inputPath?: string): string {
  if (!inputPath || !inputPath.startsWith(`${DATA_ROOT}/`) && inputPath !== DATA_ROOT) {
    return DATA_ROOT;
  }
  return inputPath;
}

export default function DataFolderBrowserModal({
  isOpen,
  initialPath,
  onClose,
  onSelect,
}: DataFolderBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState<string>(DATA_ROOT);
  const [rootPath, setRootPath] = useState<string>(DATA_ROOT);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<BrowseDirectory[]>([]);
  const [files, setFiles] = useState<BrowseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BrowseDirectory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPath(clampPathToDataRoot(initialPath));
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    // Reset transient management UI whenever we (re)load a directory.
    setCreating(false);
    setNewName("");
    setRenamePath(null);
    setDeleteTarget(null);
    setDeleteConfirm("");
    setActionError(null);

    const fetchDirectories = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/destinations/browse?path=${encodeURIComponent(currentPath)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to browse folders");
        }
        const payload = data as BrowseResponse;
        if (!active) return;
        setRootPath(payload.root || DATA_ROOT);
        setParentPath(payload.parentPath || null);
        setDirectories(Array.isArray(payload.directories) ? payload.directories : []);
        setFiles(Array.isArray(payload.files) ? payload.files : []);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to browse folders");
        setDirectories([]);
        setFiles([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    fetchDirectories();
    return () => { active = false; };
  }, [isOpen, currentPath, reloadKey]);

  const runMutation = async (
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    setWorking(true);
    setActionError(null);
    try {
      const res = await fetch("/api/destinations/folders", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Operation failed");
        return false;
      }
      return true;
    } catch (err) {
      setActionError((err as Error).message || "Operation failed");
      return false;
    } finally {
      setWorking(false);
    }
  };

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) { setActionError("Enter a folder name"); return; }
    if (await runMutation("POST", { parentPath: currentPath, name })) setReloadKey((k) => k + 1);
  };

  const submitRename = async () => {
    if (!renamePath) return;
    const name = renameName.trim();
    if (!name) { setActionError("Enter a folder name"); return; }
    if (await runMutation("PATCH", { path: renamePath, newName: name })) setReloadKey((k) => k + 1);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (await runMutation("DELETE", { path: deleteTarget.path, recursive: true })) setReloadKey((k) => k + 1);
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose} maxWidth={680}>
      <div className="modal-header">
        <h2>Select folder under /DATA</h2>
        <button onClick={onClose} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
      </div>
      <div className="modal-body space-y-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-text-muted mb-1">Current folder</p>
          <p className="font-mono text-xs break-all">{currentPath}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPath(parentPath || rootPath)}
            disabled={!parentPath || loading}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Up
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentPath(rootPath)} disabled={loading}>
            /DATA
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setCreating((v) => !v); setRenamePath(null); setDeleteTarget(null); setActionError(null); setNewName(""); }}
            disabled={loading || working}
          >
            <FolderPlus className="w-3.5 h-3.5" /> New folder
          </button>
          <div className="flex-1" />
          <button className="btn btn-primary btn-sm" onClick={() => onSelect(currentPath)} disabled={loading || !!error}>
            <Check className="w-3.5 h-3.5" /> Use this folder
          </button>
        </div>

        {creating && (
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
              placeholder="New folder name"
            />
            <button className="btn btn-primary btn-sm" onClick={submitCreate} disabled={working || !newName.trim()}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setCreating(false); setNewName(""); setActionError(null); }} disabled={working}>Cancel</button>
          </div>
        )}

        {deleteTarget && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
            <p className="text-sm text-text-primary">Permanently delete <span className="font-mono">{deleteTarget.name}</span> and all of its contents?</p>
            <p className="text-xs text-text-muted">Type the folder name to confirm.</p>
            <input
              className="input"
              autoFocus
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirm === deleteTarget.name) submitDelete(); }}
              placeholder={deleteTarget.name}
            />
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm"
                style={{ background: "#dc2626", color: "#fff" }}
                onClick={submitDelete}
                disabled={working || deleteConfirm !== deleteTarget.name}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete folder
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); setActionError(null); }} disabled={working}>Cancel</button>
            </div>
          </div>
        )}

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}

        <div className="rounded-lg border border-border max-h-[360px] overflow-y-auto">
          {loading ? (
            <p className="p-3 text-sm text-text-muted">Loading folders…</p>
          ) : error ? (
            <p className="p-3 text-sm text-red-500">{error}</p>
          ) : directories.length === 0 && files.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">No subfolders or files in this location.</p>
          ) : (
            <div className="divide-y divide-border">
              {directories.length > 0 && (
                <p className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">Folders</p>
              )}
              {directories.map((dir) => (
                <div key={dir.path} className="px-3 py-2 flex items-center gap-2 hover:bg-muted">
                  {renamePath === dir.path ? (
                    <>
                      <FolderOpen className="w-4 h-4 text-text-muted" />
                      <input
                        className="input flex-1"
                        autoFocus
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamePath(null); }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={submitRename} disabled={working || !renameName.trim()}><Check className="w-3.5 h-3.5" /></button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setRenamePath(null); setActionError(null); }} disabled={working}><X className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button className="flex-1 text-left flex items-center gap-2" onClick={() => setCurrentPath(dir.path)}>
                        <FolderOpen className="w-4 h-4 text-text-muted" />
                        <span className="flex-1 text-sm">{dir.name}</span>
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Rename" onClick={() => { setRenamePath(dir.path); setRenameName(dir.name); setActionError(null); setCreating(false); setDeleteTarget(null); }} disabled={working}><Pencil className="w-3.5 h-3.5" /></button>
                      <button className="btn btn-ghost btn-sm text-red-500" title="Delete" onClick={() => { setDeleteTarget(dir); setDeleteConfirm(""); setActionError(null); setCreating(false); setRenamePath(null); }} disabled={working}><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
              {files.length > 0 && (
                <p className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">Files</p>
              )}
              {files.map((file) => (
                <div key={file.path} className="w-full px-3 py-2 flex items-center gap-2 text-text-muted">
                  <FileText className="w-4 h-4" />
                  <span className="flex-1 text-sm">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted">Browsing and folder management are restricted to /DATA. Files are shown for visibility; selecting uses the current folder.</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </ModalOverlay>
  );
}
