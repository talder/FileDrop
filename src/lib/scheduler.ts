import { watch as fsWatch, type FSWatcher } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import type { Integration, Transfer } from "./types";
import { getTransfers, getTransferById } from "./transfers";
import { getIntegrations, getIntegrationById } from "./integrations";
import { getDestinationById } from "./destinations";
import { runTransfer } from "./transfer-runner";
import { runIntegration } from "./integration-runner";
import { DEFAULT_WATCH_DEBOUNCE_MS, isInternalChange, nextRunAt } from "./transfer-util";

/** Active transfer timers keyed by transfer id. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Transfers currently executing — used to prevent overlapping runs. */
const running = new Set<string>();

/** Active integration timers keyed by integration id. */
const integrationTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Integrations currently executing — used to prevent overlapping runs. */
const runningIntegrations = new Set<string>();

/** Active transfer folder watchers keyed by transfer id. */
const transferWatchers = new Map<string, FSWatcher>();
/** Pending transfer watcher debounce timers keyed by transfer id. */
const transferWatchDebounce = new Map<string, ReturnType<typeof setTimeout>>();

/** Active integration folder watchers keyed by integration id. */
const integrationWatchers = new Map<string, FSWatcher>();
/** Pending integration watcher debounce timers keyed by integration id. */
const integrationWatchDebounce = new Map<string, ReturnType<typeof setTimeout>>();

/** setTimeout caps out around 24.8 days; re-arm in chunks no larger than this. */
const MAX_DELAY_MS = 60 * 60 * 1000; // 1 hour

// ── Transfers ────────────────────────────────────────────────────────────────

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

async function fire(id: string): Promise<void> {
  if (running.has(id)) return; // skip if a previous run is still going
  const transfer = await getTransferById(id);
  if (!transfer || !transfer.enabled || !transfer.schedule?.enabled) {
    clearTimer(id);
    return;
  }
  running.add(id);
  try {
    await runTransfer(transfer, "schedule");
  } catch (err) {
    console.error(`[scheduler] Transfer "${transfer.name}" failed:`, (err as Error).message);
  } finally {
    running.delete(id);
  }
}

/** Arm a one-shot timer for `when` (epoch ms), chunking long delays. */
function armAt(id: string, when: number): void {
  const delay = when - Date.now();
  if (delay > MAX_DELAY_MS) {
    timers.set(id, setTimeout(() => armAt(id, when), MAX_DELAY_MS));
    return;
  }
  timers.set(
    id,
    setTimeout(async () => {
      await fire(id);
      // Re-arm from the latest config (it may have changed during the run).
      const t = await getTransferById(id);
      if (t && t.enabled && t.schedule?.enabled) {
        const next = nextRunAt(t.schedule, new Date());
        if (next) armAt(id, next.getTime());
      } else {
        clearTimer(id);
      }
    }, Math.max(1000, delay)),
  );
}

/** (Re)schedule a single transfer. Safe to call repeatedly. */
export function scheduleTransfer(transfer: Transfer): void {
  clearTimer(transfer.id);
  if (!transfer.enabled || !transfer.schedule?.enabled) return;
  const next = nextRunAt(transfer.schedule, new Date());
  if (!next) return;
  armAt(transfer.id, next.getTime());
}

/** Stop scheduling a transfer (does not interrupt an in-flight run). */
export function unscheduleTransfer(id: string): void {
  clearTimer(id);
}

/** Re-read a transfer by id and (re)schedule or unschedule it. */
export async function rescheduleTransfer(id: string): Promise<void> {
  const transfer = await getTransferById(id);
  if (!transfer) {
    unscheduleTransfer(id);
    return;
  }
  scheduleTransfer(transfer);
}

// ── Integrations ─────────────────────────────────────────────────────────────

function clearIntegrationTimer(id: string): void {
  const timer = integrationTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    integrationTimers.delete(id);
  }
}

