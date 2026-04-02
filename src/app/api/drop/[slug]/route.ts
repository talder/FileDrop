import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readdir, stat } from "fs/promises";
import path from "path";
import { readJsonConfig } from "@/lib/config";
import { validateApiKey } from "@/lib/api-keys";
import { getDestinationById, isPathAccessible } from "@/lib/destinations";
import { logFileUpload } from "@/lib/file-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { logConnection, resolveHostname } from "@/lib/connection-log";
import { applyFilenameMask } from "@/lib/file-naming";
import type { DropEndpoint, FileNaming } from "@/lib/types";

const ENDPOINTS_FILE = "endpoints.json";
const SETTINGS_FILE = "settings.json";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ── GET: list files from an endpoint ─────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const startTime = Date.now();
  const sourceIp = getClientIp(request);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const apiKey = validateApiKey(authHeader.substring(7));
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid, expired, or revoked API key" }, { status: 401 });
  }

  if (!apiKey.allowedEndpoints.includes(slug) && !apiKey.allowedEndpoints.includes("*")) {
    return NextResponse.json({ error: "API key does not have access to this endpoint" }, { status: 403 });
  }

  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const endpoint = endpoints.find((e) => e.slug === slug);
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  if (!endpoint.allowRetrieval) return NextResponse.json({ error: "File retrieval is not enabled for this endpoint" }, { status: 403 });

  const dest = await getDestinationById(endpoint.destinationId);
  if (!dest) return NextResponse.json({ error: "Destination not configured" }, { status: 500 });

  let destPath = dest.localPath;
  if (endpoint.subdirectory) destPath = path.join(destPath, endpoint.subdirectory);

  try {
    const entries = await readdir(destPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileStat = await stat(path.join(destPath, entry.name));
      files.push({ filename: entry.name, size: fileStat.size, modifiedAt: fileStat.mtime.toISOString() });
    }

    const hostname = await resolveHostname(sourceIp);
    logConnection({
      timestamp: new Date().toISOString(), sourceIp, hostname, method: "GET",
      path: `/api/drop/${slug}`, statusCode: 200, apiKeyId: apiKey.id,
      partyName: apiKey.partyName, userAgent: request.headers.get("user-agent") || "",
      responseTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({ files, count: files.length });
  } catch {
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

// ── POST: upload files ───────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const startTime = Date.now();
  const sourceIp = getClientIp(request);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header. Use: Bearer <api_key>" }, { status: 401 });
  }

  const apiKey = validateApiKey(authHeader.substring(7));
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid, expired, or revoked API key" }, { status: 401 });
  }

  const settings = await readJsonConfig<{ rateLimitPerKey: number }>(SETTINGS_FILE, { rateLimitPerKey: 60 });
  const rateLimited = checkRateLimit(`key:${apiKey.id}`, settings.rateLimitPerKey);
  if (rateLimited) return rateLimited;

  if (!apiKey.allowedEndpoints.includes(slug) && !apiKey.allowedEndpoints.includes("*")) {
    return NextResponse.json({ error: "API key does not have access to this endpoint" }, { status: 403 });
  }

  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const endpoint = endpoints.find((e) => e.slug === slug);
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  if (!endpoint.enabled) return NextResponse.json({ error: "Endpoint is currently disabled" }, { status: 503 });

  const dest = await getDestinationById(endpoint.destinationId);
  if (!dest) return NextResponse.json({ error: "Destination not configured" }, { status: 500 });

  const hostnamePromise = resolveHostname(sourceIp);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const files = formData.getAll("file").concat(formData.getAll("files"));
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided. Use field name 'file' or 'files'" }, { status: 400 });
  }

  const globalSettings = await readJsonConfig<{ maxFileSize: number }>(SETTINGS_FILE, { maxFileSize: 52428800 });
  const maxSize = endpoint.maxFileSize > 0 ? endpoint.maxFileSize : globalSettings.maxFileSize;

  let destPath = dest.localPath;
  if (endpoint.subdirectory) destPath = path.join(destPath, endpoint.subdirectory);
  try { await mkdir(destPath, { recursive: true }); } catch { /* exists */ }

  if (!isPathAccessible(dest.localPath)) {
    return NextResponse.json({ error: "Destination is not accessible" }, { status: 503 });
  }

  const naming: FileNaming = endpoint.fileNaming || { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" };
  const hostname = await hostnamePromise;

  const results: Array<{ filename: string; originalFilename: string; size: number; id: number }> = [];
  const errors: string[] = [];

  for (const fileEntry of files) {
    if (!(fileEntry instanceof File)) continue;
    const originalName = fileEntry.name || "unnamed";

    if (fileEntry.size > maxSize) {
      const msg = `File "${originalName}" exceeds maximum size of ${(maxSize / 1024 / 1024).toFixed(1)}MB`;
      errors.push(msg);
      logFileUpload({ timestamp: new Date().toISOString(), filename: originalName, originalFilename: originalName, fileSize: fileEntry.size, mimeType: fileEntry.type || "", sourceIp, sourceHostname: hostname, apiKeyId: apiKey.id, apiKeyPartyName: apiKey.partyName, endpointSlug: slug, destinationPath: destPath, destinationName: dest.name, status: "failed", errorMessage: msg });
      continue;
    }

    if (endpoint.allowedExtensions.length > 0) {
      const ext = path.extname(originalName).toLowerCase();
      if (!endpoint.allowedExtensions.includes(ext)) {
        const msg = `Extension "${ext}" not allowed`;
        errors.push(msg);
        logFileUpload({ timestamp: new Date().toISOString(), filename: originalName, originalFilename: originalName, fileSize: fileEntry.size, mimeType: fileEntry.type || "", sourceIp, sourceHostname: hostname, apiKeyId: apiKey.id, apiKeyPartyName: apiKey.partyName, endpointSlug: slug, destinationPath: destPath, destinationName: dest.name, status: "failed", errorMessage: msg });
        continue;
      }
    }

    try {
      const filename = applyFilenameMask(naming, originalName);
      const filePath = path.join(destPath, filename);
      const buffer = Buffer.from(await fileEntry.arrayBuffer());
      await writeFile(filePath, buffer);

      const logId = logFileUpload({ timestamp: new Date().toISOString(), filename, originalFilename: originalName, fileSize: fileEntry.size, mimeType: fileEntry.type || "", sourceIp, sourceHostname: hostname, apiKeyId: apiKey.id, apiKeyPartyName: apiKey.partyName, endpointSlug: slug, destinationPath: destPath, destinationName: dest.name, status: "success" });
      results.push({ filename, originalFilename: originalName, size: fileEntry.size, id: logId });
    } catch (err) {
      const msg = `Write failed: ${(err as Error).message}`;
      errors.push(msg);
      logFileUpload({ timestamp: new Date().toISOString(), filename: originalName, originalFilename: originalName, fileSize: fileEntry.size, mimeType: fileEntry.type || "", sourceIp, sourceHostname: hostname, apiKeyId: apiKey.id, apiKeyPartyName: apiKey.partyName, endpointSlug: slug, destinationPath: destPath, destinationName: dest.name, status: "failed", errorMessage: msg });
    }
  }

  const statusCode = results.length === 0 && errors.length > 0 ? 400 : 200;

  logConnection({
    timestamp: new Date().toISOString(), sourceIp, hostname, method: "POST",
    path: `/api/drop/${slug}`, statusCode, apiKeyId: apiKey.id,
    partyName: apiKey.partyName, userAgent: request.headers.get("user-agent") || "",
    responseTimeMs: Date.now() - startTime,
  });

  if (statusCode === 400) {
    return NextResponse.json({ error: "All files failed", details: errors }, { status: 400 });
  }

  return NextResponse.json({
    success: true, received: results.length, failed: errors.length, files: results,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
