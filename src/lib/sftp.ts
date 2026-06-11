import { Client } from "ssh2";
import type { SFTPWrapper, Stats, FileEntry } from "ssh2";
import path from "path";
import type { SftpConnectionParams } from "./types";
import { decryptPassword } from "./destinations";

export interface SftpFile {
  /** base filename only */
  name: string;
  /** path relative to the listing root, POSIX style (e.g. "sub/file.xml") */
  relPath: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

// POSIX mode bitmasks (ssh2 readdir attrs expose a numeric `mode`).
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

function getAuth(conn: SftpConnectionParams): { password?: string; privateKey?: string } {
  const auth: { password?: string; privateKey?: string } = {};
  if (conn.passwordEncrypted) {
    auth.password = decryptPassword(conn.passwordEncrypted) || undefined;
  }
  if (conn.privateKey) {
    auth.privateKey = conn.privateKey;
  }
  return auth;
}

/** Open an SFTP session. Caller MUST call close() when finished. */
export function sftpConnect(conn: SftpConnectionParams): Promise<{ sftp: SFTPWrapper; close: () => void }> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const auth = getAuth(conn);

    client.on("ready", () => {
      client.sftp((err, sftp) => {
        if (err) { client.end(); reject(err); return; }
        resolve({ sftp, close: () => client.end() });
      });
    });

    client.on("error", (err) => reject(err));

    client.connect({
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      password: auth.password,
      privateKey: auth.privateKey,
      readyTimeout: 30000,
    });
  });
}

// ── Promise wrappers over an open SFTPWrapper ────────────────────────────────

export function readdirP(sftp: SFTPWrapper, dir: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(dir, (err, list) => (err ? reject(err) : resolve(list)));
  });
}

export function statP(sftp: SFTPWrapper, remotePath: string): Promise<Stats | null> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err, stats) => (err ? resolve(null) : resolve(stats)));
  });
}

export function fastGetP(sftp: SFTPWrapper, remoteFile: string, localFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remoteFile, localFile, (err) => (err ? reject(err) : resolve()));
  });
}

export function fastPutP(sftp: SFTPWrapper, localFile: string, remoteFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localFile, remoteFile, (err) => (err ? reject(err) : resolve()));
  });
}

export function unlinkP(sftp: SFTPWrapper, remoteFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(remoteFile, (err) => (err ? reject(err) : resolve()));
  });
}

function mkdirOne(sftp: SFTPWrapper, dir: string): Promise<void> {
  return new Promise((resolve) => {
    // Resolve regardless: a failure usually means the directory already exists.
    sftp.mkdir(dir, () => resolve());
  });
}

/** Recursively ensure a remote directory exists (mkdir -p). */
export async function ensureRemoteDir(sftp: SFTPWrapper, dir: string): Promise<void> {
  const normalized = dir.replace(/\\/g, "/");
  if (!normalized || normalized === "." || normalized === "/") return;
  const isAbsolute = normalized.startsWith("/");
  const segments = normalized.split("/").filter(Boolean);
  let current = isAbsolute ? "" : ".";
  for (const seg of segments) {
    current = current === "" ? `/${seg}` : `${current}/${seg}`;
    const existing = await statP(sftp, current);
    if (!existing) await mkdirOne(sftp, current);
  }
}

/** Check whether a remote path exists. */
export async function remoteExists(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  return (await statP(sftp, remotePath)) !== null;
}

/**
 * List files under a remote directory.
 * Returns files only (not directories). When recursive, descends into subdirs
 * and reports POSIX-style relative paths.
 */
export async function listRemoteFiles(sftp: SFTPWrapper, dir: string, recursive = false): Promise<SftpFile[]> {
  const root = dir || ".";
  const out: SftpFile[] = [];

  async function walk(currentDir: string, relPrefix: string): Promise<void> {
    const list = await readdirP(sftp, currentDir);
    for (const entry of list) {
      const rel = relPrefix ? `${relPrefix}/${entry.filename}` : entry.filename;
      const fileType = entry.attrs.mode & S_IFMT;
      if (fileType === S_IFDIR) {
        if (recursive) await walk(path.posix.join(currentDir, entry.filename), rel);
      } else if (fileType === S_IFREG) {
        out.push({
          name: entry.filename,
          relPath: rel,
          size: entry.attrs.size,
          modifiedAt: new Date(entry.attrs.mtime * 1000).toISOString(),
          isDirectory: false,
        });
      }
    }
  }

  await walk(root, "");
  return out;
}

/** Convenience: open, list (non-recursive), close. Used by connection tests. */
export async function sftpListOnce(conn: SftpConnectionParams, remotePath?: string): Promise<SftpFile[]> {
  const { sftp, close } = await sftpConnect(conn);
  try {
    return await listRemoteFiles(sftp, remotePath || ".", false);
  } finally {
    close();
  }
}

/** Test an SFTP connection (optionally against a specific path). */
export async function sftpTest(
  conn: SftpConnectionParams,
  remotePath?: string,
): Promise<{ success: boolean; error?: string; fileCount?: number }> {
  try {
    const files = await sftpListOnce(conn, remotePath);
    return { success: true, fileCount: files.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
