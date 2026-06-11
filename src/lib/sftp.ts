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

/**
 * Best-effort directory detection for one SFTP listing entry.
 *
 * Prefers POSIX mode bits, but many SFTP servers (non-OpenSSH, Windows and
 * appliance servers) omit the file-type bits — or the whole `permissions`
 * attribute — in directory listings, leaving `mode` as 0. In that case we fall
 * back to the `ls -l`-style `longname` prefix (`d...` = directory).
 */
function isRemoteDirectory(entry: FileEntry): boolean {
  const mode = typeof entry.attrs?.mode === "number" ? entry.attrs.mode : 0;
  const typeBits = mode & S_IFMT;
  if (typeBits !== 0) return typeBits === S_IFDIR;
  return /^d/.test(entry.longname || "");
}

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
      const name = entry.filename;
      if (name === "." || name === "..") continue;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;

      if (isRemoteDirectory(entry)) {
        // Only descend into real directories; never recurse on "." / "..".
        if (recursive) await walk(path.posix.join(currentDir, name), rel);
        continue;
      }

      // Treat every non-directory entry as a downloadable file. We must NOT
      // require the S_IFREG bit here: servers that omit POSIX type bits would
      // otherwise have every file silently dropped from the listing.
      const size = typeof entry.attrs?.size === "number" ? entry.attrs.size : 0;
      const mtime = typeof entry.attrs?.mtime === "number" ? entry.attrs.mtime : 0;
      out.push({
        name,
        relPath: rel,
        size,
        modifiedAt: mtime ? new Date(mtime * 1000).toISOString() : "",
        isDirectory: false,
      });
    }
  }

  await walk(root, "");
  return out;
}

export interface RemoteSource {
  /** Directory each file's relPath is relative to (used to build the fetch path). */
  baseDir: string;
  files: SftpFile[];
}

/**
 * Resolve a remote source path that may be either a directory (which is listed)
 * or a single file (fetched directly). This lets a transfer's `remotePath`
 * point straight at one file instead of a folder.
 */
export async function resolveRemoteSource(
  sftp: SFTPWrapper,
  remotePath: string,
  recursive = false,
): Promise<RemoteSource> {
  const target = remotePath || ".";

  // Prefer treating it as a directory: a successful readdir proves it is one.
  try {
    const files = await listRemoteFiles(sftp, target, recursive);
    return { baseDir: target, files };
  } catch {
    // Not listable as a directory — fall through and probe it as a file.
  }

  const st = await statP(sftp, target);
  if (st) {
    const mode = typeof st.mode === "number" ? st.mode : 0;
    // If we can positively tell it's a directory we simply could not list it.
    if ((mode & S_IFMT) === S_IFDIR) return { baseDir: target, files: [] };
    const mtime = typeof st.mtime === "number" ? st.mtime : 0;
    return {
      baseDir: path.posix.dirname(target),
      files: [
        {
          name: path.posix.basename(target),
          relPath: path.posix.basename(target),
          size: typeof st.size === "number" ? st.size : 0,
          modifiedAt: mtime ? new Date(mtime * 1000).toISOString() : "",
          isDirectory: false,
        },
      ],
    };
  }

  // Surface the original listing error (path missing or inaccessible).
  return { baseDir: target, files: await listRemoteFiles(sftp, target, recursive) };
}

/** Convenience: open, list (non-recursive), close. Used by connection tests. */
export async function sftpListOnce(conn: SftpConnectionParams, remotePath?: string): Promise<SftpFile[]> {
  const { sftp, close } = await sftpConnect(conn);
  try {
    return (await resolveRemoteSource(sftp, remotePath || ".", false)).files;
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
