import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDestinationById, isPathAccessible, isMounted } from "@/lib/destinations";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dest = await getDestinationById(id);
  if (!dest) return NextResponse.json({ error: "Destination not found" }, { status: 404 });

  const accessible = isPathAccessible(dest.localPath);
  const mounted = dest.type !== "local" ? isMounted(dest.localPath) : null;

  return NextResponse.json({
    accessible,
    mounted,
    localPath: dest.localPath,
    message: accessible
      ? "Destination is accessible and writable"
      : "Destination path is not accessible — check if it exists and has correct permissions",
  });
}
