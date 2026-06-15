import { extname } from "path";
import type {
  FolderWatch,
  SftpConnection,
  Transfer,
  TransferConflictPolicy,
  TransferSchedule,
  TransferScheduleUnit,
  TransferSelection,
} from "./types";

// ── File selection ───────────────────────────────────────────────────────────

export interface SelectableFile {
  /** Base filename, e.g. "invoice.xml" */
  name: string;
  /** Path relative to the listing root, e.g. "2024/invoice.xml" */
  relPath: string;
}

/** Minimum seconds allowed for the "seconds" schedule unit. */
export const MIN_SCHEDULE_SECONDS = 5;

/** Convert a simple glob (supporting * and ?) into an anchored RegExp. */
export function globToRegExp(pattern: string, flags = ""): RegExp {
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, flags);
}

function normalizeExt(ext: string): string {
  const e = ext.trim().toLowerCase();
  if (!e) return "";
  return e.startsWith(".") ? e : `.${e}`;
}

function passesExtensionFilter(name: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) return true;
  const fileExt = extname(name).toLowerCase();
  return extensions.map(normalizeExt).includes(fileExt);
}

/** Decide whether a single file matches the selection rules. */
export function isSelected(file: SelectableFile, sel: TransferSelection): boolean {
  if (!passesExtensionFilter(file.name, sel.extensions)) return false;

  switch (sel.mode) {
    case "all":
      return true;
    case "single":
      return !!sel.value && (file.name === sel.value || file.relPath === sel.value);
    case "glob":
      return !!sel.value && globToRegExp(sel.value).test(file.name);
    case "list":
      return !!sel.list && (sel.list.includes(file.name) || sel.list.includes(file.relPath));
    default:
      return false;
  }
}

/** Filter a list of files down to those matching the selection. */
export function selectFiles<T extends SelectableFile>(files: T[], sel: TransferSelection): T[] {
  return files.filter((f) => isSelected(f, sel));
}

// ── Conflict resolution ────────────────────────────────────────────────────--

export interface ConflictResolution {
  action: "write" | "skip";
  /** Target filename to use when action === "write". */
  name?: string;
}

