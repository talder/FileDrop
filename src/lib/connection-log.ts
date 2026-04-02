import { promises as dns } from "dns";
import { getDb } from "./config";
import type { ConnectionLogEntry } from "./types";

/** Cache reverse DNS lookups for 10 minutes */
const hostnameCache = new Map<string, { hostname: string; expiresAt: number }>();

export async function resolveHostname(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return ip === "127.0.0.1" || ip === "::1" ? "localhost" : "";
  }

  const cached = hostnameCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.hostname;

  try {
    const hostnames = await dns.reverse(ip);
    const hostname = hostnames[0] || "";
    hostnameCache.set(ip, { hostname, expiresAt: Date.now() + 10 * 60 * 1000 });
    return hostname;
  } catch {
    hostnameCache.set(ip, { hostname: "", expiresAt: Date.now() + 5 * 60 * 1000 });
    return "";
  }
}

export function logConnection(entry: Omit<ConnectionLogEntry, "id">): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO connection_log (timestamp, source_ip, hostname, method, path, status_code, api_key_id, party_name, user_agent, response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.timestamp, entry.sourceIp, entry.hostname, entry.method, entry.path,
    entry.statusCode, entry.apiKeyId, entry.partyName, entry.userAgent, entry.responseTimeMs,
  );
}

interface ConnectionQuery {
  limit?: number;
  offset?: number;
  sourceIp?: string;
  search?: string;
}

export function getConnections(query: ConnectionQuery = {}): { entries: ConnectionLogEntry[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.sourceIp) { conditions.push("source_ip = ?"); params.push(query.sourceIp); }
  if (query.search) { conditions.push("(source_ip LIKE ? OR hostname LIKE ? OR path LIKE ? OR party_name LIKE ?)"); params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`, `%${query.search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM connection_log ${where}`).get(...params) as { c: number };
  const rows = db.prepare(`SELECT * FROM connection_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Array<Record<string, string | number | null>>;

  return {
    total: countRow.c,
    entries: rows.map((r) => ({
      id: r.id as number,
      timestamp: r.timestamp as string,
      sourceIp: r.source_ip as string,
      hostname: r.hostname as string,
      method: r.method as string,
      path: r.path as string,
      statusCode: r.status_code as number,
      apiKeyId: r.api_key_id as string,
      partyName: r.party_name as string,
      userAgent: r.user_agent as string,
      responseTimeMs: r.response_time_ms as number,
    })),
  };
}
