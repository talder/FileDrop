import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { getSftpConnections, writeSftpConnections } from "./sftp-connections";
import { getTransfers, writeTransfers } from "./transfers";
import { mapLegacyEndpoint } from "./transfer-util";
import type { LegacySftpEndpoint } from "./transfer-util";
import { auditLog } from "./audit";

const ENDPOINTS_FILE = "endpoints.json";

/**
 * Convert any legacy SFTP-client endpoints (type === "sftp") into reusable
 * SFTP connections plus Transfers, then remove them from the endpoints list.
 * Idempotent: once removed from endpoints.json, re-running is a no-op.
 */
export async function migrateSftpEndpoints(): Promise<void> {
  const endpoints = await readJsonConfig<Array<Record<string, unknown>>>(ENDPOINTS_FILE, []);
  const legacy = endpoints.filter((e) => e.type === "sftp") as unknown as LegacySftpEndpoint[];
  if (legacy.length === 0) return;

  const connections = await getSftpConnections();
  const transfers = await getTransfers();
  const now = new Date().toISOString();
  let migrated = 0;

  for (const ep of legacy) {
    const mapped = mapLegacyEndpoint(ep, {
      connectionId: randomUUID(),
      transferId: randomUUID(),
      now,
    });
    if (!mapped) continue;

    // Reuse an existing connection with the same host/port/username.
    let conn = connections.find(
      (c) =>
        c.host === mapped.connection.host &&
        c.port === mapped.connection.port &&
        c.username === mapped.connection.username,
    );
    if (!conn) {
      conn = mapped.connection;
      connections.push(conn);
    }

    const transfer = { ...mapped.transfer, connectionId: conn.id };
    const exists = transfers.some((t) => t.name === transfer.name && t.connectionId === conn!.id);
    if (!exists) {
      transfers.push(transfer);
      migrated += 1;
    }
  }

  if (migrated > 0) {
    await writeSftpConnections(connections);
    await writeTransfers(transfers);
  }

  // Remove all legacy SFTP endpoints; they are no longer a valid endpoint type.
  const remaining = endpoints.filter((e) => e.type !== "sftp");
  const removed = endpoints.length - remaining.length;
  if (removed > 0) {
    await writeJsonConfig(ENDPOINTS_FILE, remaining);
  }

  if (migrated > 0 || removed > 0) {
    console.log(`[migrate] Converted ${migrated} SFTP endpoint(s) to transfers; removed ${removed} legacy endpoint(s)`);
    auditLog({
      actor: "system",
      action: "migrate.sftp-endpoints",
      targetType: "transfer",
      targetId: "",
      details: { migrated, removed },
    });
  }
}
