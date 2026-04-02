import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey, deleteApiKey, updateApiKeyEndpoints } from "@/lib/api-keys";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = deleteApiKey(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.revoke === true) {
    const revoked = revokeApiKey(id);
    if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Key revoked" });
  }

  if (body.allowedEndpoints) {
    const updated = updateApiKeyEndpoints(id, body.allowedEndpoints);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No valid action specified" }, { status: 400 });
}
