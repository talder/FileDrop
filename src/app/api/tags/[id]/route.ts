import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { getTags, writeTags } from "@/lib/tags";
import { isValidTagName, normalizeTag } from "@/lib/flow";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tags = await getTags();
  const tag = tags.find((t) => t.id === id);
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(tag);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const tags = await getTags();
  const idx = tags.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = tags[idx];
  const merged = {
    name: body.name !== undefined ? body.name : existing.name,
    color: body.color !== undefined ? body.color : existing.color,
    description: body.description !== undefined ? body.description : existing.description,
    members: body.members !== undefined ? body.members : existing.members,
  };

  if (!isValidTagName(merged.name)) {
    return NextResponse.json({ error: "Tag name is required (1–60 characters)" }, { status: 400 });
  }
  const name = String(merged.name).trim();
  if (tags.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
  }

  const updated = normalizeTag(merged, { id: existing.id, createdAt: existing.createdAt });
  updated.updatedAt = new Date().toISOString();
  tags[idx] = updated;
  await writeTags(tags);

  auditLog({
    actor: user.username,
    action: "tag.update",
    targetType: "tag",
    targetId: id,
    details: { name: updated.name, members: updated.members.length },
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tags = await getTags();
  const filtered = tags.filter((t) => t.id !== id);
  if (filtered.length === tags.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeTags(filtered);

  auditLog({
    actor: user.username,
    action: "tag.delete",
    targetType: "tag",
    targetId: id,
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json({ success: true });
}
