import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getFtpConnections,
  writeFtpConnections,
  sanitizeFtpConnection,
} from "@/lib/ftp-connections";
import { encryptPassword } from "@/lib/destinations";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const connections = await getFtpConnections();
  const conn = connections.find((c) => c.id === id);
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(sanitizeFtpConnection(conn));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const connections = await getFtpConnections();
  const idx = connections.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conn = connections[idx];
  if (body.name !== undefined) {
    if (connections.some((c) => c.id !== id && c.name.toLowerCase() === String(body.name).toLowerCase())) {
      return NextResponse.json({ error: "A connection with this name already exists" }, { status: 409 });
    }
    conn.name = body.name;
  }
  if (body.host !== undefined) conn.host = body.host;
  if (body.port !== undefined) conn.port = Number(body.port) || 21;
  if (body.username !== undefined) conn.username = body.username;
  if (body.password) conn.passwordEncrypted = encryptPassword(body.password);
  if (body.secure !== undefined) conn.secure = body.secure === true;
  if (body.ignoreTlsErrors !== undefined) conn.ignoreTlsErrors = body.ignoreTlsErrors === true;
  conn.updatedAt = new Date().toISOString();

  connections[idx] = conn;
  await writeFtpConnections(connections);

  auditLog({
    actor: user.username,
    action: "ftp-connection.update",
    targetType: "ftp-connection",
    targetId: conn.id,
    details: { name: conn.name },
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json(sanitizeFtpConnection(conn));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const connections = await getFtpConnections();
  const filtered = connections.filter((c) => c.id !== id);
  if (filtered.length === connections.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeFtpConnections(filtered);

  auditLog({
    actor: user.username,
    action: "ftp-connection.delete",
    targetType: "ftp-connection",
    targetId: id,
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json({ success: true });
}
