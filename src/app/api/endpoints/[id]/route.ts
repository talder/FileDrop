import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import type { DropEndpoint } from "@/lib/types";

const ENDPOINTS_FILE = "endpoints.json";

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
  if (body.allowedExtensions !== undefined) ep.allowedExtensions = body.allowedExtensions;
  if (body.maxFileSize !== undefined) ep.maxFileSize = body.maxFileSize;
  if (body.enabled !== undefined) ep.enabled = body.enabled;
  if (body.type !== undefined) ep.type = body.type;
  if (body.fileNaming !== undefined) ep.fileNaming = body.fileNaming;
  if (body.allowRetrieval !== undefined) ep.allowRetrieval = body.allowRetrieval;
  if (body.sftp !== undefined) ep.sftp = body.sftp;
  if (body.poll !== undefined) ep.poll = body.poll;
  if (body.notifications !== undefined) ep.notifications = body.notifications;
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
