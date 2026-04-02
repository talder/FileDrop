import { Client } from "ssh2";
import type { SFTPWrapper } from "ssh2";
import type { SftpConfig } from "./types";
import { decryptPassword } from "./destinations";

export interface SftpFile {
  filename: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

function getAuth(config: SftpConfig): { password?: string; privateKey?: string } {
  const auth: { password?: string; privateKey?: string } = {};
  if (config.passwordEncrypted) {
    auth.password = decryptPassword(config.passwordEncrypted) || undefined;
  }
  if (config.privateKey) {
    auth.privateKey = config.privateKey;
  }
  return auth;
}

/** Connect and return SFTP wrapper + close function */
export function sftpConnect(config: SftpConfig): Promise<{ sftp: SFTPWrapper; close: () => void }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const auth = getAuth(config);

    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(err); return; }
        resolve({ sftp, close: () => conn.end() });
      });
    });

    conn.on("error", (err) => reject(err));

    conn.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: auth.password,
      privateKey: auth.privateKey,
      readyTimeout: 30000,
    });
  });
}

/** List files in a remote directory */
export async function sftpList(config: SftpConfig, remotePath?: string): Promise<SftpFile[]> {
  const { sftp, close } = await sftpConnect(config);
  try {
    const dir = remotePath || config.remotePath || ".";
    return await new Promise<SftpFile[]>((resolve, reject) => {
      sftp.readdir(dir, (err, list) => {
        if (err) { reject(err); return; }
        resolve(
          list
            .filter((f) => f.attrs.isFile())
            .map((f) => ({
              filename: f.filename,
              size: f.attrs.size,
              modifiedAt: new Date(f.attrs.mtime * 1000).toISOString(),
              isDirectory: f.attrs.isDirectory(),
            }))
        );
      });
    });
  } finally {
    close();
  }
}

/** Download a file from remote to local */
export async function sftpGet(config: SftpConfig, remoteFile: string, localFile: string): Promise<void> {
  const { sftp, close } = await sftpConnect(config);
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(remoteFile, localFile, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  } finally {
    close();
  }
}

/** Upload a file from local to remote */
export async function sftpPut(config: SftpConfig, localFile: string, remoteFile: string): Promise<void> {
  const { sftp, close } = await sftpConnect(config);
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(localFile, remoteFile, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  } finally {
    close();
  }
}

/** Delete a remote file */
export async function sftpDelete(config: SftpConfig, remoteFile: string): Promise<void> {
  const { sftp, close } = await sftpConnect(config);
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.unlink(remoteFile, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  } finally {
    close();
  }
}

/** Test SFTP connection */
export async function sftpTest(config: SftpConfig): Promise<{ success: boolean; error?: string; fileCount?: number }> {
  try {
    const files = await sftpList(config);
    return { success: true, fileCount: files.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
