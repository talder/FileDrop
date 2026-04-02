import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDestinationById, mountNfs, mountSmb, decryptPassword } from "@/lib/destinations";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dest = await getDestinationById(id);
  if (!dest) return NextResponse.json({ error: "Destination not found" }, { status: 404 });

  if (dest.type === "local") {
    return NextResponse.json({ error: "Local destinations do not need mounting" }, { status: 400 });
  }

  let result: { success: boolean; error?: string };

  if (dest.type === "nfs") {
    result = mountNfs(dest);
  } else {
    const password = dest.smbPasswordEncrypted ? decryptPassword(dest.smbPasswordEncrypted) : undefined;
    result = mountSmb(dest, password || undefined);
  }

  if (result.success) {
    return NextResponse.json({ success: true, message: "Mounted successfully" });
  } else {
    return NextResponse.json({ error: result.error || "Mount failed" }, { status: 500 });
  }
}
