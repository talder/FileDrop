import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTransferRuns } from "@/lib/transfer-runs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 200);

  const runs = getTransferRuns(id, limit);
  return NextResponse.json(runs);
}
