"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FolderOpen, ArrowUp, RefreshCw, Check, X } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";

interface BrowseDirectory {
  name: string;
  path: string;
}

interface BrowseResponse {
  root: string;
  currentPath: string;
  parentPath: string | null;
  directories: BrowseDirectory[];
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPath(clampPathToDataRoot(initialPath));
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

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
      } catch (err) {
        if (!active) return;
        setError((err as Error).message || "Failed to browse folders");
        setDirectories([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    fetchDirectories();
    return () => { active = false; };
  }, [isOpen, currentPath, reloadKey]);

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
          <div className="flex-1" />
          <button className="btn btn-primary btn-sm" onClick={() => onSelect(currentPath)} disabled={loading || !!error}>
            <Check className="w-3.5 h-3.5" /> Use this folder
          </button>
        </div>

        <div className="rounded-lg border border-border max-h-[360px] overflow-y-auto">
          {loading ? (
            <p className="p-3 text-sm text-text-muted">Loading folders…</p>
          ) : error ? (
            <p className="p-3 text-sm text-red-500">{error}</p>
          ) : directories.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">No subfolders in this location.</p>
          ) : (
            <div className="divide-y divide-border">
              {directories.map((dir) => (
                <button
                  key={dir.path}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted"
                  onClick={() => setCurrentPath(dir.path)}
                >
                  <FolderOpen className="w-4 h-4 text-text-muted" />
                  <span className="flex-1 text-sm">{dir.name}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted">Browsing is restricted to folders inside /DATA.</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </ModalOverlay>
  );
}
