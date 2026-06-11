import os from "os";
import dgram from "dgram";
import net from "net";
import { readJsonConfig } from "./config";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

const SETTINGS_FILE = "settings.json";
const SETTINGS_TTL_MS = 5000;
const SEND_TIMEOUT_MS = 4000;

export type VictoriaLogProtocol = "http" | "syslog-udp" | "syslog-tcp";

export interface VictoriaLogTarget {
  enabled: boolean;
  host: string;
  port: number;
  protocol: VictoriaLogProtocol;
}

export type LogLevel = "info" | "warn" | "error";

type Fields = Record<string, unknown> & { message?: string };

let _cache: { at: number; target: VictoriaLogTarget } | null = null;

/** Drop the cached settings so the next event re-reads from storage. */
export function invalidateVictoriaLogsCache(): void {
  _cache = null;
}

async function getTarget(): Promise<VictoriaLogTarget> {
  if (_cache && Date.now() - _cache.at < SETTINGS_TTL_MS) return _cache.target;
  const s = await readJsonConfig<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);
  const target: VictoriaLogTarget = {
    enabled: s.victoriaLogsEnabled ?? DEFAULT_SETTINGS.victoriaLogsEnabled,
    host: s.victoriaLogsHost ?? DEFAULT_SETTINGS.victoriaLogsHost,
    port: s.victoriaLogsPort ?? DEFAULT_SETTINGS.victoriaLogsPort,
    protocol: s.victoriaLogsProtocol ?? DEFAULT_SETTINGS.victoriaLogsProtocol,
  };
  _cache = { at: Date.now(), target };
  return target;
}

function buildRecord(category: string, level: LogLevel, fields: Fields): Record<string, unknown> {
  const { message, ...rest } = fields;
  return {
    _msg: message || `${category} event`,
    _time: new Date().toISOString(),
    app: "filedrop",
    host: os.hostname(),
    category,
    level,
    ...rest,
  };
}

function syslogPriority(level: LogLevel): number {
  // facility = 1 (user-level); severity: error=3, warn=4, info=6
  const severity = level === "error" ? 3 : level === "warn" ? 4 : 6;
  return 1 * 8 + severity;
}

/** Build an RFC5424 syslog line whose MSG is the JSON record (preserves fields). */
function toSyslogLine(record: Record<string, unknown>, level: LogLevel, category: string): string {
  const pri = syslogPriority(level);
  const ts = (record._time as string) || new Date().toISOString();
  const host = (record.host as string) || os.hostname();
  const msgid = category.replace(/\s+/g, "_") || "event";
  return `<${pri}>1 ${ts} ${host} filedrop ${process.pid} ${msgid} - ${JSON.stringify(record)}`;
}

function sendUdp(target: VictoriaLogTarget, payload: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const done = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch { /* ignore */ }
      resolve(result);
    };
    const timer = setTimeout(() => done({ success: false, error: "timeout" }), SEND_TIMEOUT_MS);
    socket.on("error", (err) => { clearTimeout(timer); done({ success: false, error: err.message }); });
    socket.send(Buffer.from(payload), target.port, target.host, (err) => {
      clearTimeout(timer);
      done(err ? { success: false, error: err.message } : { success: true });
    });
  });
}

function sendTcp(target: VictoriaLogTarget, payload: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };
    const socket = net.createConnection({ host: target.host, port: target.port });
    socket.setTimeout(SEND_TIMEOUT_MS);
    socket.on("connect", () => socket.write(`${payload}\n`, () => done({ success: true })));
    socket.on("timeout", () => done({ success: false, error: "timeout" }));
    socket.on("error", (err) => done({ success: false, error: err.message }));
  });
}

async function sendHttp(target: VictoriaLogTarget, record: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const url = `http://${target.host}:${target.port}/insert/jsonline?_stream_fields=app,category&_msg_field=_msg&_time_field=_time`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/stream+json" },
      body: `${JSON.stringify(record)}\n`,
      signal: controller.signal,
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function dispatch(
  target: VictoriaLogTarget,
  record: Record<string, unknown>,
  level: LogLevel,
  category: string,
): Promise<{ success: boolean; error?: string }> {
  if (target.protocol === "http") return sendHttp(target, record);
  const line = toSyslogLine(record, level, category);
  return target.protocol === "syslog-tcp" ? sendTcp(target, line) : sendUdp(target, line);
}

/**
 * Forward a single event to VictoriaLogs. Fire-and-forget: this never throws
 * and never blocks the caller. No-op when forwarding is disabled or unconfigured.
 */
export function forwardToVictoriaLogs(category: string, fields: Fields, level: LogLevel = "info"): void {
  void (async () => {
    try {
      const target = await getTarget();
      if (!target.enabled || !target.host) return;
      const record = buildRecord(category, level, fields);
      await dispatch(target, record, level, category);
    } catch {
      // Best-effort only: swallow all errors so logging never affects requests.
    }
  })();
}

/** Send a test event using explicit settings (does not touch the cache). */
export async function testVictoriaLogs(
  target: VictoriaLogTarget,
): Promise<{ success: boolean; error?: string }> {
  if (!target.host) return { success: false, error: "Host is required" };
  const record = buildRecord("test", "info", { message: "FileDrop VictoriaLogs connectivity test" });
  try {
    return await dispatch(target, record, "info", "test");
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
