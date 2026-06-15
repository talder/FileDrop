import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { getTags, getTagsPruned, writeTags } from "@/lib/tags";
import { isValidTagName, normalizeTag } from "@/lib/flow";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getTagsPruned());
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    if (!isValidTagName(body?.name)) {
      return NextResponse.json({ error: "Tag name is required (1–60 characters)" }, { status: 400 });
    }

    const tags = await getTags();
    const name = String(body.name).trim();
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
    }

    const tag = normalizeTag(body, { id: randomUUID(), createdAt: new Date().toISOString() });
    tags.push(tag);
    await writeTags(tags);

    auditLog({
      actor: user.username,
      action: "tag.create",
      targetType: "tag",
      targetId: tag.id,
      details: { name: tag.name, members: tag.members.length },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(tag);
  } catch (error) {
    console.error("Create tag error:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
