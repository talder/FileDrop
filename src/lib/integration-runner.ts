import { existsSync, statSync } from "fs";
import { mkdir, readdir, readFile, writeFile, unlink } from "fs/promises";
import os from "os";
import path from "path";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "crypto";
import type { Integration, TransferRunStatus, TransferTrigger } from "./types";
import { getSoapConnectionById } from "./soap-connections";
import { getFtpConnectionById } from "./ftp-connections";
import { ftpUploadFile } from "./ftp";
import { getDestinationById, isPathAccessible, decryptPassword } from "./destinations";
import { selectFiles, applyConflictPolicy } from "./transfer-util";
import { applyFilenameMask } from "./file-naming";
import { logFileUpload } from "./file-log";
import { startIntegrationRun, finishIntegrationRun } from "./integration-runs";
import { setIntegrationLastRun } from "./integrations";
import { auditLog } from "./audit";
import { sendFileNotification } from "./email";
import type { SelectableFile } from "./transfer-util";

export interface IntegrationRunSummary {
  status: TransferRunStatus;
  filesTotal: number;
  filesOk: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
}

function computeStatus(ok: number, failed: number): TransferRunStatus {
  if (failed > 0 && ok > 0) return "partial";
  if (failed > 0) return "failed";
  return "success";
}

interface LocalFile extends SelectableFile {
  size: number;
}

async function listLocalFiles(dir: string, recursive: boolean): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  async function walk(current: string, relPrefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(abs, rel);
      } else if (entry.isFile()) {
        let size = 0;
        try { size = statSync(abs).size; } catch { /* ignore */ }
        out.push({ name: entry.name, relPath: rel, size });
      }
    }
  }
  await walk(dir, "");
  return out;
}

/**
 * Extract the inner content of the SOAP Body element. Namespace-prefix
 * agnostic; falls back to the full document if no Body element is found.
 * Pure string/regex approach — no XML dependency.
 */
export function extractSoapBody(xml: string): string {
  const match = xml.match(/<(?:[\w.-]+:)?Body\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Body>/i);
  return match ? match[1].trim() : xml.trim();
}

interface SoapResult {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * POST a SOAP request using Node's built-in http/https. When ignoreTlsErrors
 * is set, an https.Agent with rejectUnauthorized: false accepts self-signed
 * internal certificates. The supplied AbortSignal enforces the timeout.
 */
function soapPost(opts: {
  url: string;
  body: string;
  authBasic: string;
  soapAction?: string;
  ignoreTlsErrors: boolean;
  signal: AbortSignal;
}): Promise<SoapResult> {
  return new Promise((resolve, reject) => {
    let endpoint: URL;
    try {
      endpoint = new URL(opts.url);
    } catch {
      reject(new Error(`invalid endpoint URL: ${opts.url}`));
      return;
    }

    const isHttps = endpoint.protocol === "https:";
    const transport = isHttps ? https : http;
    const payload = Buffer.from(opts.body, "utf8");
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      Authorization: `Basic ${opts.authBasic}`,
      "Content-Length": String(payload.byteLength),
    };
    if (opts.soapAction) headers.SOAPAction = `"${opts.soapAction}"`;

    const requestOptions: https.RequestOptions = {
      method: "POST",
      hostname: endpoint.hostname,
      port: endpoint.port || (isHttps ? 443 : 80),
      path: `${endpoint.pathname}${endpoint.search}`,
      headers,
      signal: opts.signal,
    };
    if (isHttps && opts.ignoreTlsErrors) {
      requestOptions.agent = new https.Agent({ rejectUnauthorized: false });
    }

    const req = transport.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status, text });
      });
    });
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Execute an integration once. Used by both manual runs and the scheduler.
 * Never throws for per-file errors; only structural failures (missing
 * connection/destination) end the run early.
 */
