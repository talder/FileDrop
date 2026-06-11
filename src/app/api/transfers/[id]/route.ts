import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTransfers, writeTransfers } from "@/lib/transfers";
import { getSftpConnectionById } from "@/lib/sftp-connections";
import { getDestinationById } from "@/lib/destinations";
import { rescheduleTransfer, unscheduleTransfer } from "@/lib/scheduler";
import { validateSchedule, normalizeSchedule } from "@/lib/transfer-util";
import { normalizeRetryPolicy } from "@/lib/retry-policy";
import { auditLog, getRequestIp } from "@/lib/audit";

function normalizeNotificationMode(value: unknown): "none" | "failures" | "all" {
  if (value === "all" || value === "failures") return value;
  return "none";
}

function normalizeWebhook(input: unknown): { url: string; on: "none" | "failures" | "all"; secret?: string } | undefined {
  if (!input || typeof input !== "object") return undefined;
  const config = input as { url?: unknown; on?: unknown; secret?: unknown };
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const on = normalizeNotificationMode(config.on);
  const secret = typeof config.secret === "string" ? config.secret.trim() : "";
  if (!url || on === "none") return undefined;
  return { url, on, ...(secret ? { secret } : {}) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const transfers = await getTransfers();
  const transfer = transfers.find((t) => t.id === id);
  if (!transfer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(transfer);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const transfers = await getTransfers();
  const idx = transfers.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const transfer = transfers[idx];

  if (body.name !== undefined) {
    if (transfers.some((t) => t.id !== id && t.name.toLowerCase() === String(body.name).toLowerCase())) {
      return NextResponse.json({ error: "A transfer with this name already exists" }, { status: 409 });
    }
    transfer.name = body.name;
  }
  if (body.connectionId !== undefined) {
    if (!(await getSftpConnectionById(body.connectionId))) {
      return NextResponse.json({ error: "SFTP server not found" }, { status: 400 });
    }
    transfer.connectionId = body.connectionId;
  }
  if (body.destinationId !== undefined) {
    if (!(await getDestinationById(body.destinationId))) {
      return NextResponse.json({ error: "Destination not found" }, { status: 400 });
    }
    transfer.destinationId = body.destinationId;
  }
  if (body.direction !== undefined) {
    if (body.direction !== "pull" && body.direction !== "push") {
      return NextResponse.json({ error: "Direction must be 'pull' or 'push'" }, { status: 400 });
    }
    transfer.direction = body.direction;
  }
  if (body.description !== undefined) transfer.description = body.description;
  if (body.enabled !== undefined) transfer.enabled = !!body.enabled;
  if (body.remotePath !== undefined) transfer.remotePath = body.remotePath || ".";
  if (body.subdirectory !== undefined) transfer.subdirectory = body.subdirectory || undefined;
  if (body.selection !== undefined) transfer.selection = body.selection;
  if (body.fileNaming !== undefined) transfer.fileNaming = body.fileNaming;
  if (body.conflictPolicy !== undefined) transfer.conflictPolicy = body.conflictPolicy;
  if (body.deleteSourceAfterTransfer !== undefined) {
    transfer.deleteSourceAfterTransfer = !!body.deleteSourceAfterTransfer;
  }
  if (body.notifications !== undefined) transfer.notifications = body.notifications || undefined;
  if (body.webhook !== undefined) transfer.webhook = normalizeWebhook(body.webhook);
  if (body.retryPolicy !== undefined) transfer.retryPolicy = normalizeRetryPolicy(body.retryPolicy);
  if (body.schedule !== undefined) {
    const schedule = normalizeSchedule(body.schedule);
    const check = validateSchedule(schedule);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    transfer.schedule = schedule;
  }
  transfer.updatedAt = new Date().toISOString();

  transfers[idx] = transfer;
  await writeTransfers(transfers);
  await rescheduleTransfer(transfer.id);

  auditLog({
    actor: user.username,
    action: "transfer.update",
    targetType: "transfer",
    targetId: transfer.id,
    details: { name: transfer.name },
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json(transfer);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const transfers = await getTransfers();
  const filtered = transfers.filter((t) => t.id !== id);
  if (filtered.length === transfers.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  unscheduleTransfer(id);
  await writeTransfers(filtered);

  auditLog({
    actor: user.username,
    action: "transfer.delete",
    targetType: "transfer",
    targetId: id,
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json({ success: true });
}