async function fireIntegration(id: string): Promise<void> {
  if (runningIntegrations.has(id)) return; // skip if a previous run is still going
  const integration = await getIntegrationById(id);
  if (!integration || !integration.enabled || !integration.schedule?.enabled) {
    clearIntegrationTimer(id);
    return;
  }
  runningIntegrations.add(id);
  try {
    await runIntegration(integration, "schedule");
  } catch (err) {
    console.error(`[scheduler] Integration "${integration.name}" failed:`, (err as Error).message);
  } finally {
    runningIntegrations.delete(id);
  }
}

/** Arm a one-shot integration timer for `when` (epoch ms), chunking long delays. */
function armIntegrationAt(id: string, when: number): void {
  const delay = when - Date.now();
  if (delay > MAX_DELAY_MS) {
    integrationTimers.set(id, setTimeout(() => armIntegrationAt(id, when), MAX_DELAY_MS));
    return;
  }
  integrationTimers.set(
    id,
    setTimeout(async () => {
      await fireIntegration(id);
      // Re-arm from the latest config (it may have changed during the run).
      const i = await getIntegrationById(id);
      if (i && i.enabled && i.schedule?.enabled) {
        const next = nextRunAt(i.schedule, new Date());
        if (next) armIntegrationAt(id, next.getTime());
      } else {
        clearIntegrationTimer(id);
      }
    }, Math.max(1000, delay)),
  );
}

/** (Re)schedule a single integration. Safe to call repeatedly. */
export function scheduleIntegration(integration: Integration): void {
  clearIntegrationTimer(integration.id);
  if (!integration.enabled || !integration.schedule?.enabled) return;
  const next = nextRunAt(integration.schedule, new Date());
  if (!next) return;
  armIntegrationAt(integration.id, next.getTime());
}

/** Stop scheduling an integration (does not interrupt an in-flight run). */
export function unscheduleIntegration(id: string): void {
  clearIntegrationTimer(id);
}

/** Re-read an integration by id and (re)schedule or unschedule it. */
export async function rescheduleIntegration(id: string): Promise<void> {
  const integration = await getIntegrationById(id);
  if (!integration) {
    unscheduleIntegration(id);
    return;
  }
  scheduleIntegration(integration);
}

// ── Folder watchers ──────────────────────────────────────────────────────────
// Watchers reuse the `running` / `runningIntegrations` guards above so a
// watch-triggered run never overlaps a scheduled run of the same job. On a
// file-system event we debounce, then trigger a normal run (the runner scans
// and selects the whole folder, so the changed filename is not needed).

/** Only push transfers have a local source folder that can be watched. */
function transferWatchEligible(transfer: Transfer): boolean {
  return !!transfer.enabled && transfer.direction === "push" && !!transfer.watch?.enabled;
}

function integrationWatchEligible(integration: Integration): boolean {
  return !!integration.enabled && !!integration.watch?.enabled;
}

/** Resolve the local source folder for a push transfer, or null. */
async function resolveTransferWatchDir(transfer: Transfer): Promise<string | null> {
  if (transfer.direction !== "push") return null;
  const dest = await getDestinationById(transfer.destinationId);
  if (!dest) return null;
  return transfer.subdirectory ? path.join(dest.localPath, transfer.subdirectory) : dest.localPath;
}

/** Resolve the local source folder for an integration, or null. */
async function resolveIntegrationWatchDir(integration: Integration): Promise<string | null> {
  const dest = await getDestinationById(integration.sourceDestinationId);
  if (!dest) return null;
  return integration.sourceSubdirectory
    ? path.join(dest.localPath, integration.sourceSubdirectory)
    : dest.localPath;
}

/** Subdirectories the transfer runner writes to itself (ignored by the watcher). */
function transferInternalDirs(transfer: Transfer): string[] {
  return [transfer.retryPolicy?.deadLetterSubdirectory || "_dead-letter"];
}

/** Subdirectories the integration runner writes to itself (ignored by the watcher). */
function integrationInternalDirs(integration: Integration): string[] {
  return [
    integration.retryPolicy?.deadLetterSubdirectory || "_dead-letter",
    integration.archivePolicy?.subdirectory || "success",
  ];
}

