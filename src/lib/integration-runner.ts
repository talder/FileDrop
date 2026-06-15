import { existsSync, statSync } from "fs";
import { mkdir, readdir, readFile, rename, writeFile, unlink } from "fs/promises";
import os from "os";
import path from "path";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "crypto";
import type { FileNaming, Integration, TransferRunStatus, TransferTrigger } from "./types";
import { getSoapConnectionById } from "./soap-connections";
import { getFtpConnectionById } from "./ftp-connections";
import { ftpUploadFile } from "./ftp";
import { getDestinationById, isPathAccessible, decryptPassword } from "./destinations";
import { selectFiles, applyConflictPolicy } from "./transfer-util";
import { applyFilenameMask } from "./file-naming";
import { applyEnvelopeTemplate } from "./integration-envelope";
import { logFileUpload } from "./file-log";
import { startIntegrationRun, finishIntegrationRun } from "./integration-runs";
import { setIntegrationLastRun, normalizeArchivePolicy } from "./integrations";
import { auditLog } from "./audit";
import { normalizeRetryPolicy, runWithRetries } from "./retry-policy";
import { sendFileNotification } from "./email";
import { sendWebhookNotification } from "./webhook";
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

function emitIntegrationWebhook(integration: Integration, opts: {
  failed: boolean;
  payload: Record<string, unknown>;
}): void {
  void sendWebhookNotification({
    config: integration.webhook,
    event: opts.failed ? "integration.run.failed" : "integration.run.succeeded",
    failed: opts.failed,
    payload: opts.payload,
  });
}

function withAttemptMessage(base: string, enabled: boolean, maxAttempts: number): string {
  if (!enabled) return base;
  return `Failed after ${maxAttempts} attempts: ${base}`;
}

