import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSftpConnections, writeSftpConnections, sanitizeConnection } from "@/lib/sftp-connections";
import { getTransfers } from "@/lib/transfers";
import { encryptPassword } from "@/lib/destinations";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const connections = await getSftpConnections();
  const conn = connections.find((c) => c.id === id);
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(sanitizeConnection(conn));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const connections = await getSftpConnections();
  const idx = connections.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conn = connections[idx];
  if (body.name !== undefined) {
    if (connections.some((c) => c.id !== id && c.name.toLowerCase() === String(body.name).toLowerCase())) {
      return NextResponse.json({ error: "A server with this name already exists" }, { status: 409 });
    }
    conn.name = body.name;
  }
  if (body.host !== undefined) conn.host = body.host;
  if (body.port !== undefined) conn.port = Number(body.port) || 22;
  if (body.username !== undefined) conn.username = body.username;
  if (body.password) conn.passwordEncrypted = encryptPassword(body.password);
  if (body.privateKey !== undefined) conn.privateKey = body.privateKey || undefined;
  conn.updatedAt = new Date().toISOString();

  connections[idx] = conn;
  await writeSftpConnections(connections);

  auditLog({
    actor: user.username,
    action: "sftp-connection.update",
    targetType: "sftp-connection",
    targetId: conn.id,
    details: { name: conn.name },
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json(sanitizeConnection(conn));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Block deletion when a transfer still references this server.
  const transfers = await getTransfers();
  const used = transfers.filter((t) => t.connectionId === id);
  if (used.length > 0) {
    return NextResponse.json(
      { error: `In use by ${used.length} transfer(s): ${used.map((t) => t.name).join(", ")}` },
      { status: 409 },
    );
  }

  const connections = await getSftpConnections();
  const filtered = connections.filter((c) => c.id !== id);
  if (filtered.length === connections.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeSftpConnections(filtered);

  auditLog({
    actor: user.username,
    action: "sftp-connection.delete",
    targetType: "sftp-connection",
    targetId: id,
    sourceIp: getRequestIp(request),
  });

  return NextResponse.json({ success: true });
}
