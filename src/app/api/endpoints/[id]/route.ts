import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import { normalizeFilters } from "@/lib/endpoint-filters";
import type { DropEndpoint } from "@/lib/types";

const ENDPOINTS_FILE = "endpoints.json";

function normalizeNotificationMode(value: unknown): "none" | "failures" | "all" {
  if (value === "all" || value === "failures") return value;
  return "none";
}

function normalizeWebhook(input: unknown): DropEndpoint["webhook"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const config = input as { url?: unknown; on?: unknown; secret?: unknown };
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const on = normalizeNotificationMode(config.on);
  const secret = typeof config.secret === "string" ? config.secret.trim() : "";
  if (!url || on === "none") return undefined;
  return { url, on, ...(secret ? { secret } : {}) };
}

function normalizeRetentionDays(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return numeric;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(endpoint);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const idx = endpoints.findIndex((e) => e.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ep = endpoints[idx];
  if (body.slug !== undefined) ep.slug = body.slug;
  if (body.description !== undefined) ep.description = body.description;
  if (body.destinationId !== undefined) ep.destinationId = body.destinationId;
  if (body.subdirectory !== undefined) ep.subdirectory = body.subdirectory;
  if (body.filters !== undefined) ep.filters = normalizeFilters(body.filters);
  if (body.allowedExtensions !== undefined) ep.allowedExtensions = body.allowedExtensions;
  if (body.maxFileSize !== undefined) ep.maxFileSize = body.maxFileSize;
  if (body.enabled !== undefined) ep.enabled = body.enabled;
  if (body.type !== undefined) ep.type = body.type === "sftp-server" ? "sftp-server" : "api";
  if (body.fileNaming !== undefined) ep.fileNaming = body.fileNaming;
  if (body.allowRetrieval !== undefined) ep.allowRetrieval = body.allowRetrieval;
  if (body.notifications !== undefined) ep.notifications = body.notifications;
  if (body.webhook !== undefined) ep.webhook = normalizeWebhook(body.webhook);
  if (body.retentionDays !== undefined) ep.retentionDays = normalizeRetentionDays(body.retentionDays);
  if (body.rejectDuplicates !== undefined) ep.rejectDuplicates = !!body.rejectDuplicates;
  ep.updatedAt = new Date().toISOString();

  endpoints[idx] = ep;
  await writeJsonConfig(ENDPOINTS_FILE, endpoints);

  return NextResponse.json(ep);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const filtered = endpoints.filter((e) => e.id !== id);
  if (filtered.length === endpoints.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeJsonConfig(ENDPOINTS_FILE, filtered);
  return NextResponse.json({ success: true });
}
