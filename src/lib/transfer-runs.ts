import { getDb } from "./config";
import { forwardToVictoriaLogs } from "./victorialog";
import type { TransferDirection, TransferRun, TransferRunStatus, TransferTrigger } from "./types";

/** Insert a "running" row and return its id. */
export function startTransferRun(p: {
  transferId: string;
  transferName: string;
  direction: TransferDirection;
  trigger: TransferTrigger;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO transfer_runs (transfer_id, transfer_name, direction, trigger, started_at, status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
    )
    .run(p.transferId, p.transferName, p.direction, p.trigger, new Date().toISOString());
  return result.lastInsertRowid as number;
}

/** Finalize a run row with its outcome. */
export function finishTransferRun(
  id: number,
  p: {
    status: TransferRunStatus;
    filesTotal: number;
    filesOk: number;
    filesFailed: number;
    bytes: number;
    errorMessage?: string;
  },
): void {
  const db = getDb();
  db.prepare(
    `UPDATE transfer_runs
       SET finished_at = ?, status = ?, files_total = ?, files_ok = ?, files_failed = ?, bytes = ?, error_message = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    p.status,
    p.filesTotal,
    p.filesOk,
    p.filesFailed,
    p.bytes,
    p.errorMessage || null,
    id,
  );

  const row = db.prepare("SELECT transfer_id, transfer_name, direction, trigger FROM transfer_runs WHERE id = ?").get(id) as
    | { transfer_id: string; transfer_name: string; direction: string; trigger: string }
    | undefined;

  forwardToVictoriaLogs(
    "transfer",
    {
      message: `transfer ${row?.transfer_name || ""} ${p.status} (${p.filesOk}/${p.filesTotal})`,
      transferId: row?.transfer_id,
      transferName: row?.transfer_name,
      direction: row?.direction,
      trigger: row?.trigger,
      status: p.status,
      filesTotal: p.filesTotal,
      filesOk: p.filesOk,
      filesFailed: p.filesFailed,
      bytes: p.bytes,
      errorMessage: p.errorMessage || undefined,
    },
    p.status === "failed" ? "error" : p.status === "partial" ? "warn" : "info",
  );
}

function rowToRun(r: Record<string, string | number | null>): TransferRun {
  return {
    id: r.id as number,
    transferId: r.transfer_id as string,
    transferName: r.transfer_name as string,
    direction: r.direction as TransferDirection,
    trigger: r.trigger as TransferTrigger,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) || undefined,
    status: r.status as TransferRunStatus,
    filesTotal: r.files_total as number,
    filesOk: r.files_ok as number,
    filesFailed: r.files_failed as number,
    bytes: r.bytes as number,
    errorMessage: (r.error_message as string) || undefined,
  };
}

/** Recent runs, optionally filtered to a single transfer. */
export function getTransferRuns(transferId?: string, limit = 25): TransferRun[] {
  const db = getDb();
  const where = transferId ? "WHERE transfer_id = ?" : "";
  const params = transferId ? [transferId, limit] : [limit];
  const rows = db
    .prepare(`SELECT * FROM transfer_runs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as Array<Record<string, string | number | null>>;
  return rows.map(rowToRun);
}
