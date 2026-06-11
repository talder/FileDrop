import { readJsonConfig, writeJsonConfig } from "./config";
import type { Transfer, TransferRunStatus } from "./types";

const TRANSFERS_FILE = "transfers.json";

export async function getTransfers(): Promise<Transfer[]> {
  return readJsonConfig<Transfer[]>(TRANSFERS_FILE, []);
}

export async function writeTransfers(transfers: Transfer[]): Promise<void> {
  await writeJsonConfig(TRANSFERS_FILE, transfers);
}

export async function getTransferById(id: string): Promise<Transfer | null> {
  const transfers = await getTransfers();
  return transfers.find((t) => t.id === id) || null;
}

/** Persist the last-run summary onto a transfer (denormalized for list display). */
export async function setTransferLastRun(
  id: string,
  result: { at: string; status: TransferRunStatus; error?: string },
): Promise<void> {
  const transfers = await getTransfers();
  const idx = transfers.findIndex((t) => t.id === id);
  if (idx === -1) return;
  transfers[idx].lastRunAt = result.at;
  transfers[idx].lastStatus = result.status;
  transfers[idx].lastError = result.error;
  await writeTransfers(transfers);
}
