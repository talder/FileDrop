import { existsSync, statSync } from "fs";
import { mkdir, readdir, unlink } from "fs/promises";
import path from "path";
import type { SFTPWrapper } from "ssh2";
import type { Transfer, TransferRunStatus, TransferTrigger } from "./types";
import { getSftpConnectionById } from "./sftp-connections";
import { getDestinationById, isPathAccessible } from "./destinations";
import {
  sftpConnect,
  listRemoteFiles,
  fastGetP,
  fastPutP,
  unlinkP,
  ensureRemoteDir,
} from "./sftp";
import { selectFiles, applyConflictPolicy } from "./transfer-util";
import { applyFilenameMask } from "./file-naming";
import { logFileUpload } from "./file-log";
import { startTransferRun, finishTransferRun } from "./transfer-runs";
import { setTransferLastRun } from "./transfers";
import { auditLog } from "./audit";
import { sendFileNotification } from "./email";
import type { SelectableFile } from "./transfer-util";

export interface RunSummary {
  status: TransferRunStatus;
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  bytes: number;
  errors: string[];
}

function computeStatus(ok: number, failed: number): TransferRunStatus {
  if (failed > 0 && ok > 0) return "partial";
  if (failed > 0) return "failed";
  return "success";
}

interface LocalFile extends SelectableFile {
  size: number;
}

async function listLocalFiles(dir: string, recursive: boolean): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  async function walk(current: string, relPrefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(abs, rel);
      } else if (entry.isFile()) {
        let size = 0;
        try { size = statSync(abs).size; } catch { /* ignore */ }
        out.push({ name: entry.name, relPath: rel, size });
      }
    }
  }
  await walk(dir, "");
  return out;
}

/**
 * Execute a transfer once. Used by both manual runs and the scheduler.
 * Never throws for per-file errors; only structural failures (missing
 * connection/destination, connect failure) end the run early.
 */
