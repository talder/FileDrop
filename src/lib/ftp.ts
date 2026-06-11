import path from "path";
import { Client } from "basic-ftp";
import { decryptPassword } from "./destinations";
import type { FtpConnection } from "./types";

/** Connection params subset used by the low-level FTP client. */
export type FtpConnectionParams = Pick<
  FtpConnection,
  "host" | "port" | "username" | "passwordEncrypted" | "secure" | "ignoreTlsErrors"
>;

/**
 * Open an FTP/FTPS session. The caller MUST call `client.close()` when finished.
 * Decrypts the stored password and, when `ignoreTlsErrors` is set, disables TLS
 * certificate verification via `secureOptions.rejectUnauthorized`.
 */
export async function ftpConnect(conn: FtpConnectionParams): Promise<Client> {
  const client = new Client(30000);
  const password = conn.passwordEncrypted
    ? decryptPassword(conn.passwordEncrypted) ?? undefined
    : undefined;

  await client.access({
    host: conn.host,
    port: conn.port || 21,
    user: conn.username,
    password,
    secure: conn.secure,
    secureOptions: conn.ignoreTlsErrors ? { rejectUnauthorized: false } : undefined,
  });

  return client;
}

/**
 * Upload a local file to a remote path on the FTP server, creating any missing
 * parent directories first. Opens and closes its own connection.
 */
export async function ftpUploadFile(
  conn: FtpConnectionParams,
  localPath: string,
  remotePath: string,
): Promise<void> {
  const client = await ftpConnect(conn);
  try {
    const normalized = remotePath.replace(/\\/g, "/");
    const dir = path.posix.dirname(normalized);
    if (dir && dir !== "." && dir !== "/") {
      // ensureDir creates the directory tree and changes the working directory
      // into it, so upload using just the basename afterwards.
      await client.ensureDir(dir);
      await client.uploadFrom(localPath, path.posix.basename(normalized));
    } else {
      await client.uploadFrom(localPath, normalized);
    }
  } finally {
    client.close();
  }
}

/** Test an FTP connection (optionally listing a specific remote path). */
export async function ftpTest(
  conn: FtpConnectionParams,
  remotePath?: string,
): Promise<{ success: boolean; error?: string; fileCount?: number }> {
  let client: Client | null = null;
  try {
    client = await ftpConnect(conn);
    const list = await client.list(remotePath || undefined);
    return { success: true, fileCount: list.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    if (client) client.close();
  }
}
