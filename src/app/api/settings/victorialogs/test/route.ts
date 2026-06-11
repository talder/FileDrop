import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { testVictoriaLogs, type VictoriaLogProtocol } from "@/lib/victorialog";
import { DEFAULT_SETTINGS } from "@/lib/types";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const host: string = body.host ?? DEFAULT_SETTINGS.victoriaLogsHost;
  const port: number = Number(body.port ?? DEFAULT_SETTINGS.victoriaLogsPort);
  const protocol: VictoriaLogProtocol = body.protocol ?? DEFAULT_SETTINGS.victoriaLogsProtocol;

  if (!host) return NextResponse.json({ error: "Host is required" }, { status: 400 });

  const result = await testVictoriaLogs({ enabled: true, host, port, protocol });
  if (result.success) return NextResponse.json({ success: true });
  return NextResponse.json({ success: false, error: result.error || "Failed to reach VictoriaLogs" });
}
