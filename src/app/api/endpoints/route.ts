import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  return NextResponse.json(endpoints);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { slug, description, destinationId, subdirectory, allowedExtensions, maxFileSize, enabled } = body;

    if (!slug || !destinationId) {
      return NextResponse.json({ error: "Slug and destination are required" }, { status: 400 });
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      return NextResponse.json({ error: "Slug must contain only lowercase letters, numbers, and hyphens" }, { status: 400 });
    }

    const type = body.type === "sftp-server" ? "sftp-server" : "api";

    const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);

    if (endpoints.some((e) => e.slug === slug)) {
      return NextResponse.json({ error: "An endpoint with this slug already exists" }, { status: 409 });
    }

    const newEndpoint: DropEndpoint = {
      id: randomUUID(),
      slug,
      description: description || "",
      type,
      destinationId,
      subdirectory: subdirectory || undefined,
      filters: normalizeFilters(body.filters),
      allowedExtensions: Array.isArray(allowedExtensions) ? allowedExtensions : [],
      maxFileSize: maxFileSize || 0,
      enabled: enabled !== false,
      fileNaming: body.fileNaming || { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" },
      allowRetrieval: body.allowRetrieval || false,
      notifications: body.notifications || undefined,
      webhook: normalizeWebhook(body.webhook),
      retentionDays: normalizeRetentionDays(body.retentionDays),
      rejectDuplicates: body.rejectDuplicates === true,
      createdAt: new Date().toISOString(),
    };

    endpoints.push(newEndpoint);
    await writeJsonConfig(ENDPOINTS_FILE, endpoints);

    return NextResponse.json(newEndpoint);
  } catch (error) {
    console.error("Create endpoint error:", error);
    return NextResponse.json({ error: "Failed to create endpoint" }, { status: 500 });
  }
}
