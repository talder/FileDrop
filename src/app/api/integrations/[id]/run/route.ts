import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getIntegrationById } from "@/lib/integrations";
import { runIntegration } from "@/lib/integration-runner";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const integration = await getIntegrationById(id);
  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  auditLog({
    actor: user.username,
    action: "integration.run.manual",
    targetType: "integration",
    targetId: integration.id,
    details: { name: integration.name },
    sourceIp: getRequestIp(request),
  });

  const summary = await runIntegration(integration, "manual");
  return NextResponse.json(summary);
}
