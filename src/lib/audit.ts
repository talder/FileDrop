import { getDb } from "./config";
import { forwardToVictoriaLogs } from "./victorialog";
import type { AuditLogEntry } from "./types";

/**
 * Record an audit log entry.
 * Call this in every mutating API route.
 */
export function auditLog(opts: {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown> | string;
  sourceIp?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (timestamp, actor, action, target_type, target_id, details, source_ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    opts.actor,
    opts.action,
    opts.targetType || "",
    opts.targetId || "",
    typeof opts.details === "string" ? opts.details : opts.details ? JSON.stringify(opts.details) : null,
    opts.sourceIp || "",
  );

  forwardToVictoriaLogs("audit", {
    message: `${opts.actor} ${opts.action}`,
    actor: opts.actor,
    action: opts.action,
    targetType: opts.targetType || "",
    targetId: opts.targetId || "",
    details: typeof opts.details === "string" ? opts.details : opts.details ? JSON.stringify(opts.details) : undefined,
    sourceIp: opts.sourceIp || "",
  });
}

/** Helper to extract IP from a request */
export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

interface AuditQuery {
  limit?: number;
  offset?: number;
  actor?: string;
  action?: string;
  search?: string;
}

export function getAuditLogs(query: AuditQuery = {}): { entries: AuditLogEntry[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.actor) { conditions.push("actor = ?"); params.push(query.actor); }
  if (query.action) { conditions.push("action LIKE ?"); params.push(`${query.action}%`); }
  if (query.search) { conditions.push("(action LIKE ? OR details LIKE ? OR target_id LIKE ?)"); params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params) as { c: number };
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Array<Record<string, string | number | null>>;

  return {
    total: countRow.c,
    entries: rows.map((r) => ({
      id: r.id as number,
      timestamp: r.timestamp as string,
      actor: r.actor as string,
      action: r.action as string,
      targetType: r.target_type as string,
      targetId: r.target_id as string,
      details: r.details as string | null,
      sourceIp: r.source_ip as string,
    })),
  };
}
