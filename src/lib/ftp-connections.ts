import { readJsonConfig, writeJsonConfig } from "./config";
import type { FtpConnection } from "./types";

const CONNECTIONS_FILE = "ftp-connections.json";

export async function getFtpConnections(): Promise<FtpConnection[]> {
  return readJsonConfig<FtpConnection[]>(CONNECTIONS_FILE, []);
}

export async function writeFtpConnections(connections: FtpConnection[]): Promise<void> {
  await writeJsonConfig(CONNECTIONS_FILE, connections);
}

export async function getFtpConnectionById(id: string): Promise<FtpConnection | null> {
  const connections = await getFtpConnections();
  return connections.find((c) => c.id === id) || null;
}

/** Public view of an FTP connection: never expose secrets. */
export interface SanitizedFtpConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  secure: boolean;
  ignoreTlsErrors: boolean;
  createdAt: string;
  updatedAt?: string;
}

export function sanitizeFtpConnection(c: FtpConnection): SanitizedFtpConnection {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    hasPassword: !!c.passwordEncrypted,
    secure: c.secure,
    ignoreTlsErrors: c.ignoreTlsErrors,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
