import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFtpConnectionById } from "@/lib/ftp-connections";
import { encryptPassword } from "@/lib/destinations";
import { ftpTest } from "@/lib/ftp";
import type { FtpConnectionParams } from "@/lib/ftp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Allow testing a brand-new connection (id === "new") using inline params,
  // or an existing saved connection with optional inline credential overrides.
  const saved = id === "new" ? null : await getFtpConnectionById(id);
  if (!saved && id !== "new") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conn: FtpConnectionParams = {
    host: body.host ?? saved?.host,
    port: Number(body.port) || saved?.port || 21,
    username: body.username ?? saved?.username,
    passwordEncrypted: body.password ? encryptPassword(body.password) : saved?.passwordEncrypted,
    secure: body.secure !== undefined ? body.secure === true : saved?.secure === true,
    ignoreTlsErrors:
      body.ignoreTlsErrors !== undefined ? body.ignoreTlsErrors === true : saved?.ignoreTlsErrors === true,
  };

  if (!conn.host || !conn.username) {
    return NextResponse.json({ success: false, error: "Host and username are required" }, { status: 400 });
  }

  const result = await ftpTest(conn, body.remotePath);
  return NextResponse.json(result);
}
