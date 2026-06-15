import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

const CONFIG_DIR = path.join(process.cwd(), "config");
const DB_PATH = path.join(CONFIG_DIR, "filedrop.db");

// ── SQLite singleton ──────────────────────────────────────────────────────────

let _db: BetterSqlite3.Database | null = null;

export function getDb(): BetterSqlite3.Database {
  if (_db) return _db;

  if (!fsSync.existsSync(CONFIG_DIR)) {
    fsSync.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");

  // KV table (users, sessions, endpoints, destinations, settings)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // File log table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS file_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp         TEXT NOT NULL,
      filename          TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_size         INTEGER NOT NULL,
      mime_type         TEXT NOT NULL DEFAULT '',
      source_ip         TEXT NOT NULL DEFAULT '',
      api_key_id        TEXT NOT NULL DEFAULT '',
      api_key_party     TEXT NOT NULL DEFAULT '',
      endpoint_slug     TEXT NOT NULL,
      destination_path  TEXT NOT NULL DEFAULT '',
      checksum_sha256   TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'success',
      error_message     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_file_log_ts ON file_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_file_log_endpoint ON file_log(endpoint_slug);
    CREATE INDEX IF NOT EXISTS idx_file_log_endpoint_checksum ON file_log(endpoint_slug, checksum_sha256);
    CREATE INDEX IF NOT EXISTS idx_file_log_status ON file_log(status);
  `);

  // API keys table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id                TEXT PRIMARY KEY,
      party_name        TEXT NOT NULL,
      key_hash          TEXT NOT NULL UNIQUE,
      key_prefix        TEXT NOT NULL,
      allowed_endpoints TEXT NOT NULL DEFAULT '[]',
      expires_at        TEXT,
      revoked_at        TEXT,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  `);

  // Audit log table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT NOT NULL,
      actor       TEXT NOT NULL,
      action      TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id   TEXT NOT NULL DEFAULT '',
      details     TEXT,
      source_ip   TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  `);

  // Connection log table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS connection_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp       TEXT NOT NULL,
      source_ip       TEXT NOT NULL DEFAULT '',
      hostname        TEXT NOT NULL DEFAULT '',
      method          TEXT NOT NULL DEFAULT '',
      path            TEXT NOT NULL DEFAULT '',
      status_code     INTEGER NOT NULL DEFAULT 0,
      api_key_id      TEXT NOT NULL DEFAULT '',
      party_name      TEXT NOT NULL DEFAULT '',
      user_agent      TEXT NOT NULL DEFAULT '',
      response_time_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_conn_ts ON connection_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_conn_ip ON connection_log(source_ip);
  `);

  // Transfer runs table (run-level history for SFTP transfers)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id    TEXT NOT NULL,
      transfer_name  TEXT NOT NULL DEFAULT '',
      direction      TEXT NOT NULL DEFAULT '',
      trigger        TEXT NOT NULL DEFAULT '',
      started_at     TEXT NOT NULL,
      finished_at    TEXT,
      status         TEXT NOT NULL DEFAULT 'running',
      files_total    INTEGER NOT NULL DEFAULT 0,
      files_ok       INTEGER NOT NULL DEFAULT 0,
      files_failed   INTEGER NOT NULL DEFAULT 0,
      bytes          INTEGER NOT NULL DEFAULT 0,
      error_message  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transfer_runs_ts ON transfer_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_transfer_runs_tid ON transfer_runs(transfer_id);
  `);

  // Integration runs table (run-level history for integration pipelines)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS integration_runs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_id   TEXT NOT NULL,
      integration_name TEXT NOT NULL DEFAULT '',
      trigger          TEXT NOT NULL DEFAULT '',
      started_at       TEXT NOT NULL,
      finished_at      TEXT,
      status           TEXT NOT NULL DEFAULT 'running',
      files_total      INTEGER NOT NULL DEFAULT 0,
      files_ok         INTEGER NOT NULL DEFAULT 0,
      files_failed     INTEGER NOT NULL DEFAULT 0,
      error_message    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_integration_runs_ts  ON integration_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_integration_runs_iid ON integration_runs(integration_id);
  `);

  // Migration: ensure newer file_log columns exist. We inspect the live schema
  // first and only ALTER genuinely-missing columns, so real failures surface
  // instead of being swallowed. (A blanket try/catch here previously hid a
  // failed ALTER, leaving production without checksum_sha256 until restart.)
  ensureColumns(_db, "file_log", [
    ["source_hostname", "TEXT NOT NULL DEFAULT ''"],
    ["destination_name", "TEXT NOT NULL DEFAULT ''"],
    ["checksum_sha256", "TEXT NOT NULL DEFAULT ''"],
  ]);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_file_log_endpoint_checksum ON file_log(endpoint_slug, checksum_sha256)`);

  return _db;
}

/**
 * Idempotently add any of the given columns that are not already present on the
 * table. Existing columns are skipped (so no spurious "duplicate column"
 * errors), while a genuine ALTER failure is allowed to throw so it is visible.
 */
function ensureColumns(
  db: BetterSqlite3.Database,
  table: string,
  columns: [name: string, ddl: string][],
) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const existing = new Set(rows.map((r) => r.name));
  for (const [name, ddl] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }
}

// ── Directory helpers ─────────────────────────────────────────────────────────

export function getConfigDir() {
  return CONFIG_DIR;
}

export async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// ── SQLite-backed JSON config read/write ──────────────────────────────────────

export async function readJsonConfig<T>(filename: string, defaultValue: T): Promise<T> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(filename) as
    | { value: string }
    | undefined;
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeJsonConfig<T>(filename: string, data: T) {
  const db = getDb();
  const json = JSON.stringify(data, null, 2);
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    filename,
    json,
  );
}
