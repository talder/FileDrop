import { readJsonConfig, writeJsonConfig } from "./config";
import type { Integration, TransferRunStatus } from "./types";

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
