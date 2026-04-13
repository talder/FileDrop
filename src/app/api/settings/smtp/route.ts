import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSmtpConfig, saveSmtpConfig } from "@/lib/email";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getSmtpConfig();
  return NextResponse.json({ ...config, pass: config.pass ? "••••••••" : "" });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  await saveSmtpConfig(body);
  auditLog({ actor: user.username, action: "settings.smtp.update", sourceIp: getRequestIp(request) });

  return NextResponse.json({ success: true });
}
