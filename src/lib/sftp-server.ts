import { Server } from "ssh2";
import type { Connection, AuthContext, Session as SshSession } from "ssh2";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, readdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { readJsonConfig } from "./config";
import { validateApiKey } from "./api-keys";
import { getDestinationById, isPathAccessible } from "./destinations";
import { logFileUpload } from "./file-log";
import { logConnection } from "./connection-log";
import { auditLog } from "./audit";
import { applyFilenameMask } from "./file-naming";
import type { DropEndpoint, ApiKey, FileNaming, AppSettings, DEFAULT_SETTINGS } from "./types";

const ENDPOINTS_FILE = "endpoints.json";
const SETTINGS_FILE = "settings.json";
const HOST_KEY_PATH = path.join(process.cwd(), "config", "sftp_host_key");

let _server: Server | null = null;

/** Ensure we have an SSH host key (generate if missing) */
function ensureHostKey(): Buffer {
  if (existsSync(HOST_KEY_PATH)) {
    return readFileSync(HOST_KEY_PATH);
  }
  // Generate a new host key using ssh-keygen-style RSA key
  // For simplicity, we use a pre-generated format via crypto
  const { generateKeyPairSync } = require("crypto");
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  mkdirSync(path.dirname(HOST_KEY_PATH), { recursive: true });
  writeFileSync(HOST_KEY_PATH, privateKey, { mode: 0o600 });
  console.log("[sftp-server] Generated new host key at", HOST_KEY_PATH);
  return Buffer.from(privateKey);
}

/**
 * Resolve the destination path for an SFTP-server endpoint.
 * Returns null if the endpoint is not accessible.
 */
async function resolveEndpointPath(endpoint: DropEndpoint): Promise<{ destPath: string; destName: string } | null> {
  const dest = await getDestinationById(endpoint.destinationId);
  if (!dest) return null;
  let destPath = dest.localPath;
  if (endpoint.subdirectory) destPath = path.join(destPath, endpoint.subdirectory);
  if (!isPathAccessible(dest.localPath)) return null;
  try { mkdirSync(destPath, { recursive: true }); } catch { /* exists */ }
  return { destPath, destName: dest.name };
}

