import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import type { DropEndpoint } from "@/lib/types";

const ENDPOINTS_FILE = "endpoints.json";

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

    const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);

    if (endpoints.some((e) => e.slug === slug)) {
      return NextResponse.json({ error: "An endpoint with this slug already exists" }, { status: 409 });
    }

    const newEndpoint: DropEndpoint = {
      id: randomUUID(),
      slug,
      description: description || "",
      type: body.type || "api",
      destinationId,
      subdirectory: subdirectory || undefined,
      allowedExtensions: Array.isArray(allowedExtensions) ? allowedExtensions : [],
      maxFileSize: maxFileSize || 0,
      enabled: enabled !== false,
      fileNaming: body.fileNaming || { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" },
      allowRetrieval: body.allowRetrieval || false,
      sftp: body.sftp || undefined,
      poll: body.poll || undefined,
      notifications: body.notifications || undefined,
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
