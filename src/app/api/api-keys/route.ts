import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { getAllApiKeys, generateApiKey } from "@/lib/api-keys";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = getAllApiKeys();
  // Strip the hash from the response
  const safe = keys.map(({ keyHash, ...rest }) => rest);
  return NextResponse.json(safe);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { partyName, allowedEndpoints, expiresAt } = await request.json();

    if (!partyName) {
      return NextResponse.json({ error: "Party name is required" }, { status: 400 });
    }

    if (!Array.isArray(allowedEndpoints) || allowedEndpoints.length === 0) {
      return NextResponse.json({ error: "At least one endpoint must be selected" }, { status: 400 });
    }

    const { plaintext, apiKey } = generateApiKey(
      partyName,
      allowedEndpoints,
      expiresAt || null
    );

    const { keyHash, ...safeKey } = apiKey;

    auditLog({ actor: user.username, action: "apikey.generate", targetType: "apikey", targetId: safeKey.id, details: { partyName, allowedEndpoints }, sourceIp: getRequestIp(request) });

    return NextResponse.json({
      ...safeKey,
      // The plaintext key is returned ONLY on creation
      key: plaintext,
    });
  } catch (error) {
    console.error("Generate API key error:", error);
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }
}
