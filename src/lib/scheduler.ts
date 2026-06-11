import type { Integration, Transfer } from "./types";
import { getTransfers, getTransferById } from "./transfers";
import { getIntegrations, getIntegrationById } from "./integrations";
import { runTransfer } from "./transfer-runner";
import { runIntegration } from "./integration-runner";
import { nextRunAt } from "./transfer-util";

/** Active transfer timers keyed by transfer id. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Transfers currently executing — used to prevent overlapping runs. */
const running = new Set<string>();

/** Active integration timers keyed by integration id. */
const integrationTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Integrations currently executing — used to prevent overlapping runs. */
const runningIntegrations = new Set<string>();

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

// ── Lifecycle ────────────────────────────────────────────────────────────────

/** Stop all timers (transfers and integrations). */
export function stopScheduler(): void {
  for (const id of Array.from(timers.keys())) clearTimer(id);
  for (const id of Array.from(integrationTimers.keys())) clearIntegrationTimer(id);
}

/** Load all transfers and integrations and schedule the enabled ones. Runs at boot. */
export async function startScheduler(): Promise<void> {
  stopScheduler();

  const transfers = await getTransfers();
  let transferCount = 0;
  for (const t of transfers) {
    if (t.enabled && t.schedule?.enabled) {
      scheduleTransfer(t);
      transferCount += 1;
    }
  }

  const integrations = await getIntegrations();
  let integrationCount = 0;
  for (const i of integrations) {
    if (i.enabled && i.schedule?.enabled) {
      scheduleIntegration(i);
      integrationCount += 1;
    }
  }

  console.log(`[scheduler] Scheduled ${transferCount} transfer(s) and ${integrationCount} integration(s)`);
}
