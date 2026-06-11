import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTransferById } from "@/lib/transfers";
import { runTransfer } from "@/lib/transfer-runner";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const transfer = await getTransferById(id);
  if (!transfer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  auditLog({
    actor: user.username,
    action: "transfer.run.manual",
    targetType: "transfer",
    targetId: transfer.id,
    details: { name: transfer.name },
    sourceIp: getRequestIp(request),
  });

  const summary = await runTransfer(transfer, "manual");
  return NextResponse.json(summary);
}
