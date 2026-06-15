import path from "path";
import { mkdir, readdir, rename, rm, stat } from "fs/promises";

/** Root that all folder browsing/management is constrained to. */
export const DATA_ROOT = path.resolve("/DATA");

/** True when `target` is the /DATA root or lives somewhere beneath it. */
export function isWithinDataRoot(target: string): boolean {
  return target === DATA_ROOT || target.startsWith(`${DATA_ROOT}${path.sep}`);
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
