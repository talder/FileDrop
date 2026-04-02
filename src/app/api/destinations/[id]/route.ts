import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDestinations, writeDestinations, getMountStatus, encryptPassword } from "@/lib/destinations";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinations = await getDestinations();
  const dest = destinations.find((d) => d.id === id);
  if (!dest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...dest, smbPasswordEncrypted: undefined, mountStatus: getMountStatus(dest) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const destinations = await getDestinations();
  const idx = destinations.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dest = destinations[idx];
  if (body.name !== undefined) dest.name = body.name;
  if (body.type !== undefined) dest.type = body.type;
  if (body.localPath !== undefined) dest.localPath = body.localPath;
  if (body.remoteHost !== undefined) dest.remoteHost = body.remoteHost;
  if (body.remotePath !== undefined) dest.remotePath = body.remotePath;
  if (body.smbDomain !== undefined) dest.smbDomain = body.smbDomain;
  if (body.smbUsername !== undefined) dest.smbUsername = body.smbUsername;
  if (body.smbPassword) dest.smbPasswordEncrypted = encryptPassword(body.smbPassword);
  if (body.mountOptions !== undefined) dest.mountOptions = body.mountOptions;
  dest.updatedAt = new Date().toISOString();

  destinations[idx] = dest;
  await writeDestinations(destinations);

  return NextResponse.json({ ...dest, smbPasswordEncrypted: undefined, mountStatus: getMountStatus(dest) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinations = await getDestinations();
  const filtered = destinations.filter((d) => d.id !== id);
  if (filtered.length === destinations.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeDestinations(filtered);
  return NextResponse.json({ success: true });
}
