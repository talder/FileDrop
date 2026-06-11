import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import {
  getSoapConnections,
  writeSoapConnections,
  sanitizeSoapConnection,
} from "@/lib/soap-connections";
import { encryptPassword } from "@/lib/destinations";
import { auditLog, getRequestIp } from "@/lib/audit";
import type { SoapConnection } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await getSoapConnections();
  return NextResponse.json(connections.map(sanitizeSoapConnection));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, url, username, password, soapAction, envelopeMode, envelopeTemplate, extractBody, ignoreTlsErrors } = body;

    if (!name || !url || !username) {
      return NextResponse.json({ error: "Name, URL, and username are required" }, { status: 400 });
    }

    const connections = await getSoapConnections();
    if (connections.some((c) => c.name.toLowerCase() === String(name).toLowerCase())) {
      return NextResponse.json({ error: "A connection with this name already exists" }, { status: 409 });
    }

    const conn: SoapConnection = {
      id: randomUUID(),
      name,
      url,
      username,
      passwordEncrypted: password ? encryptPassword(password) : undefined,
      soapAction: typeof soapAction === "string" ? soapAction : "",
      envelopeMode: envelopeMode === "template" ? "template" : "raw",
      envelopeTemplate: typeof envelopeTemplate === "string" ? envelopeTemplate : undefined,
      extractBody: extractBody === true,
      ignoreTlsErrors: ignoreTlsErrors === true,
      createdAt: new Date().toISOString(),
    };

    connections.push(conn);
    await writeSoapConnections(connections);

    auditLog({
      actor: user.username,
      action: "soap-connection.create",
      targetType: "soap-connection",
      targetId: conn.id,
      details: { name: conn.name, url: conn.url },
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json(sanitizeSoapConnection(conn));
  } catch (error) {
    console.error("Create SOAP connection error:", error);
    return NextResponse.json({ error: "Failed to create SOAP connection" }, { status: 500 });
  }
}
