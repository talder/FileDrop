import path from "path";
import { mkdir, readdir, rename, rm, stat } from "fs/promises";

/** Root that all folder browsing/management is constrained to. */
export const DATA_ROOT = path.resolve("/DATA");

/** True when `target` is the /DATA root or lives somewhere beneath it. */
export function isWithinDataRoot(target: string): boolean {
  return target === DATA_ROOT || target.startsWith(`${DATA_ROOT}${path.sep}`);
}

/**
 * Error carrying an HTTP-style status, thrown by `listDirectory` for caller
 * mistakes (path outside /DATA, not a directory) so routes can map it cleanly
 * while real fs errors (ENOENT/EACCES) still propagate as `ErrnoException`.
 */
export class DataPathError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DataPathError";
    this.status = status;
  }
}

/**
 * Validate a single folder name (one path segment). Rejects empty names,
 * `.`/`..`, path separators, and control characters so a name can never be
 * used to escape the current directory.
 */
export function isValidFolderName(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 255) return false;
  if (name === "." || name === "..") return false;
  if (/[\\/]/.test(name)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return false;
  return true;
}

export interface FolderOpResult {
  ok: boolean;
  error?: string;
  /** HTTP-style status to surface to the caller (defaults to 200/400). */
  status?: number;
  /** Absolute path that was created/renamed/deleted on success. */
  path?: string;
}

async function isDirectory(target: string): Promise<boolean | null> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return null; // does not exist
  }
}

/** Create a new single-level folder `name` inside `parentPath`. */
export async function createFolder(parentPath: string, name: string): Promise<FolderOpResult> {
  const parent = path.resolve(parentPath || DATA_ROOT);
  if (!isWithinDataRoot(parent)) return { ok: false, error: "Path must be inside /DATA", status: 400 };
  if (!isValidFolderName(name)) return { ok: false, error: "Invalid folder name", status: 400 };

  const target = path.join(parent, name);
  if (!isWithinDataRoot(target)) return { ok: false, error: "Path must be inside /DATA", status: 400 };

  const parentIsDir = await isDirectory(parent);
  if (parentIsDir === null) return { ok: false, error: "Parent folder not found", status: 404 };
  if (parentIsDir === false) return { ok: false, error: "Parent path is not a directory", status: 400 };

  if (await pathExists(target)) {
    return { ok: false, error: "A file or folder with that name already exists", status: 409 };
  }

  await mkdir(target);
  return { ok: true, path: target };
}

/** Rename the folder at `targetPath` to `newName` (kept in the same parent). */
export async function renameFolder(targetPath: string, newName: string): Promise<FolderOpResult> {
  const target = path.resolve(targetPath || "");
  if (!isWithinDataRoot(target)) return { ok: false, error: "Path must be inside /DATA", status: 400 };
  if (target === DATA_ROOT) return { ok: false, error: "Cannot rename the /DATA root", status: 400 };
  if (!isValidFolderName(newName)) return { ok: false, error: "Invalid folder name", status: 400 };

  const dest = path.join(path.dirname(target), newName);
  if (!isWithinDataRoot(dest)) return { ok: false, error: "Path must be inside /DATA", status: 400 };

  const targetIsDir = await isDirectory(target);
  if (targetIsDir === null) return { ok: false, error: "Folder not found", status: 404 };
  if (targetIsDir === false) return { ok: false, error: "Path is not a directory", status: 400 };

  if (dest !== target && await pathExists(dest)) {
    return { ok: false, error: "A file or folder with that name already exists", status: 409 };
  }

  await rename(target, dest);
  return { ok: true, path: dest };
}

/**
 * Delete the folder at `targetPath`. Without `recursive`, refuses to delete a
 * folder that still has contents (409). With `recursive`, removes everything.
 */
export async function deleteFolder(targetPath: string, opts: { recursive: boolean }): Promise<FolderOpResult> {
  const target = path.resolve(targetPath || "");
  if (!isWithinDataRoot(target)) return { ok: false, error: "Path must be inside /DATA", status: 400 };
  if (target === DATA_ROOT) return { ok: false, error: "Cannot delete the /DATA root", status: 400 };

  const targetIsDir = await isDirectory(target);
  if (targetIsDir === null) return { ok: false, error: "Folder not found", status: 404 };
  if (targetIsDir === false) return { ok: false, error: "Path is not a directory", status: 400 };

  if (!opts.recursive) {
    const entries = await readdir(target);
    if (entries.length > 0) return { ok: false, error: "Folder is not empty", status: 409 };
  }

  await rm(target, { recursive: opts.recursive, force: false });
  return { ok: true, path: target };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// ── Browsing / upload / download helpers ──────────────────────────────────────

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryFileEntry extends DirectoryEntry {
  size: number;
  modifiedAt: string;
}

export interface DirectoryListing {
  root: string;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
  files: DirectoryFileEntry[];
}

const byNameInsensitive = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * List the contents of a directory inside /DATA. Directories are returned with
 * just name/path; files additionally carry size + mtime so the browser can show
 * metadata. Throws `DataPathError` for paths outside /DATA or non-directories;
 * fs errors (ENOENT/EACCES) propagate for the caller to map.
 */
export async function listDirectory(requestedPath: string): Promise<DirectoryListing> {
  const resolvedPath = path.resolve(requestedPath || DATA_ROOT);
  if (!isWithinDataRoot(resolvedPath)) {
    throw new DataPathError("Path must be inside /DATA", 400);
  }

  const info = await stat(resolvedPath);
  if (!info.isDirectory()) {
    throw new DataPathError("Path is not a directory", 400);
  }

  const entries = await readdir(resolvedPath, { withFileTypes: true });
  const directories: DirectoryEntry[] = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(resolvedPath, entry.name) }))
    .sort(byNameInsensitive);

  const files: DirectoryFileEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(resolvedPath, entry.name);
    try {
      const fileStat = await stat(full);
      files.push({ name: entry.name, path: full, size: fileStat.size, modifiedAt: fileStat.mtime.toISOString() });
    } catch {
      // Skip entries that vanish or are unreadable between readdir and stat.
    }
  }
  files.sort(byNameInsensitive);

  const parentPath = resolvedPath === DATA_ROOT ? null : path.dirname(resolvedPath);
  return { root: DATA_ROOT, currentPath: resolvedPath, parentPath, directories, files };
}

/**
 * Validate a (possibly nested) relative upload path such as a browser's
 * `webkitRelativePath`. Splits on either separator and validates every segment
 * with {@link isValidFolderName}, so `..`, absolute paths, control characters,
 * and separators in a segment are all rejected. Returns the clean segments, or
 * `null` when the path is unsafe.
 */
export function sanitizeRelativeUploadPath(relPath: string): string[] | null {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  if (relPath.startsWith("/") || relPath.startsWith("\\")) return null;
  const segments = relPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (!isValidFolderName(segment)) return null;
  }
  return segments;
}

export interface WalkedFile {
  absPath: string;
  relPath: string;
  size: number;
}

/**
 * Recursively yield every file beneath `dir`, with `relPath` computed relative
 * to `relativeTo` (use the parent of `dir` to include the folder name itself).
 * Entries are visited in a deterministic, name-sorted order.
 */
export async function* walkDirFiles(dir: string, relativeTo: string): AsyncGenerator<WalkedFile> {
  const entries = (await readdir(dir, { withFileTypes: true })).sort(byNameInsensitive);
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDirFiles(abs, relativeTo);
    } else if (entry.isFile()) {
      const fileStat = await stat(abs);
      yield { absPath: abs, relPath: path.relative(relativeTo, abs), size: fileStat.size };
    }
  }
}
