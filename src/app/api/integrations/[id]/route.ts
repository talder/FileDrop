import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getIntegrations, writeIntegrations } from "@/lib/integrations";
import { getSoapConnectionById } from "@/lib/soap-connections";
import { getFtpConnectionById } from "@/lib/ftp-connections";
import { getDestinationById } from "@/lib/destinations";
import { rescheduleIntegration, unscheduleIntegration } from "@/lib/scheduler";
import { validateSchedule, normalizeSchedule } from "@/lib/transfer-util";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const integrations = await getIntegrations();
  const integration = integrations.find((i) => i.id === id);
  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(integration);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const integrations = await getIntegrations();
  const idx = integrations.findIndex((i) => i.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const integration = integrations[idx];

  if (body.name !== undefined) {
    if (integrations.some((i) => i.id !== id && i.name.toLowerCase() === String(body.name).toLowerCase())) {
      return NextResponse.json({ error: "An integration with this name already exists" }, { status: 409 });
    }
    integration.name = body.name;
  }
  if (body.sourceDestinationId !== undefined) {
    if (!(await getDestinationById(body.sourceDestinationId))) {
      return NextResponse.json({ error: "Source destination not found" }, { status: 400 });
    }
    integration.sourceDestinationId = body.sourceDestinationId;
  }
  if (body.soapConnectionId !== undefined) {
    if (!(await getSoapConnectionById(body.soapConnectionId))) {
      return NextResponse.json({ error: "SOAP connection not found" }, { status: 400 });
    }
    integration.soapConnectionId = body.soapConnectionId;
  }
  if (body.responseDestinationId !== undefined) {
    if (body.responseDestinationId && !(await getDestinationById(body.responseDestinationId))) {
      return NextResponse.json({ error: "Response destination not found" }, { status: 400 });
    }
    integration.responseDestinationId = body.responseDestinationId || undefined;
  }
  if (body.ftpConnectionId !== undefined) {
    if (body.ftpConnectionId && !(await getFtpConnectionById(body.ftpConnectionId))) {
      return NextResponse.json({ error: "FTP connection not found" }, { status: 400 });
    }
    integration.ftpConnectionId = body.ftpConnectionId || undefined;
  }
  if (body.description !== undefined) integration.description = body.description;
  if (body.enabled !== undefined) integration.enabled = !!body.enabled;
  if (body.sourceSubdirectory !== undefined) integration.sourceSubdirectory = body.sourceSubdirectory || undefined;
  if (body.sourceSelection !== undefined) integration.sourceSelection = body.sourceSelection;
  if (body.responseSubdirectory !== undefined) integration.responseSubdirectory = body.responseSubdirectory || undefined;
  if (body.responseFileNaming !== undefined) integration.responseFileNaming = body.responseFileNaming;
  if (body.ftpRemotePath !== undefined) integration.ftpRemotePath = body.ftpRemotePath || undefined;
  if (body.deleteSourceAfterRun !== undefined) integration.deleteSourceAfterRun = !!body.deleteSourceAfterRun;
  if (body.notifications !== undefined) integration.notifications = body.notifications || undefined;
  if (body.schedule !== undefined) {
    const schedule = normalizeSchedule(body.schedule);
    const check = validateSchedule(schedule);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    integration.schedule = schedule;
  }
  integration.updatedAt = new Date().toISOString();

  integrations[idx] = integration;
  await writeIntegrations(integrations);
  await rescheduleIntegration(integration.id);

  auditLog({
    actor: user.username,
    action: "integration.update",
    targetType: "integration",
    targetId: integration.id,
    details: { name: integration.name },
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json(integration);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const integrations = await getIntegrations();
  const filtered = integrations.filter((i) => i.id !== id);
  if (filtered.length === integrations.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  unscheduleIntegration(id);
  await writeIntegrations(filtered);

  auditLog({
    actor: user.username,
    action: "integration.delete",
    targetType: "integration",
    targetId: id,
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json({ success: true });
}