export async function runTransfer(transfer: Transfer, trigger: TransferTrigger): Promise<RunSummary> {
  const summary: RunSummary = {
    status: "success",
    filesTotal: 0,
    filesOk: 0,
    filesSkipped: 0,
    filesFailed: 0,
    bytes: 0,
    errors: [],
  };

  const runId = startTransferRun({
    transferId: transfer.id,
    transferName: transfer.name,
    direction: transfer.direction,
    trigger,
  });

  const fail = async (message: string): Promise<RunSummary> => {
    summary.status = "failed";
    summary.errors.push(message);
    finishTransferRun(runId, {
      status: "failed",
      filesTotal: summary.filesTotal,
      filesOk: summary.filesOk,
      filesFailed: summary.filesFailed,
      bytes: summary.bytes,
      errorMessage: message,
    });
    await setTransferLastRun(transfer.id, { at: new Date().toISOString(), status: "failed", error: message });
    auditLog({
      actor: trigger === "manual" ? "user" : "scheduler",
      action: "transfer.run.failed",
      targetType: "transfer",
      targetId: transfer.id,
      details: { name: transfer.name, error: message },
    });
    return summary;
  };

  const connection = await getSftpConnectionById(transfer.connectionId);
  if (!connection) return fail("SFTP server connection not found");

  const dest = await getDestinationById(transfer.destinationId);
  if (!dest) return fail("Destination not found");
  if (!isPathAccessible(dest.localPath)) return fail("Destination path is not accessible");

  let localDir = dest.localPath;
  if (transfer.subdirectory) localDir = path.join(localDir, transfer.subdirectory);
  try { await mkdir(localDir, { recursive: true }); } catch { /* exists */ }

  const remoteBase = transfer.remotePath || ".";
  const recursive = !!transfer.selection.recursive;
  const naming = transfer.fileNaming || { mode: "mask" as const, mask: "{ORIGINAL}{EXT}" };

  let session: { sftp: SFTPWrapper; close: () => void } | null = null;
  try {
    session = await sftpConnect(connection);
  } catch (err) {
    return fail(`Connection failed: ${(err as Error).message}`);
  }

  const { sftp, close } = session;
  const logBase = {
    sourceIp: connection.host,
    sourceHostname: connection.host,
    apiKeyId: "",
    apiKeyPartyName: `Transfer:${transfer.name}`,
    endpointSlug: transfer.name,
    destinationPath: localDir,
    destinationName: dest.name,
    mimeType: "",
  };

  try {
    if (transfer.direction === "pull") {
      const remoteFiles = await listRemoteFiles(sftp, remoteBase, recursive);
      const selected = selectFiles(remoteFiles, transfer.selection);
      summary.filesTotal = selected.length;

      const written = new Set<string>();
      for (const file of selected) {
        const relDir = recursive ? path.dirname(file.relPath) : ".";
        const targetDir = relDir && relDir !== "." ? path.join(localDir, relDir) : localDir;
        try { await mkdir(targetDir, { recursive: true }); } catch { /* exists */ }

        const desired = applyFilenameMask(naming, file.name);
        const resolution = applyConflictPolicy(
          desired,
          transfer.conflictPolicy,
          (n) => written.has(path.join(targetDir, n)) || existsSync(path.join(targetDir, n)),
        );
        if (resolution.action === "skip") {
          summary.filesSkipped += 1;
          continue;
        }
        const savedName = resolution.name!;
        const localTarget = path.join(targetDir, savedName);
        const remoteFile = path.posix.join(remoteBase, file.relPath);

        try {
          await fastGetP(sftp, remoteFile, localTarget);
          written.add(localTarget);
          summary.filesOk += 1;
          summary.bytes += file.size;
          logFileUpload({
            timestamp: new Date().toISOString(),
            filename: savedName,
            originalFilename: file.name,
            fileSize: file.size,
            status: "success",
            ...logBase,
          });
          if (transfer.deleteSourceAfterTransfer) {
            try { await unlinkP(sftp, remoteFile); } catch { /* best effort */ }
          }
        } catch (err) {
          const msg = (err as Error).message;
          summary.filesFailed += 1;
          summary.errors.push(`${file.relPath}: ${msg}`);
          logFileUpload({
            timestamp: new Date().toISOString(),
            filename: savedName,
            originalFilename: file.name,
            fileSize: file.size,
            status: "failed",
            errorMessage: msg,
            ...logBase,
          });
        }
      }
    } else {
      // push: local destination → remote
      const localFiles = await listLocalFiles(localDir, recursive);
      const selected = selectFiles(localFiles, transfer.selection);
      summary.filesTotal = selected.length;

      await ensureRemoteDir(sftp, remoteBase);
      // Snapshot existing remote files for conflict checks; grows as we write.
      const existingRemote = await listRemoteFiles(sftp, remoteBase, recursive);
      const remoteNames = new Set(existingRemote.map((f) => path.posix.join(remoteBase, f.relPath)));

      for (const file of selected) {
        const relDir = recursive ? path.dirname(file.relPath) : ".";
        const remoteDir = relDir && relDir !== "." ? path.posix.join(remoteBase, relDir) : remoteBase;
        if (remoteDir !== remoteBase) await ensureRemoteDir(sftp, remoteDir);

        const desired = applyFilenameMask(naming, file.name);
        const resolution = applyConflictPolicy(
          desired,
          transfer.conflictPolicy,
          (n) => remoteNames.has(path.posix.join(remoteDir, n)),
        );
        if (resolution.action === "skip") {
          summary.filesSkipped += 1;
          continue;
        }
        const savedName = resolution.name!;
        const remoteTarget = path.posix.join(remoteDir, savedName);
        const localSource = path.join(localDir, file.relPath);

        try {
          await fastPutP(sftp, localSource, remoteTarget);
          remoteNames.add(remoteTarget);
          summary.filesOk += 1;
          summary.bytes += file.size;
          logFileUpload({
            timestamp: new Date().toISOString(),
            filename: savedName,
            originalFilename: file.name,
            fileSize: file.size,
            status: "success",
            ...logBase,
          });
          if (transfer.deleteSourceAfterTransfer) {
            try { await unlink(localSource); } catch { /* best effort */ }
          }
        } catch (err) {
          const msg = (err as Error).message;
          summary.filesFailed += 1;
          summary.errors.push(`${file.relPath}: ${msg}`);
          logFileUpload({
            timestamp: new Date().toISOString(),
            filename: savedName,
            originalFilename: file.name,
            fileSize: file.size,
            status: "failed",
            errorMessage: msg,
            ...logBase,
          });
        }
      }
    }
  } catch (err) {
    close();
    return fail(`Transfer error: ${(err as Error).message}`);
  }

  close();

  summary.status = computeStatus(summary.filesOk, summary.filesFailed);
  const finishedAt = new Date().toISOString();
  finishTransferRun(runId, {
    status: summary.status,
    filesTotal: summary.filesTotal,
    filesOk: summary.filesOk,
    filesFailed: summary.filesFailed,
    bytes: summary.bytes,
    errorMessage: summary.errors.length > 0 ? summary.errors.slice(0, 5).join("; ") : undefined,
  });
  await setTransferLastRun(transfer.id, {
    at: finishedAt,
    status: summary.status,
    error: summary.errors[0],
  });

  auditLog({
    actor: trigger === "manual" ? "user" : "scheduler",
    action: "transfer.run",
    targetType: "transfer",
    targetId: transfer.id,
    details: {
      name: transfer.name,
      direction: transfer.direction,
      trigger,
      filesOk: summary.filesOk,
      filesFailed: summary.filesFailed,
      filesSkipped: summary.filesSkipped,
      bytes: summary.bytes,
    },
  });

  // Notifications: single per-run summary.
  const notify = transfer.notifications;
  if (notify && notify.on !== "none" && notify.email) {
    const wantFailure = summary.filesFailed > 0;
    const shouldSend = notify.on === "all" || (notify.on === "failures" && wantFailure);
    if (shouldSend) {
      sendFileNotification({
        to: notify.email,
        endpointSlug: transfer.name,
        event: wantFailure ? "failed" : "upload",
        filename: `${summary.filesOk} transferred, ${summary.filesFailed} failed, ${summary.filesSkipped} skipped`,
        originalFilename: `${transfer.direction.toUpperCase()} ${transfer.name}`,
        fileSize: summary.bytes,
        party: `SFTP:${connection.host}`,
        sourceIp: connection.host,
        errorMessage: summary.errors[0],
      });
    }
  }

  return summary;
}
