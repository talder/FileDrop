import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getSftpConnections, writeSftpConnections, sanitizeConnection } from "@/lib/sftp-connections";
import { encryptPassword } from "@/lib/destinations";
import { auditLog, getRequestIp } from "@/lib/audit";
import type { SftpConnection } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await getSftpConnections();
  return NextResponse.json(connections.map(sanitizeConnection));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, host, port, username, password, privateKey } = body;

    if (!name || !host || !username) {
      return NextResponse.json({ error: "Name, host, and username are required" }, { status: 400 });
    }

    const connections = await getSftpConnections();
    if (connections.some((c) => c.name.toLowerCase() === String(name).toLowerCase())) {
      return NextResponse.json({ error: "A server with this name already exists" }, { status: 409 });
    }

    const conn: SftpConnection = {
      id: randomUUID(),
      name,
      host,
      port: Number(port) || 22,
      username,
      passwordEncrypted: password ? encryptPassword(password) : undefined,
      privateKey: privateKey || undefined,
      createdAt: new Date().toISOString(),
    };

    connections.push(conn);
    await writeSftpConnections(connections);

    auditLog({
      actor: user.username,
      action: "sftp-connection.create",
      targetType: "sftp-connection",
      targetId: conn.id,
      details: { name: conn.name, host: conn.host },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(sanitizeConnection(conn));
  } catch (error) {
    console.error("Create SFTP connection error:", error);
    return NextResponse.json({ error: "Failed to create SFTP server" }, { status: 500 });
  }
}
