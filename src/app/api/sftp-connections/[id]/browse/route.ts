import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSftpConnectionById } from "@/lib/sftp-connections";
import { encryptPassword } from "@/lib/destinations";
import { sftpBrowse } from "@/lib/sftp";
import type { SftpConnectionParams } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Allow browsing a brand-new server (id === "new") using only inline params,
  // or an existing saved server with optional inline credential overrides.
  const saved = id === "new" ? null : await getSftpConnectionById(id);
  if (!saved && id !== "new") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conn: SftpConnectionParams = {
    host: body.host ?? saved?.host,
    port: Number(body.port) || saved?.port || 22,
    username: body.username ?? saved?.username,
    passwordEncrypted: body.password ? encryptPassword(body.password) : saved?.passwordEncrypted,
    privateKey: body.privateKey ?? saved?.privateKey,
  };

  if (!conn.host || !conn.username) {
    return NextResponse.json({ error: "Host and username are required" }, { status: 400 });
  }

  try {
    const result = await sftpBrowse(conn, typeof body.path === "string" ? body.path : undefined);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Failed to browse server" }, { status: 500 });
  }
}
