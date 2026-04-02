import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDestinationById, unmountPath } from "@/lib/destinations";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dest = await getDestinationById(id);
  if (!dest) return NextResponse.json({ error: "Destination not found" }, { status: 404 });

  if (dest.type === "local") {
    return NextResponse.json({ error: "Local destinations cannot be unmounted" }, { status: 400 });
  }

  const result = unmountPath(dest.localPath);
  if (result.success) {
    return NextResponse.json({ success: true, message: "Unmounted successfully" });
  } else {
    return NextResponse.json({ error: result.error || "Unmount failed" }, { status: 500 });
  }
}
