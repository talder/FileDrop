import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { readJsonConfig } from "@/lib/config";
import { validateApiKey } from "@/lib/api-keys";
import { getDestinationById } from "@/lib/destinations";
import type { DropEndpoint } from "@/lib/types";

const ENDPOINTS_FILE = "endpoints.json";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; filename: string }> }) {
  const { slug, filename } = await params;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const apiKey = validateApiKey(authHeader.substring(7));
  if (!apiKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  if (!apiKey.allowedEndpoints.includes(slug) && !apiKey.allowedEndpoints.includes("*")) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const endpoints = await readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []);
  const endpoint = endpoints.find((e) => e.slug === slug);
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  if (!endpoint.allowRetrieval) return NextResponse.json({ error: "File retrieval not enabled" }, { status: 403 });

  const dest = await getDestinationById(endpoint.destinationId);
  if (!dest) return NextResponse.json({ error: "Destination not configured" }, { status: 500 });

  let destPath = dest.localPath;
  if (endpoint.subdirectory) destPath = path.join(destPath, endpoint.subdirectory);

  // Prevent directory traversal
  const safeName = path.basename(filename);
  const filePath = path.join(destPath, safeName);
  if (!filePath.startsWith(destPath)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return NextResponse.json({ error: "Not a file" }, { status: 404 });

    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(fileStat.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