/** Find a non-colliding name by appending " (n)" before the extension. */
export function uniqueName(desired: string, exists: (name: string) => boolean): string {
  if (!exists(desired)) return desired;
  const ext = extname(desired);
  const base = desired.slice(0, desired.length - ext.length);
  let i = 1;
  let candidate = `${base} (${i})${ext}`;
  while (exists(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  return candidate;
}

/** Resolve how to write `desired` given the target's conflict policy. */
export function applyConflictPolicy(
  desired: string,
  policy: TransferConflictPolicy,
  exists: (name: string) => boolean,
): ConflictResolution {
  if (!exists(desired)) return { action: "write", name: desired };
  switch (policy) {
    case "overwrite":
      return { action: "write", name: desired };
    case "skip":
      return { action: "skip" };
    case "rename":
    default:
      return { action: "write", name: uniqueName(desired, exists) };
  }
}

// ── Scheduling ─────────────────────────────────────────────────────────────--

const UNIT_MS: Record<TransferScheduleUnit, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateSchedule(schedule: TransferSchedule): { valid: boolean; error?: string } {
  if (!schedule) return { valid: false, error: "Schedule is required" };
  if (!schedule.enabled) return { valid: true };
  if (!Number.isFinite(schedule.every) || schedule.every < 1) {
    return { valid: false, error: "Interval must be at least 1" };
  }
  if (!UNIT_MS[schedule.unit]) {
    return { valid: false, error: "Invalid schedule unit" };
  }
  if (schedule.unit === "seconds" && schedule.every < MIN_SCHEDULE_SECONDS) {
    return { valid: false, error: `Minimum interval is ${MIN_SCHEDULE_SECONDS} seconds` };
  }
  if (schedule.atTime && !HHMM_RE.test(schedule.atTime)) {
    return { valid: false, error: "Time of day must be in HH:MM format" };
  }
  return { valid: true };
}

/** Clamp a schedule to safe values. */
export function normalizeSchedule(schedule: TransferSchedule): TransferSchedule {
  const every = Math.max(1, Math.floor(schedule.every || 1));
  const clamped =
    schedule.unit === "seconds" ? Math.max(MIN_SCHEDULE_SECONDS, every) : every;
  return {
    enabled: !!schedule.enabled,
    every: clamped,
    unit: schedule.unit,
    atTime: schedule.atTime && HHMM_RE.test(schedule.atTime) ? schedule.atTime : undefined,
  };
}

/**
 * Fixed repeat interval in ms, or null when the schedule is time-of-day based
 * (unit === "days" with atTime) and must be computed via nextRunAt.
 */
export function scheduleIntervalMs(schedule: TransferSchedule): number | null {
  if (!schedule.enabled) return null;
  const s = normalizeSchedule(schedule);
  if (s.unit === "days" && s.atTime) return null;
  return UNIT_MS[s.unit] * s.every;
}

/** Compute the next run time after `from`. */
export function nextRunAt(schedule: TransferSchedule, from: Date = new Date()): Date | null {
  if (!schedule || !schedule.enabled) return null;
  const s = normalizeSchedule(schedule);

  if (s.unit === "days" && s.atTime) {
    const [h, m] = s.atTime.split(":").map(Number);
    const next = new Date(from);
    next.setHours(h, m, 0, 0);
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + s.every);
    return next;
  }

  return new Date(from.getTime() + UNIT_MS[s.unit] * s.every);
}

/** Human-readable schedule summary for UI/logs. */
export function describeSchedule(schedule: TransferSchedule): string {
  if (!schedule || !schedule.enabled) return "Manual only";
  const s = normalizeSchedule(schedule);
  if (s.unit === "days" && s.atTime) {
    return s.every === 1 ? `Daily at ${s.atTime}` : `Every ${s.every} days at ${s.atTime}`;
  }
  const unitLabel = s.every === 1 ? s.unit.replace(/s$/, "") : s.unit;
  return `Every ${s.every} ${unitLabel}`;
}

// ── Folder watching ──────────────────────────────────────────────────────────

/** Default quiet period before a watcher triggers a run. */
export const DEFAULT_WATCH_DEBOUNCE_MS = 2000;
/** Smallest debounce window we allow (guards against event storms). */
export const MIN_WATCH_DEBOUNCE_MS = 250;
/** Largest debounce window we allow. */
export const MAX_WATCH_DEBOUNCE_MS = 60_000;

/** Coerce arbitrary input into a safe FolderWatch (disabled by default). */
export function normalizeWatch(input: unknown): FolderWatch {
  const cfg = (input && typeof input === "object" ? input : {}) as {
    enabled?: unknown;
    recursive?: unknown;
    debounceMs?: unknown;
  };
  const raw = Number(cfg.debounceMs);
  const debounceMs = Number.isFinite(raw)
    ? Math.min(MAX_WATCH_DEBOUNCE_MS, Math.max(MIN_WATCH_DEBOUNCE_MS, Math.floor(raw)))
    : DEFAULT_WATCH_DEBOUNCE_MS;
  return {
    enabled: !!cfg.enabled,
    recursive: !!cfg.recursive,
    debounceMs,
  };
}

/**
 * Whether a watcher event for `filename` (relative to the watched root) targets
 * an internal subdirectory the runner itself writes to (archive / dead-letter).
 * Used to avoid self-trigger loops under recursive watching. A null/empty
 * filename (some platforms) is treated as non-internal so the run still fires.
 */
export function isInternalChange(
  filename: string | null | undefined,
  internalDirs: string[],
): boolean {
  if (!filename) return false;
  const first = filename.split(/[\\/]/).find(Boolean);
  if (!first) return false;
  return internalDirs.some((d) => d && d.trim() && d.trim() === first);
}

/** Human-readable selection summary for UI. */
export function describeSelection(sel: TransferSelection): string {
  const extPart = sel.extensions && sel.extensions.length > 0 ? ` [${sel.extensions.join(", ")}]` : "";
  switch (sel.mode) {
    case "single":
      return `File: ${sel.value || "?"}`;
    case "glob":
      return `Pattern: ${sel.value || "?"}${extPart}`;
    case "list":
      return `${sel.list?.length || 0} file(s)${extPart}`;
    case "all":
    default:
      return `All files${sel.recursive ? " (recursive)" : ""}${extPart}`;
  }
}

// ── Legacy migration mapping (pure) ──────────────────────────────────────────

/** Shape of a pre-migration SFTP-client endpoint (loosely typed). */
export interface LegacySftpEndpoint {
  id: string;
  slug?: string;
  description?: string;
  type?: string;
  destinationId?: string;
  subdirectory?: string;
  allowedExtensions?: string[];
  enabled?: boolean;
  fileNaming?: Transfer["fileNaming"];
  sftp?: {
    host: string;
    port?: number;
    username: string;
    passwordEncrypted?: string;
    privateKey?: string;
    remotePath?: string;
    direction?: "pull" | "push";
  };
  poll?: { enabled?: boolean; intervalSeconds?: number; deleteAfterTransfer?: boolean };
  notifications?: Transfer["notifications"];
}

const DEFAULT_MASK = "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}";

/**
 * Map a legacy `type === "sftp"` endpoint to a reusable SFTP connection plus a
 * Transfer. Pure: the caller supplies generated ids and a timestamp. Returns
 * null if the endpoint is not a migratable SFTP-client endpoint.
 */
export function mapLegacyEndpoint(
  ep: LegacySftpEndpoint,
  opts: { connectionId: string; transferId: string; now: string },
): { connection: SftpConnection; transfer: Transfer } | null {
  if (ep.type !== "sftp" || !ep.sftp) return null;
  const s = ep.sftp;
  const name = ep.slug || s.host;

  const connection: SftpConnection = {
    id: opts.connectionId,
    name,
    host: s.host,
    port: s.port || 22,
    username: s.username,
    passwordEncrypted: s.passwordEncrypted,
    privateKey: s.privateKey,
    createdAt: opts.now,
  };

  const pollEnabled = !!ep.poll?.enabled;
  const schedule: TransferSchedule = {
    enabled: pollEnabled,
    every: pollEnabled ? Math.max(MIN_SCHEDULE_SECONDS, ep.poll?.intervalSeconds || 60) : 60,
    unit: "seconds",
  };

  const exts = ep.allowedExtensions || [];
  const transfer: Transfer = {
    id: opts.transferId,
    name,
    description: ep.description || "",
    enabled: ep.enabled !== false,
    connectionId: opts.connectionId,
    direction: s.direction === "push" ? "push" : "pull",
    remotePath: s.remotePath || ".",
    destinationId: ep.destinationId || "",
    subdirectory: ep.subdirectory || undefined,
    selection: exts.length > 0 ? { mode: "all", extensions: exts } : { mode: "all" },
    fileNaming: ep.fileNaming || { mode: "mask", mask: DEFAULT_MASK },
    conflictPolicy: "skip",
    deleteSourceAfterTransfer: !!ep.poll?.deleteAfterTransfer,
    schedule,
    notifications: ep.notifications,
    createdAt: opts.now,
  };

  return { connection, transfer };
}
