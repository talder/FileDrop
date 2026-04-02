import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConnections } from "@/lib/connection-log";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const result = getConnections({
    limit: parseInt(url.searchParams.get("limit") || "50"),
    offset: parseInt(url.searchParams.get("offset") || "0"),
    sourceIp: url.searchParams.get("ip") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  return NextResponse.json(result);
}
