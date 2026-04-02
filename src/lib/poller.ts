import { readdir, copyFile, unlink, stat } from "fs/promises";
import path from "path";
import { readJsonConfig } from "./config";
import { getDestinationById, isPathAccessible } from "./destinations";
import { sftpList, sftpGet, sftpDelete } from "./sftp";
import { logFileUpload } from "./file-log";
import { applyFilenameMask } from "./file-naming";
import { auditLog } from "./audit";
import type { DropEndpoint, FileNaming } from "./types";

const ENDPOINTS_FILE = "endpoints.json";

/** Active polling intervals, keyed by endpoint ID */
const activePollers = new Map<string, ReturnType<typeof setInterval>>();

/** Start polling for all endpoints that have poll.enabled = true */
export async function startAllPollers(): Promise<void> {
  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  for (const ep of endpoints) {
    if (ep.enabled && ep.poll?.enabled) {
      startPoller(ep);
    }
  }
}

/** Start polling for a single endpoint */
export function startPoller(ep: DropEndpoint): void {
  // Stop existing poller if any
  stopPoller(ep.id);

  if (!ep.poll?.enabled) return;

  const intervalMs = Math.max(ep.poll.intervalSeconds || 60, 10) * 1000;

  // Run once immediately, then on interval
  pollEndpoint(ep).catch((err) => console.error(`[poller] Error polling ${ep.slug}:`, err));

  const timer = setInterval(() => {
    pollEndpoint(ep).catch((err) => console.error(`[poller] Error polling ${ep.slug}:`, err));
  }, intervalMs);

  activePollers.set(ep.id, timer);
  console.log(`[poller] Started polling ${ep.slug} every ${ep.poll.intervalSeconds}s`);
}

/** Stop polling for a single endpoint */
export function stopPoller(endpointId: string): void {
  const timer = activePollers.get(endpointId);
  if (timer) {
    clearInterval(timer);
    activePollers.delete(endpointId);
  }
}

/** Stop all pollers */
export function stopAllPollers(): void {
  for (const [id, timer] of activePollers) {
    clearInterval(timer);
  }
  activePollers.clear();
}

/** Poll a single endpoint: fetch files from source and write to destination */
async function pollEndpoint(ep: DropEndpoint): Promise<void> {
  const dest = await getDestinationById(ep.destinationId);
  if (!dest) return;

  let destPath = dest.localPath;
  if (ep.subdirectory) destPath = path.join(destPath, ep.subdirectory);

  if (!isPathAccessible(dest.localPath)) return;

  const naming: FileNaming = ep.fileNaming || { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" };

  if (ep.type === "sftp" && ep.sftp && ep.sftp.direction === "pull") {
    // SFTP pull mode
    try {
      const files = await sftpList(ep.sftp);
      for (const file of files) {
        const savedName = applyFilenameMask(naming, file.filename);
        const localTarget = path.join(destPath, savedName);

        const remotePath = path.posix.join(ep.sftp.remotePath, file.filename);
        await sftpGet(ep.sftp, remotePath, localTarget);

        logFileUpload({
          timestamp: new Date().toISOString(),
          filename: savedName,
          originalFilename: file.filename,
          fileSize: file.size,
          mimeType: "",
          sourceIp: ep.sftp.host,
          sourceHostname: ep.sftp.host,
          apiKeyId: "",
          apiKeyPartyName: `SFTP:${ep.sftp.host}`,
          endpointSlug: ep.slug,
          destinationPath: destPath,
          destinationName: dest.name,
          status: "success",
        });

        if (ep.poll?.deleteAfterTransfer) {
          await sftpDelete(ep.sftp, remotePath);
        }
      }

      if (files.length > 0) {
        auditLog({ actor: "poller", action: "poll.sftp.pull", targetType: "endpoint", targetId: ep.slug, details: { fileCount: files.length } });
      }
    } catch (err) {
      console.error(`[poller] SFTP pull error for ${ep.slug}:`, (err as Error).message);
    }
  } else if (ep.poll?.sourcePath) {
    // Local/NFS/SMB poll: read from sourcePath, copy to destination
    try {
      if (!isPathAccessible(ep.poll.sourcePath)) return;

      const entries = await readdir(ep.poll.sourcePath, { withFileTypes: true });
      const files = entries.filter((e) => e.isFile());

      for (const file of files) {
        // Check extension filter
        if (ep.allowedExtensions.length > 0) {
          const ext = path.extname(file.name).toLowerCase();
          if (!ep.allowedExtensions.includes(ext)) continue;
        }

        const srcFile = path.join(ep.poll.sourcePath, file.name);
        const fileStat = await stat(srcFile);

        const savedName = applyFilenameMask(naming, file.name);
        const destFile = path.join(destPath, savedName);

        await copyFile(srcFile, destFile);

        logFileUpload({
          timestamp: new Date().toISOString(),
          filename: savedName,
          originalFilename: file.name,
          fileSize: fileStat.size,
          mimeType: "",
          sourceIp: "local",
          sourceHostname: "poller",
          apiKeyId: "",
          apiKeyPartyName: "Poller",
          endpointSlug: ep.slug,
          destinationPath: destPath,
          destinationName: dest.name,
          status: "success",
        });

        if (ep.poll.deleteAfterTransfer) {
          await unlink(srcFile);
        }
      }

      if (files.length > 0) {
        auditLog({ actor: "poller", action: "poll.local.pull", targetType: "endpoint", targetId: ep.slug, details: { fileCount: files.length } });
      }
    } catch (err) {
      console.error(`[poller] Local poll error for ${ep.slug}:`, (err as Error).message);
    }
  }
}
