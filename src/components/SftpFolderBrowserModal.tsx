"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FolderOpen, FileText, ArrowUp, Home, RefreshCw, Check, X } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";

interface BrowseEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string | null;
  directories: BrowseEntry[];
  files: BrowseEntry[];
}

interface SftpFolderBrowserModalProps {
  isOpen: boolean;
  connectionId: string;
  serverName?: string;
  initialPath?: string;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
}

export default function SftpFolderBrowserModal({
  isOpen,
  connectionId,
  serverName,
  initialPath,
  onClose,
  onSelect,
}: SftpFolderBrowserModalProps) {
  // `requestedPath` is what we ask the server for (null = login directory).
  // `currentPath` is the canonical absolute path the server resolved to.
  const [requestedPath, setRequestedPath] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<BrowseEntry[]>([]);
  const [files, setFiles] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setRequestedPath(initialPath && initialPath.trim() ? initialPath.trim() : null);
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen || !connectionId) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/sftp-connections/${connectionId}/browse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: requestedPath ?? undefined }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to browse server");
        const payload = data as BrowseResponse;
        if (!active) return;
        setCurrentPath(payload.currentPath || "");
        setParentPath(payload.parentPath ?? null);
        setDirectories(Array.isArray(payload.directories) ? payload.directories : []);
        setFiles(Array.isArray(payload.files) ? payload.files : []);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to browse server");
        setDirectories([]);
        setFiles([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [isOpen, connectionId, requestedPath, reloadKey]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose} maxWidth={680}>
      <div className="modal-header">
        <h2>Browse {serverName || "SFTP server"}</h2>
        <button onClick={onClose} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
      </div>
      <div className="modal-body space-y-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-text-muted mb-1">Current folder</p>
          <p className="font-mono text-xs break-all">{currentPath || "…"}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setRequestedPath(parentPath)}
            disabled={!parentPath || loading}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Up
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRequestedPath(null)} disabled={loading}>
            <Home className="w-3.5 h-3.5" /> Home
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <div className="flex-1" />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onSelect(currentPath)}
            disabled={loading || !!error || !currentPath}
          >
            <Check className="w-3.5 h-3.5" /> Use this folder
          </button>
        </div>

        <div className="rounded-lg border border-border max-h-[360px] overflow-y-auto">
          {loading ? (
            <p className="p-3 text-sm text-text-muted">Loading…</p>
          ) : error ? (
            <p className="p-3 text-sm text-red-500">{error}</p>
          ) : directories.length === 0 && files.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">This folder is empty.</p>
          ) : (
            <div className="divide-y divide-border">
              {directories.length > 0 && (
                <p className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">Folders</p>
              )}
              {directories.map((dir) => (
                <button
                  key={dir.path}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted"
                  onClick={() => setRequestedPath(dir.path)}
                >
                  <FolderOpen className="w-4 h-4 text-text-muted" />
                  <span className="flex-1 text-sm">{dir.name}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </button>
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
        <p className="text-xs text-text-muted">Navigate into folders to explore the server, then pick the current folder to use its path.</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </ModalOverlay>
  );
}
