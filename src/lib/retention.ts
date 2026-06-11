import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { readJsonConfig } from "./config";
import { getDestinationById, isPathAccessible } from "./destinations";
import { DEFAULT_SETTINGS, type AppSettings, type DropEndpoint } from "./types";

const ENDPOINTS_FILE = "endpoints.json";
const SETTINGS_FILE = "settings.json";
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

let retentionTimer: ReturnType<typeof setInterval> | null = null;

function resolveRetentionDays(endpoint: DropEndpoint, settings: AppSettings): number | null {
  const raw = Number.isFinite(endpoint.retentionDays) ? Number(endpoint.retentionDays) : Number(settings.fileRetentionDays);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.floor(raw);
}

async function cleanupDirectoryOlderThan(dir: string, cutoffMs: number): Promise<number> {
  let deleted = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deleted += await cleanupDirectoryOlderThan(target, cutoffMs);
      continue;
    }
    if (!entry.isFile()) continue;

    try {
      const info = await stat(target);
      if (info.mtime.getTime() <= cutoffMs) {
        await unlink(target);
        deleted += 1;
      }
    } catch {
      // best-effort
    }
  }

  return deleted;
}

export async function cleanupEndpointRetention(endpoint: DropEndpoint): Promise<{ deleted: number; retentionDays: number | null }> {
  const settings = await readJsonConfig<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);

  const retentionDays = resolveRetentionDays(endpoint, settings);
  if (!retentionDays) return { deleted: 0, retentionDays: null };

  const dest = await getDestinationById(endpoint.destinationId);
  if (!dest) return { deleted: 0, retentionDays };
  if (!isPathAccessible(dest.localPath)) return { deleted: 0, retentionDays };

  let targetDir = dest.localPath;
  if (endpoint.subdirectory) targetDir = path.join(targetDir, endpoint.subdirectory);

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const deleted = await cleanupDirectoryOlderThan(targetDir, cutoffMs);
  return { deleted, retentionDays };
}

export async function cleanupAllEndpointRetention(): Promise<void> {
  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  for (const endpoint of endpoints) {
    try {
      await cleanupEndpointRetention(endpoint);
    } catch {
      // best-effort
    }
  }
}

export function startRetentionSweep(): void {
  if (retentionTimer) return;
  void cleanupAllEndpointRetention();
  retentionTimer = setInterval(() => {
    void cleanupAllEndpointRetention();
  }, SWEEP_INTERVAL_MS);
}