/** Start the embedded SFTP server */
export async function startSftpServer(): Promise<void> {
  if (_server) return; // already running

  const settings = await readJsonConfig<AppSettings>(SETTINGS_FILE, {
    sftpServerEnabled: false, sftpServerPort: 2222,
  } as AppSettings);

  if (!settings.sftpServerEnabled) {
    console.log("[sftp-server] Disabled in settings");
    return;
  }

  const hostKey = ensureHostKey();
  const port = settings.sftpServerPort || 2222;

  _server = new Server({ hostKeys: [hostKey] }, (client: Connection, info: { ip: string; header: { versions: { software: string } } }) => {
    const clientIp = info.ip || "unknown";
    let authenticatedKey: ApiKey | null = null;

    client.on("authentication", (ctx: AuthContext) => {
      // Authenticate using: username = anything, password = API key (fd_...)
      if (ctx.method === "password") {
        const apiKey = validateApiKey(ctx.password);
        if (apiKey) {
          authenticatedKey = apiKey;
          logConnection({
            timestamp: new Date().toISOString(),
            sourceIp: clientIp,
            hostname: "",
            method: "SFTP",
            path: "auth",
            statusCode: 200,
            apiKeyId: apiKey.id,
            partyName: apiKey.partyName,
            userAgent: `SFTP ${info.header?.versions?.software || "unknown"}`,
            responseTimeMs: 0,
          });
          ctx.accept();
        } else {
          logConnection({
            timestamp: new Date().toISOString(),
            sourceIp: clientIp,
            hostname: "",
            method: "SFTP",
            path: "auth",
            statusCode: 401,
            apiKeyId: "",
            partyName: ctx.username || "",
            userAgent: `SFTP ${info.header?.versions?.software || "unknown"}`,
            responseTimeMs: 0,
          });
          ctx.reject(["password"]);
        }
      } else {
        // Only password auth supported
        ctx.reject(["password"]);
      }
    });

    client.on("ready", () => {
      console.log(`[sftp-server] Client authenticated: ${authenticatedKey?.partyName} from ${clientIp}`);

      client.on("session", (accept: () => SshSession) => {
        const session = accept();

        session.on("sftp", async (accept: () => any) => {
          const sftp = accept();
          const apiKey = authenticatedKey!;

          // Get all sftp-server endpoints this key has access to
          const allEndpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
          const endpoints = allEndpoints.filter(
            (ep) => ep.type === "sftp-server" && ep.enabled &&
            (apiKey.allowedEndpoints.includes(ep.slug) || apiKey.allowedEndpoints.includes("*"))
          );

          // Build a virtual filesystem: root "/" lists endpoint slugs as directories
          // Each slug dir maps to the endpoint's destination path

          // Track open file handles
          const openHandles = new Map<number, { filePath: string; endpoint: DropEndpoint; destPath: string; destName: string; buffer: Buffer[] }>();
          let handleCounter = 1;

          sftp.on("OPENDIR", async (reqid: number, dirPath: string) => {
            const clean = dirPath.replace(/^\/+/, "").replace(/\/+$/, "");

            if (clean === "" || clean === ".") {
              // Root dir: list endpoint slugs
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(handleCounter++);
              sftp.handle(reqid, handle);
            } else {
              // Endpoint directory
              const ep = endpoints.find((e) => e.slug === clean);
              if (!ep) { sftp.status(reqid, 2 /* NO_SUCH_FILE */); return; }
              const resolved = await resolveEndpointPath(ep);
              if (!resolved) { sftp.status(reqid, 4 /* FAILURE */); return; }
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(handleCounter++);
              sftp.handle(reqid, handle);
            }
          });

          sftp.on("READDIR", async (reqid: number, handle: Buffer) => {
            // Simplified: return endpoint slugs as directories at root
            // For a real implementation we'd track handle state
            const names = endpoints.map((ep) => ({
              filename: ep.slug,
              longname: `drwxr-xr-x 1 filedrop filedrop 0 Jan  1 00:00 ${ep.slug}`,
              attrs: { mode: 0o40755, size: 0, uid: 1000, gid: 1000, atime: 0, mtime: 0 },
            }));
            if (names.length > 0) {
              sftp.name(reqid, names);
              // After first read, signal end
              endpoints.length = 0; // hacky but works for single readdir
            } else {
              sftp.status(reqid, 1 /* EOF */);
            }
          });

          sftp.on("CLOSE", (reqid: number, handle: Buffer) => {
            const id = handle.readUInt32BE(0);
            const entry = openHandles.get(id);
            if (entry && entry.buffer.length > 0) {
              // File upload complete — write to disk
              const fullBuffer = Buffer.concat(entry.buffer);
              const naming: FileNaming = entry.endpoint.fileNaming || { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" };
              const savedName = applyFilenameMask(naming, path.basename(entry.filePath));
              const savePath = path.join(entry.destPath, savedName);

              writeFile(savePath, fullBuffer).then(() => {
                logFileUpload({
                  timestamp: new Date().toISOString(),
                  filename: savedName,
                  originalFilename: path.basename(entry.filePath),
                  fileSize: fullBuffer.length,
                  mimeType: "",
                  sourceIp: clientIp,
                  sourceHostname: "",
                  apiKeyId: apiKey.id,
                  apiKeyPartyName: apiKey.partyName,
                  endpointSlug: entry.endpoint.slug,
                  destinationPath: entry.destPath,
                  destinationName: entry.destName,
                  status: "success",
                });
                auditLog({
                  actor: apiKey.partyName,
                  action: "sftp-server.upload",
                  targetType: "endpoint",
                  targetId: entry.endpoint.slug,
                  details: { filename: savedName, size: fullBuffer.length },
                  sourceIp: clientIp,
                });
              }).catch((err) => {
                console.error("[sftp-server] Write error:", err);
              });
            }
            openHandles.delete(id);
            sftp.status(reqid, 0 /* OK */);
          });

          sftp.on("OPEN", async (reqid: number, filename: string, flags: number) => {
            // Parse path: /<slug>/<filename>
            const parts = filename.replace(/^\/+/, "").split("/");
            if (parts.length < 2) { sftp.status(reqid, 2 /* NO_SUCH_FILE */); return; }

            const slug = parts[0];
            const ep = endpoints.find((e) => e.slug === slug);
            if (!ep) { sftp.status(reqid, 2); return; }

            const resolved = await resolveEndpointPath(ep);
            if (!resolved) { sftp.status(reqid, 4); return; }

            const id = handleCounter++;
            const handle = Buffer.alloc(4);
            handle.writeUInt32BE(id);

            // Check if this is a write (upload) or read (download)
            const isWrite = (flags & 0x00000002) !== 0 || (flags & 0x00000008) !== 0; // WRITE or CREAT

            if (isWrite) {
              openHandles.set(id, {
                filePath: parts.slice(1).join("/"),
                endpoint: ep,
                destPath: resolved.destPath,
                destName: resolved.destName,
                buffer: [],
              });
              sftp.handle(reqid, handle);
            } else if (ep.allowRetrieval) {
              // Read mode - allow download
              const localFile = path.join(resolved.destPath, path.basename(parts.slice(1).join("/")));
              if (existsSync(localFile) && statSync(localFile).isFile()) {
                openHandles.set(id, {
                  filePath: localFile,
                  endpoint: ep,
                  destPath: resolved.destPath,
                  destName: resolved.destName,
                  buffer: [], // unused for read
                });
                sftp.handle(reqid, handle);
              } else {
                sftp.status(reqid, 2);
              }
            } else {
              sftp.status(reqid, 3 /* PERMISSION_DENIED */);
            }
          });

          sftp.on("WRITE", (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
            const id = handle.readUInt32BE(0);
            const entry = openHandles.get(id);
            if (entry) {
              entry.buffer.push(Buffer.from(data));
              sftp.status(reqid, 0);
            } else {
              sftp.status(reqid, 4);
            }
          });

          sftp.on("READ", (reqid: number, handle: Buffer, offset: number, length: number) => {
            const id = handle.readUInt32BE(0);
            const entry = openHandles.get(id);
            if (entry && existsSync(entry.filePath)) {
              try {
                const fd = require("fs").openSync(entry.filePath, "r");
                const buf = Buffer.alloc(length);
                const bytesRead = require("fs").readSync(fd, buf, 0, length, offset);
                require("fs").closeSync(fd);
                if (bytesRead === 0) {
                  sftp.status(reqid, 1 /* EOF */);
                } else {
                  sftp.data(reqid, buf.subarray(0, bytesRead));
                }
              } catch {
                sftp.status(reqid, 4);
              }
            } else {
              sftp.status(reqid, 4);
            }
          });

          sftp.on("STAT", async (reqid: number, filePath: string) => {
            const clean = filePath.replace(/^\/+/, "").replace(/\/+$/, "");
            if (clean === "" || clean === ".") {
              sftp.attrs(reqid, { mode: 0o40755, size: 0, uid: 1000, gid: 1000, atime: 0, mtime: 0 } as any);
              return;
            }
            const parts = clean.split("/");
            const ep = endpoints.find((e) => e.slug === parts[0]);
            if (!ep) { sftp.status(reqid, 2); return; }
            if (parts.length === 1) {
              sftp.attrs(reqid, { mode: 0o40755, size: 0, uid: 1000, gid: 1000, atime: 0, mtime: 0 } as any);
            } else {
              const resolved = await resolveEndpointPath(ep);
              if (!resolved) { sftp.status(reqid, 4); return; }
              const localFile = path.join(resolved.destPath, path.basename(parts.slice(1).join("/")));
              if (existsSync(localFile)) {
                const st = statSync(localFile);
                sftp.attrs(reqid, { mode: st.isDirectory() ? 0o40755 : 0o100644, size: st.size, uid: 1000, gid: 1000, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) } as any);
              } else {
                sftp.status(reqid, 2);
              }
            }
          });

          sftp.on("LSTAT", (reqid: number, filePath: string) => {
            sftp.emit("STAT", reqid, filePath);
          });

          sftp.on("REALPATH", (reqid: number, filePath: string) => {
            sftp.name(reqid, [{ filename: filePath === "." ? "/" : filePath, longname: "", attrs: {} }]);
          });
        });
      });
    });

    client.on("error", (err: Error) => {
      console.error("[sftp-server] Client error:", err.message);
    });
  });

  _server.listen(port, "0.0.0.0", () => {
    console.log(`[sftp-server] Listening on port ${port}`);
    console.log(`[sftp-server] External parties connect with: sftp -P ${port} <party>@<host>`);
    console.log(`[sftp-server] Password = their API key (fd_...)`);
  });
}

/** Stop the embedded SFTP server */
export function stopSftpServer(): void {
  if (_server) {
    _server.close();
    _server = null;
    console.log("[sftp-server] Stopped");
  }
}

/** Check if the SFTP server is currently running */
export function isSftpServerRunning(): boolean {
  return _server !== null;
}