function normalizeWatchFilename(filename: string | Buffer | null): string | null {
  if (filename == null) return null;
  return typeof filename === "string" ? filename : filename.toString();
}

// ── Transfer watchers ─────────────────────────────────────────────────────────

function closeTransferWatcher(id: string): void {
  const watcher = transferWatchers.get(id);
  if (watcher) {
    try { watcher.close(); } catch { /* already closed */ }
    transferWatchers.delete(id);
  }
  const debounce = transferWatchDebounce.get(id);
  if (debounce) {
    clearTimeout(debounce);
    transferWatchDebounce.delete(id);
  }
}

function scheduleTransferWatchDebounce(id: string, debounceMs: number): void {
  const existing = transferWatchDebounce.get(id);
  if (existing) clearTimeout(existing);
  transferWatchDebounce.set(
    id,
    setTimeout(() => {
      transferWatchDebounce.delete(id);
      void fireTransferWatch(id);
    }, debounceMs),
  );
}

async function fireTransferWatch(id: string): Promise<void> {
  const transfer = await getTransferById(id);
  if (!transfer || !transferWatchEligible(transfer)) {
    closeTransferWatcher(id);
    return;
  }
  const debounceMs = transfer.watch?.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;
  if (running.has(id)) {
    // A run is in progress; re-arm so files added during the run aren't missed.
    scheduleTransferWatchDebounce(id, debounceMs);
    return;
  }
  running.add(id);
  try {
    await runTransfer(transfer, "watch");
  } catch (err) {
    console.error(`[watcher] Transfer "${transfer.name}" failed:`, (err as Error).message);
  } finally {
    running.delete(id);
  }
}

/** (Re)arm the folder watcher for a single transfer. Safe to call repeatedly. */
export async function watchTransfer(transfer: Transfer): Promise<void> {
  closeTransferWatcher(transfer.id);
  if (!transferWatchEligible(transfer)) return;
  const dir = await resolveTransferWatchDir(transfer);
  if (!dir) return;
  try { await mkdir(dir, { recursive: true }); } catch { /* best effort */ }

  const internalDirs = transferInternalDirs(transfer);
  const debounceMs = transfer.watch?.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;
  let watcher: FSWatcher;
  try {
    watcher = fsWatch(dir, { recursive: !!transfer.watch?.recursive });
  } catch (err) {
    console.error(`[watcher] Failed to watch "${dir}" for transfer "${transfer.name}":`, (err as Error).message);
    return;
  }
  watcher.on("change", (_event, filename) => {
    if (isInternalChange(normalizeWatchFilename(filename), internalDirs)) return;
    scheduleTransferWatchDebounce(transfer.id, debounceMs);
  });
  watcher.on("error", (err) => {
    console.error(`[watcher] Transfer "${transfer.name}" watch error:`, (err as Error).message);
    closeTransferWatcher(transfer.id);
  });
  transferWatchers.set(transfer.id, watcher);
}

/** Stop watching a transfer's folder. */
export function unwatchTransfer(id: string): void {
  closeTransferWatcher(id);
}

/** Re-read a transfer by id and (re)arm or remove its watcher. */
export async function rewatchTransfer(id: string): Promise<void> {
  const transfer = await getTransferById(id);
  if (!transfer) {
    unwatchTransfer(id);
    return;
  }
  await watchTransfer(transfer);
}

// ── Integration watchers ──────────────────────────────────────────────────────

function closeIntegrationWatcher(id: string): void {
  const watcher = integrationWatchers.get(id);
  if (watcher) {
    try { watcher.close(); } catch { /* already closed */ }
    integrationWatchers.delete(id);
  }
  const debounce = integrationWatchDebounce.get(id);
  if (debounce) {
    clearTimeout(debounce);
    integrationWatchDebounce.delete(id);
  }
}

function scheduleIntegrationWatchDebounce(id: string, debounceMs: number): void {
  const existing = integrationWatchDebounce.get(id);
  if (existing) clearTimeout(existing);
  integrationWatchDebounce.set(
    id,
    setTimeout(() => {
      integrationWatchDebounce.delete(id);
      void fireIntegrationWatch(id);
    }, debounceMs),
  );
}

