import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getTransfers, writeTransfers } from "@/lib/transfers";
import { getSftpConnectionById } from "@/lib/sftp-connections";
import { getDestinationById } from "@/lib/destinations";
import { rescheduleTransfer } from "@/lib/scheduler";
import { validateSchedule, normalizeSchedule } from "@/lib/transfer-util";
import { normalizeRetryPolicy } from "@/lib/retry-policy";
import { auditLog, getRequestIp } from "@/lib/audit";
import type {
  Transfer,
  TransferConflictPolicy,
  TransferDirection,
  TransferSchedule,
  TransferSelection,
} from "@/lib/types";

const DEFAULT_SELECTION: TransferSelection = { mode: "all" };
const DEFAULT_SCHEDULE: TransferSchedule = { enabled: false, every: 1, unit: "minutes" };

function normalizeNotificationMode(value: unknown): "none" | "failures" | "all" {
  if (value === "all" || value === "failures") return value;
  return "none";
}

function normalizeWebhook(input: unknown): Transfer["webhook"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const config = input as { url?: unknown; on?: unknown; secret?: unknown };
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const on = normalizeNotificationMode(config.on);
  const secret = typeof config.secret === "string" ? config.secret.trim() : "";
  if (!url || on === "none") return undefined;
  return { url, on, ...(secret ? { secret } : {}) };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transfers = await getTransfers();
  return NextResponse.json(transfers);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, connectionId, destinationId, direction } = body;

    if (!name || !connectionId || !destinationId) {
      return NextResponse.json({ error: "Name, SFTP server, and destination are required" }, { status: 400 });
    }
    if (direction !== "pull" && direction !== "push") {
      return NextResponse.json({ error: "Direction must be 'pull' or 'push'" }, { status: 400 });
    }

    if (!(await getSftpConnectionById(connectionId))) {
      return NextResponse.json({ error: "SFTP server not found" }, { status: 400 });
    }
    if (!(await getDestinationById(destinationId))) {
      return NextResponse.json({ error: "Destination not found" }, { status: 400 });
    }

    const schedule = normalizeSchedule(body.schedule || DEFAULT_SCHEDULE);
    const scheduleCheck = validateSchedule(schedule);
    if (!scheduleCheck.valid) {
      return NextResponse.json({ error: scheduleCheck.error }, { status: 400 });
    }

    const transfers = await getTransfers();
    if (transfers.some((t) => t.name.toLowerCase() === String(name).toLowerCase())) {
      return NextResponse.json({ error: "A transfer with this name already exists" }, { status: 409 });
    }

    const transfer: Transfer = {
      id: randomUUID(),
      name,
      description: body.description || "",
      enabled: body.enabled !== false,
      connectionId,
      direction: direction as TransferDirection,
      remotePath: body.remotePath || ".",
      destinationId,
      subdirectory: body.subdirectory || undefined,
      selection: (body.selection as TransferSelection) || DEFAULT_SELECTION,
      fileNaming: body.fileNaming || { mode: "original", mask: "" },
      conflictPolicy: (body.conflictPolicy as TransferConflictPolicy) || "skip",
      deleteSourceAfterTransfer: !!body.deleteSourceAfterTransfer,
      schedule,
      notifications: body.notifications || undefined,
      webhook: normalizeWebhook(body.webhook),
      retryPolicy: body.retryPolicy !== undefined ? normalizeRetryPolicy(body.retryPolicy) : undefined,
      createdAt: new Date().toISOString(),
    };

    transfers.push(transfer);
    await writeTransfers(transfers);
    await rescheduleTransfer(transfer.id);

    auditLog({
      actor: user.username,
      action: "transfer.create",
      targetType: "transfer",
      targetId: transfer.id,
      details: { name: transfer.name, direction: transfer.direction },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(transfer);
  } catch (error) {
    console.error("Create transfer error:", error);
    return NextResponse.json({ error: "Failed to create transfer" }, { status: 500 });
  }
}
