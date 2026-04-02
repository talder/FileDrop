"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, FileText, HardDrive, Globe, KeyRound, CheckCircle, XCircle } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import type { SanitizedUser, FileLogEntry } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [stats, setStats] = useState({ todayCount: 0, todaySize: 0, totalCount: 0 });
  const [endpointCount, setEndpointCount] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [logs, setLogs] = useState<FileLogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchData = useCallback(async () => {
    const [statsRes, logsRes, endpointsRes, keysRes] = await Promise.all([
      fetch("/api/logs?stats=true"),
      fetch("/api/logs?limit=25"),
      fetch("/api/endpoints"),
      fetch("/api/api-keys"),
    ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (logsRes.ok) { const d = await logsRes.json(); setLogs(d.entries || []); setLogTotal(d.total || 0); }
    if (endpointsRes.ok) { const d = await endpointsRes.json(); setEndpointCount(Array.isArray(d) ? d.length : 0); }
    if (keysRes.ok) { const d = await keysRes.json(); setKeyCount(Array.isArray(d) ? d.filter((k: { revokedAt?: string | null }) => !k.revokedAt).length : 0); }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Dashboard</h1>
            <button className="btn btn-secondary" onClick={fetchData}><RefreshCw className="w-4 h-4" /> Refresh</button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="stats-card">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-accent" />
                <span className="stats-card-label">Files Today</span>
              </div>
              <div className="stats-card-value">{stats.todayCount}</div>
              <div className="text-xs text-text-muted mt-1">{formatBytes(stats.todaySize)} received</div>
            </div>
            <div className="stats-card">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-4 h-4 text-accent" />
                <span className="stats-card-label">Total Files</span>
              </div>
              <div className="stats-card-value">{stats.totalCount}</div>
            </div>
            <div className="stats-card">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-accent" />
                <span className="stats-card-label">Endpoints</span>
              </div>
              <div className="stats-card-value">{endpointCount}</div>
            </div>
            <div className="stats-card">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-4 h-4 text-accent" />
                <span className="stats-card-label">Active Keys</span>
              </div>
              <div className="stats-card-value">{keyCount}</div>
            </div>
          </div>

          {/* File activity log */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Recent File Activity</h2>
              <span className="text-xs text-text-muted">{logTotal} total entries</span>
            </div>
            {logs.length === 0 ? (
              <div className="empty-state py-8">
                <FileText className="empty-state-icon" />
                <p className="empty-state-title">No files received yet</p>
                <p className="empty-state-description">Configure endpoints and share API keys to start receiving files.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Time</th><th>Origin</th><th>Original Name</th><th>Saved As</th><th>Size</th><th>Endpoint</th><th>Destination</th><th>Party</th><th>Status</th></tr></thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-xs whitespace-nowrap">{timeAgo(log.timestamp)}</td>
                      <td className="text-xs" title={log.sourceIp}>{log.sourceHostname || log.sourceIp}</td>
                      <td className="font-medium text-text-primary max-w-[180px] truncate" title={log.originalFilename}>{log.originalFilename}</td>
                      <td className="text-xs max-w-[180px] truncate font-mono" title={log.filename}>{log.filename !== log.originalFilename ? log.filename : "—"}</td>
                      <td className="text-xs whitespace-nowrap">{formatBytes(log.fileSize)}</td>
                      <td><span className="badge badge-info">{log.endpointSlug}</span></td>
                      <td className="text-xs">{log.destinationName || "—"}</td>
                      <td className="text-xs">{log.apiKeyPartyName || "—"}</td>
                      <td>
                        {log.status === "success" ? (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500" title={log.errorMessage}><XCircle className="w-3.5 h-3.5" /> Failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
