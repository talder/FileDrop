"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, Wifi } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import type { SanitizedUser, ConnectionLogEntry } from "@/lib/types";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString() + " " + new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ConnectionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [entries, setEntries] = useState<ConnectionLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (search) params.set("search", search);
    fetch(`/api/connections?${params}`).then((r) => r.json()).then((d) => {
      setEntries(d.entries || []);
      setTotal(d.total || 0);
    });
  }, [offset, search]);

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
            <h1 className="page-title">Connection Log</h1>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input className="input pl-9" style={{ width: 240 }} placeholder="Search IP, hostname, party..." value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
              </div>
              <button className="btn btn-secondary" onClick={fetchData}><RefreshCw className="w-4 h-4" /></button>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="empty-state">
              <Wifi className="empty-state-icon" />
              <p className="empty-state-title">No connections logged yet</p>
              <p className="empty-state-description">Connection data will appear here when external parties use the drop API.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Time</th><th>IP</th><th>Hostname</th><th>Method</th><th>Path</th><th>Party</th><th>Status</th><th>Response</th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-xs whitespace-nowrap">{timeAgo(e.timestamp)}</td>
                      <td className="font-mono text-xs">{e.sourceIp}</td>
                      <td className="text-xs">{e.hostname || "—"}</td>
                      <td><span className="badge badge-info">{e.method}</span></td>
                      <td className="text-xs font-mono">{e.path}</td>
                      <td className="text-xs">{e.partyName || "—"}</td>
                      <td>
                        <span className={`badge ${e.statusCode < 400 ? "badge-success" : "badge-danger"}`}>{e.statusCode}</span>
                      </td>
                      <td className="text-xs">{e.responseTimeMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="pagination">
                <button className="pagination-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
                <span className="text-xs text-text-muted px-2">{offset + 1}–{Math.min(offset + 50, total)} of {total}</span>
                <button className="pagination-btn" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
