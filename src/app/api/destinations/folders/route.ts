import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { createFolder, renameFolder, deleteFolder } from "@/lib/data-folders";

/** Create a folder: { parentPath, name } */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parentPath = typeof body.parentPath === "string" ? body.parentPath : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  const result = await createFolder(parentPath, name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });

  auditLog({
    actor: user.username,
    action: "data.folder.create",
    targetType: "folder",
    targetId: result.path || "",
    details: { parentPath, name },
    sourceIp: getRequestIp(request),
  });
  return NextResponse.json({ ok: true, path: result.path });
}

/** Rename a folder: { path, newName } */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetPath = typeof body.path === "string" ? body.path : "";
  const newName = typeof body.newName === "string" ? body.newName.trim() : "";

  const result = await renameFolder(targetPath, newName);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });

  auditLog({
    actor: user.username,
    action: "data.folder.rename",
    targetType: "folder",
    targetId: result.path || "",
    details: { from: targetPath, to: result.path },
    sourceIp: getRequestIp(request),
  });
  return NextResponse.json({ ok: true, path: result.path });
}

/** Delete a folder: { path, recursive } */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetPath = typeof body.path === "string" ? body.path : "";
  const recursive = body.recursive === true;

  const result = await deleteFolder(targetPath, { recursive });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });

  auditLog({
    actor: user.username,
    action: "data.folder.delete",
    targetType: "folder",
    targetId: result.path || "",
    details: { path: result.path, recursive },
    sourceIp: getRequestIp(request),
  });
  return NextResponse.json({ ok: true, path: result.path });
}