export async function runIntegration(
  integration: Integration,
  trigger: TransferTrigger,
): Promise<IntegrationRunSummary> {
  const summary: IntegrationRunSummary = {
    status: "success",
    filesTotal: 0,
    filesOk: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: [],
  };

  const runId = startIntegrationRun({
    integrationId: integration.id,
    integrationName: integration.name,
    trigger,
  });

  const fail = async (message: string): Promise<IntegrationRunSummary> => {
    summary.status = "failed";
    summary.errors.push(message);
    finishIntegrationRun(runId, {
      status: "failed",
      filesTotal: summary.filesTotal,
      filesOk: summary.filesOk,
      filesFailed: summary.filesFailed,
      errorMessage: message,
    });
    await setIntegrationLastRun(integration.id, {
      at: new Date().toISOString(),
      status: "failed",
      error: message,
    });
    auditLog({
      actor: trigger === "manual" ? "user" : "scheduler",
      action: "integration.run.failed",
      targetType: "integration",
      targetId: integration.id,
      details: { name: integration.name, error: message },
    });
    return summary;
  };

  const soap = await getSoapConnectionById(integration.soapConnectionId);
  if (!soap) return fail("SOAP connection not found");

  const sourceDest = await getDestinationById(integration.sourceDestinationId);
  if (!sourceDest) return fail("Source destination not found");
  if (!isPathAccessible(sourceDest.localPath)) return fail("Source destination path is not accessible");

  let sourceDir = sourceDest.localPath;
  if (integration.sourceSubdirectory) sourceDir = path.join(sourceDir, integration.sourceSubdirectory);

  // Optional response save destination.
  let responseDir: string | null = null;
  if (integration.responseDestinationId) {
    const responseDest = await getDestinationById(integration.responseDestinationId);
    if (!responseDest) return fail("Response destination not found");
    if (!isPathAccessible(responseDest.localPath)) return fail("Response destination path is not accessible");
    responseDir = responseDest.localPath;
    if (integration.responseSubdirectory) responseDir = path.join(responseDir, integration.responseSubdirectory);
    try { await mkdir(responseDir, { recursive: true }); } catch { /* exists */ }
  }

  // Optional FTP delivery target.
  const ftpConn = integration.ftpConnectionId
    ? await getFtpConnectionById(integration.ftpConnectionId)
    : null;
  if (integration.ftpConnectionId && !ftpConn) return fail("FTP connection not found");

  const recursive = !!integration.sourceSelection?.recursive;
  const naming = integration.responseFileNaming || { mode: "original" as const, mask: "" };

  // Build the SOAP request context once.
  const soapPassword = soap.passwordEncrypted ? decryptPassword(soap.passwordEncrypted) || "" : "";
  const basicAuth = Buffer.from(`${soap.username}:${soapPassword}`).toString("base64");

  const logBase = {
    sourceIp: soap.url,
    sourceHostname: soap.url,
    apiKeyId: "",
    apiKeyPartyName: `Integration:${integration.name}`,
    endpointSlug: integration.name,
    destinationPath: responseDir || sourceDir,
    destinationName: sourceDest.name,
    mimeType: "text/xml",
  };

  const localFiles = await listLocalFiles(sourceDir, recursive);
  const selected = selectFiles(localFiles, integration.sourceSelection || { mode: "all" });
  summary.filesTotal = selected.length;

  // Track names written this run so conflict resolution sees them.
  const writtenResponses = new Set<string>();

  for (const file of selected) {
    const sourcePath = path.join(sourceDir, file.relPath);
    const ts = new Date().toISOString();

    let payload: string;
    try {
      payload = await readFile(sourcePath, "utf8");
    } catch (err) {
      const msg = `read failed: ${(err as Error).message}`;
      summary.filesFailed += 1;
      summary.errors.push(`${file.relPath}: ${msg}`);
      logFileUpload({ timestamp: ts, filename: file.name, originalFilename: file.name, fileSize: file.size, status: "failed", errorMessage: msg, ...logBase });
      continue;
    }

    // Build the SOAP request body.
    const body = soap.envelopeMode === "template"
      ? (soap.envelopeTemplate || "{PAYLOAD}").replace(/\{PAYLOAD\}/g, payload)
      : payload;

    // POST to the SOAP endpoint.
    let responseText: string;
    try {
      const res = await soapPost({
        url: soap.url,
        body,
        authBasic: basicAuth,
        soapAction: soap.soapAction || undefined,
        ignoreTlsErrors: !!soap.ignoreTlsErrors,
        signal: AbortSignal.timeout(60000),
      });
      responseText = res.text;
      if (!res.ok) {
        throw new Error(`SOAP HTTP ${res.status}${responseText ? `: ${responseText.slice(0, 200)}` : ""}`);
      }
    } catch (err) {
      const msg = `SOAP call failed: ${(err as Error).message}`;
      summary.filesFailed += 1;
      summary.errors.push(`${file.relPath}: ${msg}`);
      logFileUpload({ timestamp: ts, filename: file.name, originalFilename: file.name, fileSize: file.size, status: "failed", errorMessage: msg, ...logBase });
      continue;
    }

    // SOAP succeeded for this file.
    const responseBody = soap.extractBody ? extractSoapBody(responseText) : responseText;
    const fileErrors: string[] = [];

    // Save the response locally (optional).
    let savedLocalPath: string | null = null;
    let savedName: string | null = null;
    if (responseDir) {
      const desired = applyFilenameMask(naming, file.name);
      const resolution = applyConflictPolicy(
        desired,
        "rename",
        (n) => writtenResponses.has(path.join(responseDir!, n)) || existsSync(path.join(responseDir!, n)),
      );
      savedName = resolution.name || desired;
      savedLocalPath = path.join(responseDir, savedName);
      try {
        await writeFile(savedLocalPath, responseBody, "utf8");
        writtenResponses.add(savedLocalPath);
      } catch (err) {
        fileErrors.push(`save response failed: ${(err as Error).message}`);
        savedLocalPath = null;
      }
    }

    // Deliver the response to FTP (optional). A failure here is recorded but
    // does NOT fail the file, since the SOAP call already succeeded.
    if (ftpConn) {
      let uploadPath = savedLocalPath;
      let tempPath: string | null = null;
      try {
        if (!uploadPath) {
          tempPath = path.join(os.tmpdir(), `filedrop-soap-${randomUUID()}.xml`);
          await writeFile(tempPath, responseBody, "utf8");
          uploadPath = tempPath;
        }
        const remoteName = savedName || applyFilenameMask(naming, file.name);
        const remoteTarget = path.posix.join(integration.ftpRemotePath || ".", remoteName);
        await ftpUploadFile(ftpConn, uploadPath, remoteTarget);
      } catch (err) {
        fileErrors.push(`FTP upload failed: ${(err as Error).message}`);
      } finally {
        if (tempPath) { try { await unlink(tempPath); } catch { /* best effort */ } }
      }
    }

    // Delete the source file after a successful SOAP call (when configured).
    if (integration.deleteSourceAfterRun) {
      try { await unlink(sourcePath); } catch (err) { fileErrors.push(`delete source failed: ${(err as Error).message}`); }
    }

    summary.filesOk += 1;
    if (fileErrors.length > 0) summary.errors.push(`${file.relPath}: ${fileErrors.join("; ")}`);
    logFileUpload({
      timestamp: ts,
      filename: savedName || file.name,
      originalFilename: file.name,
      fileSize: Buffer.byteLength(responseBody),
      status: "success",
      errorMessage: fileErrors.length > 0 ? fileErrors.join("; ") : undefined,
      ...logBase,
    });
  }

  summary.status = computeStatus(summary.filesOk, summary.filesFailed);
  const finishedAt = new Date().toISOString();
  finishIntegrationRun(runId, {
    status: summary.status,
    filesTotal: summary.filesTotal,
    filesOk: summary.filesOk,
    filesFailed: summary.filesFailed,
    errorMessage: summary.errors.length > 0 ? summary.errors.slice(0, 5).join("; ") : undefined,
  });
  await setIntegrationLastRun(integration.id, {
    at: finishedAt,
    status: summary.status,
    error: summary.errors[0],
  });

  auditLog({
    actor: trigger === "manual" ? "user" : "scheduler",
    action: "integration.run",
    targetType: "integration",
    targetId: integration.id,
    details: {
      name: integration.name,
      trigger,
      filesOk: summary.filesOk,
      filesFailed: summary.filesFailed,
      filesSkipped: summary.filesSkipped,
    },
  });

  // Notifications: single per-run summary.
  const notify = integration.notifications;
  if (notify && notify.on !== "none" && notify.email) {
    const wantFailure = summary.filesFailed > 0;
    const shouldSend = notify.on === "all" || (notify.on === "failures" && wantFailure);
    if (shouldSend) {
      sendFileNotification({
        to: notify.email,
        endpointSlug: integration.name,
        event: wantFailure ? "failed" : "upload",
        filename: `${summary.filesOk} processed, ${summary.filesFailed} failed, ${summary.filesSkipped} skipped`,
        originalFilename: `Integration ${integration.name}`,
        fileSize: 0,
        party: `SOAP:${soap.url}`,
        sourceIp: soap.url,
        errorMessage: summary.errors[0],
      });
    }
  }

  return summary;
}