async function moveSourceToDeadLetter(
  sourceFile: string,
  sourceRoot: string,
  deadLetterSubdirectory: string,
): Promise<string | null> {
  const deadDir = path.join(sourceRoot, deadLetterSubdirectory || "_dead-letter");
  try {
    await mkdir(deadDir, { recursive: true });
  } catch {
    return null;
  }

  const ext = path.extname(sourceFile);
  const stem = path.basename(sourceFile, ext);
  let candidate = path.join(deadDir, path.basename(sourceFile));
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = path.join(deadDir, `${stem}.${suffix}${ext}`);
    suffix += 1;
  }

  try {
    await rename(sourceFile, candidate);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Move a successfully-processed source file into an archive subdirectory under
 * the source root, applying the configured filename mask (so it can be
 * timestamped). Collisions are resolved with the shared rename policy.
 */
async function moveSourceToArchive(
  sourceFile: string,
  sourceRoot: string,
  subdirectory: string,
  naming: FileNaming,
): Promise<string | null> {
  const archiveDir = path.join(sourceRoot, subdirectory || "success");
  try {
    await mkdir(archiveDir, { recursive: true });
  } catch {
    return null;
  }

  const desiredName = applyFilenameMask(naming, path.basename(sourceFile));
  const resolution = applyConflictPolicy(
    desiredName,
    "rename",
    (n) => existsSync(path.join(archiveDir, n)),
  );
  const target = path.join(archiveDir, resolution.name || desiredName);

  try {
    await rename(sourceFile, target);
    return target;
  } catch {
    return null;
  }
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
  body: string | Buffer;
  authBasic: string;
  soapAction?: string;
  contentDisposition?: string;
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
    const payload = typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      Authorization: `Basic ${opts.authBasic}`,
      "Content-Length": String(payload.byteLength),
    };
    if (opts.soapAction) headers.SOAPAction = `"${opts.soapAction}"`;
    if (opts.contentDisposition) {
      headers["Content-Disposition"] = `attachment; filename="${opts.contentDisposition.replace(/"/g, "")}"`;
    }

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
    emitIntegrationWebhook(integration, {
      failed: true,
      payload: {
        integrationId: integration.id,
        integrationName: integration.name,
        trigger,
        status: "failed",
        filesTotal: summary.filesTotal,
        filesOk: summary.filesOk,
        filesFailed: summary.filesFailed,
        filesSkipped: summary.filesSkipped,
        errorMessage: message,
      },
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
  const outboundNaming = integration.outboundFileNaming || { mode: "original" as const, mask: "" };
  const retryPolicy = normalizeRetryPolicy(integration.retryPolicy);
  const archivePolicy = normalizeArchivePolicy(integration.archivePolicy);
  // Byte-accurate posting only applies to raw envelope mode (template needs string substitution).
  const postBytes = !!integration.postSourceAsBytes && soap.envelopeMode === "raw";

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
    // Outbound name forwarded with the source file (timestamp/custom mask aware).
    const outboundName = applyFilenameMask(outboundNaming, file.name, new Date(ts));

    let payload: string | Buffer;
    try {
      payload = await runWithRetries(retryPolicy, async () =>
        postBytes ? readFile(sourcePath) : readFile(sourcePath, "utf8"),
      ).then((res) => res.value);
    } catch (err) {
      const msgBase = withAttemptMessage(`read failed: ${(err as Error).message}`, retryPolicy.enabled, retryPolicy.maxAttempts);
      const movedToDeadLetter = retryPolicy.enabled
        ? await moveSourceToDeadLetter(
            sourcePath,
            sourceDir,
            retryPolicy.deadLetterSubdirectory || "_dead-letter",
          )
        : null;
      const msg = movedToDeadLetter ? `${msgBase} (moved to dead-letter: ${movedToDeadLetter})` : msgBase;
      summary.filesFailed += 1;
      summary.errors.push(`${file.relPath}: ${msg}`);
      logFileUpload({ timestamp: ts, filename: outboundName, originalFilename: file.name, fileSize: file.size, status: "failed", errorMessage: msg, ...logBase });
      continue;
    }

    // Build the SOAP request body, exposing the outbound filename to templates.
    const body: string | Buffer = soap.envelopeMode === "template"
      ? applyEnvelopeTemplate(soap.envelopeTemplate || "{PAYLOAD}", {
          payload: typeof payload === "string" ? payload : payload.toString("utf8"),
          filename: outboundName,
        })
      : payload;

    // POST to the SOAP endpoint.
    let responseText: string;
    try {
      const responseResult = await runWithRetries(retryPolicy, async () => {
        const res = await soapPost({
          url: soap.url,
          body,
          authBasic: basicAuth,
          soapAction: soap.soapAction || undefined,
          contentDisposition: outboundName,
          ignoreTlsErrors: !!soap.ignoreTlsErrors,
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          throw new Error(`SOAP HTTP ${res.status}${res.text ? `: ${res.text.slice(0, 200)}` : ""}`);
        }
        return res.text;
      });
      responseText = responseResult.value;
    } catch (err) {
      const msgBase = withAttemptMessage(`SOAP call failed: ${(err as Error).message}`, retryPolicy.enabled, retryPolicy.maxAttempts);
      const movedToDeadLetter = retryPolicy.enabled
        ? await moveSourceToDeadLetter(
            sourcePath,
            sourceDir,
            retryPolicy.deadLetterSubdirectory || "_dead-letter",
          )
        : null;
      const msg = movedToDeadLetter ? `${msgBase} (moved to dead-letter: ${movedToDeadLetter})` : msgBase;
      summary.filesFailed += 1;
      summary.errors.push(`${file.relPath}: ${msg}`);
      logFileUpload({ timestamp: ts, filename: outboundName, originalFilename: file.name, fileSize: file.size, status: "failed", errorMessage: msg, ...logBase });
      continue;
    }

    // SOAP succeeded for this file.
    const responseBody = soap.extractBody ? extractSoapBody(responseText) : responseText;
    const warnings: string[] = [];
    const hardFailures: string[] = [];

    // Save the response locally (optional).
    let savedLocalPath: string | null = null;
    let savedName: string | null = null;
    const desiredName = applyFilenameMask(naming, file.name);
    if (responseDir) {
      const resolution = applyConflictPolicy(
        desiredName,
        "rename",
        (n) => writtenResponses.has(path.join(responseDir!, n)) || existsSync(path.join(responseDir!, n)),
      );
      savedName = resolution.name || desiredName;
      savedLocalPath = path.join(responseDir, savedName);
      try {
        await runWithRetries(retryPolicy, async () => {
          await writeFile(savedLocalPath!, responseBody, "utf8");
        });
        writtenResponses.add(savedLocalPath);
      } catch (err) {
        hardFailures.push(withAttemptMessage(`save response failed: ${(err as Error).message}`, retryPolicy.enabled, retryPolicy.maxAttempts));
        savedLocalPath = null;
      }
    } else {
      savedName = desiredName;
    }

    // Deliver the response to FTP (optional).
    if (ftpConn) {
      let uploadPath = savedLocalPath;
      let tempPath: string | null = null;
      try {
        if (!uploadPath) {
          tempPath = path.join(os.tmpdir(), `filedrop-soap-${randomUUID()}.xml`);
          await runWithRetries(retryPolicy, async () => {
            await writeFile(tempPath!, responseBody, "utf8");
          });
          uploadPath = tempPath;
        }
        const remoteName = savedName || desiredName;
        const remoteTarget = path.posix.join(integration.ftpRemotePath || ".", remoteName);
        await runWithRetries(retryPolicy, async () => {
          await ftpUploadFile(ftpConn, uploadPath!, remoteTarget);
        });
      } catch (err) {
        hardFailures.push(withAttemptMessage(`FTP upload failed: ${(err as Error).message}`, retryPolicy.enabled, retryPolicy.maxAttempts));
      } finally {
        if (tempPath) { try { await unlink(tempPath); } catch { /* best effort */ } }
      }
    }
    if (hardFailures.length > 0) {
      const movedToDeadLetter = retryPolicy.enabled
        ? await moveSourceToDeadLetter(
            sourcePath,
            sourceDir,
            retryPolicy.deadLetterSubdirectory || "_dead-letter",
          )
        : null;
      const failureMessage = movedToDeadLetter
        ? `${hardFailures.join("; ")} (moved to dead-letter: ${movedToDeadLetter})`
        : hardFailures.join("; ");
      summary.filesFailed += 1;
      summary.errors.push(`${file.relPath}: ${failureMessage}`);
      logFileUpload({
        timestamp: ts,
        filename: savedName || outboundName,
        originalFilename: file.name,
        fileSize: file.size,
        status: "failed",
        errorMessage: failureMessage,
        ...logBase,
      });
      continue;
    }

    // Archive the source on success (takes precedence), else delete when configured.
    if (archivePolicy.enabled) {
      try {
        const archived = await runWithRetries(retryPolicy, async () =>
          moveSourceToArchive(sourcePath, sourceDir, archivePolicy.subdirectory, archivePolicy.fileNaming),
        ).then((res) => res.value);
        if (!archived) {
          warnings.push("archive source failed: could not move file to archive subdirectory");
        }
      } catch (err) {
        warnings.push(`archive source failed: ${(err as Error).message}`);
      }
    } else if (integration.deleteSourceAfterRun) {
      try {
        await runWithRetries(retryPolicy, async () => {
          await unlink(sourcePath);
        });
      } catch (err) {
        warnings.push(`delete source failed: ${(err as Error).message}`);
      }
    }

    summary.filesOk += 1;
    if (warnings.length > 0) summary.errors.push(`${file.relPath}: ${warnings.join("; ")}`);
    logFileUpload({
      timestamp: ts,
      filename: savedName || outboundName,
      originalFilename: file.name,
      fileSize: Buffer.byteLength(responseBody),
      status: "success",
      errorMessage: warnings.length > 0 ? warnings.join("; ") : undefined,
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

  emitIntegrationWebhook(integration, {
    failed: summary.filesFailed > 0 || summary.status === "failed",
    payload: {
      integrationId: integration.id,
      integrationName: integration.name,
      trigger,
      status: summary.status,
      filesTotal: summary.filesTotal,
      filesOk: summary.filesOk,
      filesFailed: summary.filesFailed,
      filesSkipped: summary.filesSkipped,
      errors: summary.errors.slice(0, 5),
    },
  });

  return summary;
}
