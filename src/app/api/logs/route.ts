import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFileLogs, getLogStats } from "@/lib/file-log";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const endpointSlug = url.searchParams.get("endpoint") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const statsOnly = url.searchParams.get("stats") === "true";

  if (statsOnly) {
    return NextResponse.json(getLogStats());
  }

  const result = getFileLogs({ limit, offset, endpointSlug, status, search });
  return NextResponse.json(result);
}
