import { execSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import os from "os";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { Destination } from "./types";

const DESTINATIONS_FILE = "destinations.json";

export async function getDestinations(): Promise<Destination[]> {
  return readJsonConfig<Destination[]>(DESTINATIONS_FILE, []);
}

export async function writeDestinations(destinations: Destination[]): Promise<void> {
  await writeJsonConfig(DESTINATIONS_FILE, destinations);
}

export async function getDestinationById(id: string): Promise<Destination | null> {
  const destinations = await getDestinations();
  return destinations.find((d) => d.id === id) || null;
}

/** Check if a path is currently a mount point */
export function isMounted(localPath: string): boolean {
  try {
    const platform = os.platform();
    if (platform === "darwin" || platform === "linux") {
      const result = execSync(`mount`, { encoding: "utf-8" });
      return result.includes(` on ${localPath} `);
    }
    return false;
  } catch {
    return false;
  }
}

/** Check if a destination path is accessible (exists and is a directory) */
export function isPathAccessible(localPath: string): boolean {
  try {
    const stat = statSync(localPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Get the mount status of a destination */
export function getMountStatus(dest: Destination): "mounted" | "unmounted" | "local" {
  if (dest.type === "local") return "local";
  return isMounted(dest.localPath) ? "mounted" : "unmounted";
}

/** Ensure mount point directory exists */
function ensureMountPoint(localPath: string): void {
  if (!existsSync(localPath)) {
    mkdirSync(localPath, { recursive: true });
  }
}

/** Mount an NFS share */
export function mountNfs(dest: Destination): { success: boolean; error?: string } {
  try {
    ensureMountPoint(dest.localPath);
    const platform = os.platform();
    const remote = `${dest.remoteHost}:${dest.remotePath}`;
    const opts = dest.mountOptions ? `-o ${dest.mountOptions}` : "";

    if (platform === "darwin") {
      execSync(`mount_nfs ${opts} ${remote} ${dest.localPath}`, { timeout: 30000 });
    } else {
      execSync(`mount -t nfs ${opts} ${remote} ${dest.localPath}`, { timeout: 30000 });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Mount an SMB share */
export function mountSmb(dest: Destination, password?: string): { success: boolean; error?: string } {
  try {
    ensureMountPoint(dest.localPath);
    const platform = os.platform();
    const share = `//${dest.remoteHost}/${dest.remotePath}`;

    if (platform === "darwin") {
      // macOS: mount_smbfs
      const userPart = dest.smbUsername
        ? (password ? `${dest.smbUsername}:${password}@` : `${dest.smbUsername}@`)
        : "";
      const domainPart = dest.smbDomain ? `${dest.smbDomain};` : "";
      const url = `//${domainPart}${userPart}${dest.remoteHost}/${dest.remotePath}`;
      execSync(`mount_smbfs "${url}" ${dest.localPath}`, { timeout: 30000 });
    } else {
      // Linux: mount.cifs
      const opts: string[] = [];
      if (dest.smbUsername) opts.push(`username=${dest.smbUsername}`);
      if (password) opts.push(`password=${password}`);
      if (dest.smbDomain) opts.push(`domain=${dest.smbDomain}`);
      const optStr = opts.length > 0 ? `-o ${opts.join(",")}` : "";
      execSync(`mount -t cifs ${optStr} ${share} ${dest.localPath}`, { timeout: 30000 });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Unmount a share */
export function unmountPath(localPath: string): { success: boolean; error?: string } {
  try {
    const platform = os.platform();
    if (platform === "darwin") {
      execSync(`umount ${localPath}`, { timeout: 15000 });
    } else {
      execSync(`umount ${localPath}`, { timeout: 15000 });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── SMB password encryption ──────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENC_KEY = process.env.FILEDROP_ENC_KEY
  ? Buffer.from(process.env.FILEDROP_ENC_KEY, "hex")
  : randomBytes(32); // In production, set FILEDROP_ENC_KEY as a persistent 64-char hex string

export function encryptPassword(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `ENC:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPassword(encoded: string): string | null {
  try {
    const parts = encoded.split(":");
    if (parts[0] !== "ENC" || parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encrypted = Buffer.from(parts[3], "hex");
    const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
