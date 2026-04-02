import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const result = getAuditLogs({
    limit: parseInt(url.searchParams.get("limit") || "50"),
    offset: parseInt(url.searchParams.get("offset") || "0"),
    actor: url.searchParams.get("actor") || undefined,
    action: url.searchParams.get("action") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  return NextResponse.json(result);
}
