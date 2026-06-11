import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getIntegrations, writeIntegrations } from "@/lib/integrations";
import { getSoapConnectionById } from "@/lib/soap-connections";
import { getFtpConnectionById } from "@/lib/ftp-connections";
import { getDestinationById } from "@/lib/destinations";
import { rescheduleIntegration } from "@/lib/scheduler";
import { validateSchedule, normalizeSchedule } from "@/lib/transfer-util";
import { auditLog, getRequestIp } from "@/lib/audit";
import type { FileNaming, Integration, TransferSchedule, TransferSelection } from "@/lib/types";

const DEFAULT_SELECTION: TransferSelection = { mode: "all" };
const DEFAULT_SCHEDULE: TransferSchedule = { enabled: false, every: 1, unit: "minutes" };
const DEFAULT_NAMING: FileNaming = { mode: "original", mask: "" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrations = await getIntegrations();
  return NextResponse.json(integrations);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, sourceDestinationId, soapConnectionId } = body;

    if (!name || !sourceDestinationId || !soapConnectionId) {
      return NextResponse.json(
        { error: "Name, source destination, and SOAP connection are required" },
        { status: 400 },
      );
    }

    if (!(await getDestinationById(sourceDestinationId))) {
      return NextResponse.json({ error: "Source destination not found" }, { status: 400 });
    }
    if (!(await getSoapConnectionById(soapConnectionId))) {
      return NextResponse.json({ error: "SOAP connection not found" }, { status: 400 });
    }
    if (body.responseDestinationId && !(await getDestinationById(body.responseDestinationId))) {
      return NextResponse.json({ error: "Response destination not found" }, { status: 400 });
    }
    if (body.ftpConnectionId && !(await getFtpConnectionById(body.ftpConnectionId))) {
      return NextResponse.json({ error: "FTP connection not found" }, { status: 400 });
    }

    const schedule = normalizeSchedule(body.schedule || DEFAULT_SCHEDULE);
    const scheduleCheck = validateSchedule(schedule);
    if (!scheduleCheck.valid) {
      return NextResponse.json({ error: scheduleCheck.error }, { status: 400 });
    }

    const integrations = await getIntegrations();
    if (integrations.some((i) => i.name.toLowerCase() === String(name).toLowerCase())) {
      return NextResponse.json({ error: "An integration with this name already exists" }, { status: 409 });
    }

    const integration: Integration = {
      id: randomUUID(),
      name,
      description: body.description || "",
      enabled: body.enabled !== false,
      sourceDestinationId,
      sourceSubdirectory: body.sourceSubdirectory || undefined,
      sourceSelection: (body.sourceSelection as TransferSelection) || DEFAULT_SELECTION,
      soapConnectionId,
      responseDestinationId: body.responseDestinationId || undefined,
      responseSubdirectory: body.responseSubdirectory || undefined,
      responseFileNaming: (body.responseFileNaming as FileNaming) || DEFAULT_NAMING,
      ftpConnectionId: body.ftpConnectionId || undefined,
      ftpRemotePath: body.ftpRemotePath || undefined,
      deleteSourceAfterRun: !!body.deleteSourceAfterRun,
      schedule,
      notifications: body.notifications || undefined,
      createdAt: new Date().toISOString(),
    };

    integrations.push(integration);
    await writeIntegrations(integrations);
    await rescheduleIntegration(integration.id);

    auditLog({
      actor: user.username,
      action: "integration.create",
      targetType: "integration",
      targetId: integration.id,
      details: { name: integration.name },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(integration);
  } catch (error) {
    console.error("Create integration error:", error);
    return NextResponse.json({ error: "Failed to create integration" }, { status: 500 });
  }
}
