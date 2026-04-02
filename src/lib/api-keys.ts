import { randomBytes, createHash, randomUUID } from "crypto";
import { getDb } from "./config";
import type { ApiKey } from "./types";

const KEY_PREFIX = "fd_";

/** Generate a new API key. Returns { plaintext, apiKey } where plaintext is shown once. */
export function generateApiKey(partyName: string, allowedEndpoints: string[], expiresAt: string | null): { plaintext: string; apiKey: ApiKey } {
  const raw = randomBytes(48).toString("base64url");
  const plaintext = `${KEY_PREFIX}${raw}`;
  const keyHash = createHash("sha256").update(plaintext).digest("hex");
  const keyPrefix = plaintext.substring(0, 11); // "fd_" + first 8 chars

  const apiKey: ApiKey = {
    id: randomUUID(),
    partyName,
    keyHash,
    keyPrefix,
    allowedEndpoints,
    expiresAt,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO api_keys (id, party_name, key_hash, key_prefix, allowed_endpoints, expires_at, revoked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    apiKey.id, apiKey.partyName, apiKey.keyHash, apiKey.keyPrefix,
    JSON.stringify(apiKey.allowedEndpoints), apiKey.expiresAt, apiKey.revokedAt, apiKey.createdAt
  );

  return { plaintext, apiKey };
}

/** Get all API keys (without hash) */
export function getAllApiKeys(): ApiKey[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as Array<Record<string, string | null>>;
  return rows.map(rowToApiKey);
}

/** Find an API key by its plaintext (used during request validation) */
export function validateApiKey(plaintext: string): ApiKey | null {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;

  const keyHash = createHash("sha256").update(plaintext).digest("hex");
  const db = getDb();
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash) as Record<string, string | null> | undefined;
  if (!row) return null;

  const apiKey = rowToApiKey(row);

  // Check revocation
  if (apiKey.revokedAt) return null;

  // Check expiration
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;

  return apiKey;
}

/** Revoke a key by ID */
export function revokeApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  return result.changes > 0;
}

/** Delete a key by ID */
export function deleteApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Update allowed endpoints for a key */
export function updateApiKeyEndpoints(id: string, allowedEndpoints: string[]): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE api_keys SET allowed_endpoints = ? WHERE id = ?").run(JSON.stringify(allowedEndpoints), id);
  return result.changes > 0;
}

function rowToApiKey(row: Record<string, string | null>): ApiKey {
  return {
    id: row.id!,
    partyName: row.party_name!,
    keyHash: row.key_hash!,
    keyPrefix: row.key_prefix!,
    allowedEndpoints: JSON.parse(row.allowed_endpoints || "[]"),
    expiresAt: row.expires_at || null,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at!,
  };
}
