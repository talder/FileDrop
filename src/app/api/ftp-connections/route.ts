import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import {
  getFtpConnections,
  writeFtpConnections,
  sanitizeFtpConnection,
} from "@/lib/ftp-connections";
import { encryptPassword } from "@/lib/destinations";
import { auditLog, getRequestIp } from "@/lib/audit";
import type { FtpConnection } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await getFtpConnections();
  return NextResponse.json(connections.map(sanitizeFtpConnection));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, host, port, username, password, secure, ignoreTlsErrors } = body;

    if (!name || !host || !username) {
      return NextResponse.json({ error: "Name, host, and username are required" }, { status: 400 });
    }

    const connections = await getFtpConnections();
    if (connections.some((c) => c.name.toLowerCase() === String(name).toLowerCase())) {
      return NextResponse.json({ error: "A connection with this name already exists" }, { status: 409 });
    }

    const conn: FtpConnection = {
      id: randomUUID(),
      name,
      host,
      port: Number(port) || 21,
      username,
      passwordEncrypted: password ? encryptPassword(password) : undefined,
      secure: secure === true,
      ignoreTlsErrors: ignoreTlsErrors === true,
      createdAt: new Date().toISOString(),
    };

    connections.push(conn);
    await writeFtpConnections(connections);

    auditLog({
      actor: user.username,
      action: "ftp-connection.create",
      targetType: "ftp-connection",
      targetId: conn.id,
      details: { name: conn.name, host: conn.host },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(sanitizeFtpConnection(conn));
  } catch (error) {
    console.error("Create FTP connection error:", error);
    return NextResponse.json({ error: "Failed to create FTP connection" }, { status: 500 });
  }
}