async function fireIntegrationWatch(id: string): Promise<void> {
  const integration = await getIntegrationById(id);
  if (!integration || !integrationWatchEligible(integration)) {
    closeIntegrationWatcher(id);
    return;
  }
  const debounceMs = integration.watch?.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;
  if (runningIntegrations.has(id)) {
    scheduleIntegrationWatchDebounce(id, debounceMs);
    return;
  }
  runningIntegrations.add(id);
  try {
    await runIntegration(integration, "watch");
  } catch (err) {
    console.error(`[watcher] Integration "${integration.name}" failed:`, (err as Error).message);
  } finally {
    runningIntegrations.delete(id);
  }
}

/** (Re)arm the folder watcher for a single integration. Safe to call repeatedly. */
export async function watchIntegration(integration: Integration): Promise<void> {
  closeIntegrationWatcher(integration.id);
  if (!integrationWatchEligible(integration)) return;
  const dir = await resolveIntegrationWatchDir(integration);
  if (!dir) return;
  try { await mkdir(dir, { recursive: true }); } catch { /* best effort */ }

  const internalDirs = integrationInternalDirs(integration);
  const debounceMs = integration.watch?.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;
  let watcher: FSWatcher;
  try {
    watcher = fsWatch(dir, { recursive: !!integration.watch?.recursive });
  } catch (err) {
    console.error(`[watcher] Failed to watch "${dir}" for integration "${integration.name}":`, (err as Error).message);
    return;
  }
  watcher.on("change", (_event, filename) => {
    if (isInternalChange(normalizeWatchFilename(filename), internalDirs)) return;
    scheduleIntegrationWatchDebounce(integration.id, debounceMs);
  });
  watcher.on("error", (err) => {
    console.error(`[watcher] Integration "${integration.name}" watch error:`, (err as Error).message);
    closeIntegrationWatcher(integration.id);
  });
  integrationWatchers.set(integration.id, watcher);
}

/** Stop watching an integration's source folder. */
export function unwatchIntegration(id: string): void {
  closeIntegrationWatcher(id);
}

/** Re-read an integration by id and (re)arm or remove its watcher. */
export async function rewatchIntegration(id: string): Promise<void> {
  const integration = await getIntegrationById(id);
  if (!integration) {
    unwatchIntegration(id);
    return;
  }
  await watchIntegration(integration);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/** Stop all timers and watchers (transfers and integrations). */
export function stopScheduler(): void {
  for (const id of Array.from(timers.keys())) clearTimer(id);
  for (const id of Array.from(integrationTimers.keys())) clearIntegrationTimer(id);
  for (const id of Array.from(transferWatchers.keys())) closeTransferWatcher(id);
  for (const id of Array.from(integrationWatchers.keys())) closeIntegrationWatcher(id);
}

/** Load all transfers and integrations and arm schedules + watchers. Runs at boot. */
export async function startScheduler(): Promise<void> {
  stopScheduler();

  const transfers = await getTransfers();
  let transferCount = 0;
  let transferWatchCount = 0;
  for (const t of transfers) {
    if (t.enabled && t.schedule?.enabled) {
      scheduleTransfer(t);
      transferCount += 1;
    }
    if (transferWatchEligible(t)) {
      await watchTransfer(t);
      transferWatchCount += 1;
    }
  }

  const integrations = await getIntegrations();
  let integrationCount = 0;
  let integrationWatchCount = 0;
  for (const i of integrations) {
    if (i.enabled && i.schedule?.enabled) {
      scheduleIntegration(i);
      integrationCount += 1;
    }
    if (integrationWatchEligible(i)) {
      await watchIntegration(i);
      integrationWatchCount += 1;
    }
  }

  console.log(
    `[scheduler] Scheduled ${transferCount} transfer(s) and ${integrationCount} integration(s); ` +
      `watching ${transferWatchCount} transfer folder(s) and ${integrationWatchCount} integration folder(s)`,
  );
}
