import { readJsonConfig, writeJsonConfig } from "./config";
import type { SftpConnection } from "./types";

const CONNECTIONS_FILE = "sftp-connections.json";

export async function getSftpConnections(): Promise<SftpConnection[]> {
  return readJsonConfig<SftpConnection[]>(CONNECTIONS_FILE, []);
}

export async function writeSftpConnections(connections: SftpConnection[]): Promise<void> {
  await writeJsonConfig(CONNECTIONS_FILE, connections);
}

export async function getSftpConnectionById(id: string): Promise<SftpConnection | null> {
  const connections = await getSftpConnections();
  return connections.find((c) => c.id === id) || null;
}

/** Public view of a connection: never expose secrets. */
export interface SanitizedSftpConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  createdAt: string;
  updatedAt?: string;
}

export function sanitizeConnection(c: SftpConnection): SanitizedSftpConnection {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    hasPassword: !!c.passwordEncrypted,
    hasPrivateKey: !!c.privateKey,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
