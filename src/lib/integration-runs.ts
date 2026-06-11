import { getDb } from "./config";
import { forwardToVictoriaLogs } from "./victorialog";
import type { IntegrationRun, TransferRunStatus, TransferTrigger } from "./types";

/** Insert a "running" row and return its id. */
export function startIntegrationRun(p: {
  integrationId: string;
  integrationName: string;
  trigger: TransferTrigger;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO integration_runs (integration_id, integration_name, trigger, started_at, status)
       VALUES (?, ?, ?, ?, 'running')`,
    )
    .run(p.integrationId, p.integrationName, p.trigger, new Date().toISOString());
  return result.lastInsertRowid as number;
}

/** Finalize a run row with its outcome. */
export function finishIntegrationRun(
  id: number,
  p: {
    status: TransferRunStatus;
    filesTotal: number;
    filesOk: number;
    filesFailed: number;
    errorMessage?: string;
  },
): void {
  const db = getDb();
  db.prepare(
    `UPDATE integration_runs
       SET finished_at = ?, status = ?, files_total = ?, files_ok = ?, files_failed = ?, error_message = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    p.status,
    p.filesTotal,
    p.filesOk,
    p.filesFailed,
    p.errorMessage || null,
    id,
  );

  const row = db
    .prepare("SELECT integration_id, integration_name, trigger FROM integration_runs WHERE id = ?")
    .get(id) as { integration_id: string; integration_name: string; trigger: string } | undefined;

  forwardToVictoriaLogs(
    "integration",
    {
      message: `integration ${row?.integration_name || ""} ${p.status} (${p.filesOk}/${p.filesTotal})`,
      integrationId: row?.integration_id,
      integrationName: row?.integration_name,
      trigger: row?.trigger,
      status: p.status,
      filesTotal: p.filesTotal,
      filesOk: p.filesOk,
      filesFailed: p.filesFailed,
      errorMessage: p.errorMessage || undefined,
    },
    p.status === "failed" ? "error" : p.status === "partial" ? "warn" : "info",
  );
}

function rowToRun(r: Record<string, string | number | null>): IntegrationRun {
  return {
    id: r.id as number,
    integrationId: r.integration_id as string,
    integrationName: r.integration_name as string,
    trigger: r.trigger as TransferTrigger,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) || undefined,
    status: r.status as TransferRunStatus,
    filesTotal: r.files_total as number,
    filesOk: r.files_ok as number,
    filesFailed: r.files_failed as number,
    errorMessage: (r.error_message as string) || undefined,
  };
}

/** Recent runs, optionally filtered to a single integration. */
export function getIntegrationRuns(integrationId?: string, limit = 25): IntegrationRun[] {
  const db = getDb();
  const where = integrationId ? "WHERE integration_id = ?" : "";
  const params = integrationId ? [integrationId, limit] : [limit];
  const rows = db
    .prepare(`SELECT * FROM integration_runs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as Array<Record<string, string | number | null>>;
  return rows.map(rowToRun);
}
