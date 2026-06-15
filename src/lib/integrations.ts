import { readJsonConfig, writeJsonConfig } from "./config";
import type { ArchivePolicy, FileNaming, Integration, TransferRunStatus } from "./types";

const INTEGRATIONS_FILE = "integrations.json";

export async function getIntegrations(): Promise<Integration[]> {
  return readJsonConfig<Integration[]>(INTEGRATIONS_FILE, []);
}

export async function writeIntegrations(integrations: Integration[]): Promise<void> {
  await writeJsonConfig(INTEGRATIONS_FILE, integrations);
}

export async function getIntegrationById(id: string): Promise<Integration | null> {
  const integrations = await getIntegrations();
  return integrations.find((i) => i.id === id) || null;
}

function normalizeFileNaming(input: unknown): FileNaming {
  if (input && typeof input === "object") {
    const fn = input as { mode?: unknown; mask?: unknown };
    if (fn.mode === "mask") {
      return { mode: "mask", mask: typeof fn.mask === "string" ? fn.mask : "" };
    }
  }
  return { mode: "original", mask: "" };
}

/** Coerce arbitrary input into a safe ArchivePolicy (disabled by default; "success" subdir). */
export function normalizeArchivePolicy(input: unknown): ArchivePolicy {
  const cfg = (input && typeof input === "object" ? input : {}) as {
    enabled?: unknown;
    subdirectory?: unknown;
    fileNaming?: unknown;
  };
  const subdirectory =
    typeof cfg.subdirectory === "string" && cfg.subdirectory.trim()
      ? cfg.subdirectory.trim()
      : "success";
  return {
    enabled: !!cfg.enabled,
    subdirectory,
    fileNaming: normalizeFileNaming(cfg.fileNaming),
  };
}

/** Persist the last-run summary onto an integration (denormalized for list display). */
export async function setIntegrationLastRun(
  id: string,
  result: { at: string; status: TransferRunStatus; error?: string },
): Promise<void> {
  const integrations = await getIntegrations();
  const idx = integrations.findIndex((i) => i.id === id);
  if (idx === -1) return;
  integrations[idx].lastRunAt = result.at;
  integrations[idx].lastStatus = result.status;
  integrations[idx].lastError = result.error;
  await writeIntegrations(integrations);
}
