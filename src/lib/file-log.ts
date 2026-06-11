import { getDb } from "./config";
import { forwardToVictoriaLogs } from "./victorialog";
import type { FileLogEntry } from "./types";

export function logFileUpload(entry: Omit<FileLogEntry, "id">): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO file_log (timestamp, filename, original_filename, file_size, mime_type, source_ip, source_hostname, api_key_id, api_key_party, endpoint_slug, destination_path, destination_name, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.timestamp, entry.filename, entry.originalFilename, entry.fileSize,
    entry.mimeType, entry.sourceIp, entry.sourceHostname || "", entry.apiKeyId, entry.apiKeyPartyName,
    entry.endpointSlug, entry.destinationPath, entry.destinationName || "", entry.status, entry.errorMessage || null
  );

  forwardToVictoriaLogs(
    "file",
    {
      message: `${entry.status} ${entry.originalFilename} → ${entry.destinationName || entry.destinationPath}`,
      filename: entry.filename,
      originalFilename: entry.originalFilename,
      fileSize: entry.fileSize,
      sourceIp: entry.sourceIp,
      party: entry.apiKeyPartyName,
      endpointSlug: entry.endpointSlug,
      destinationName: entry.destinationName || "",
      status: entry.status,
      errorMessage: entry.errorMessage || undefined,
    },
    entry.status === "failed" ? "error" : "info",
  );

  return result.lastInsertRowid as number;
}

interface LogQuery {
  limit?: number;
  offset?: number;
  endpointSlug?: string;
  status?: string;
  search?: string;
}

export function getFileLogs(query: LogQuery = {}): { entries: FileLogEntry[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.endpointSlug) { conditions.push("endpoint_slug = ?"); params.push(query.endpointSlug); }
  if (query.status) { conditions.push("status = ?"); params.push(query.status); }
  if (query.search) { conditions.push("(filename LIKE ? OR original_filename LIKE ?)"); params.push(`%${query.search}%`, `%${query.search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM file_log ${where}`).get(...params) as { c: number };
  const rows = db.prepare(`SELECT * FROM file_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Array<Record<string, string | number | null>>;

  return {
    total: countRow.c,
    entries: rows.map(rowToEntry),
  };
}

export function getLogStats(): { todayCount: number; todaySize: number; totalCount: number } {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const todayRow = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(file_size), 0) as s FROM file_log WHERE timestamp >= ? AND status = 'success'").get(today) as { c: number; s: number };
  const totalRow = db.prepare("SELECT COUNT(*) as c FROM file_log WHERE status = 'success'").get() as { c: number };

  return {
    todayCount: todayRow.c,
    todaySize: todayRow.s,
    totalCount: totalRow.c,
  };
}

function rowToEntry(row: Record<string, string | number | null>): FileLogEntry {
  return {
    id: row.id as number,
    timestamp: row.timestamp as string,
    filename: row.filename as string,
    originalFilename: row.original_filename as string,
    fileSize: row.file_size as number,
    mimeType: row.mime_type as string,
    sourceIp: row.source_ip as string,
    sourceHostname: (row.source_hostname as string) || "",
    apiKeyId: row.api_key_id as string,
    apiKeyPartyName: row.api_key_party as string,
    endpointSlug: row.endpoint_slug as string,
    destinationPath: row.destination_path as string,
    destinationName: (row.destination_name as string) || "",
    status: row.status as "success" | "failed",
    errorMessage: row.error_message as string | undefined,
  };
}
