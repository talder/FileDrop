import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDestinations, writeDestinations, getMountStatus, encryptPassword } from "@/lib/destinations";
import type { Destination } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const destinations = await getDestinations();
  const result = destinations.map((d) => ({
    ...d,
    smbPasswordEncrypted: undefined, // Never expose encrypted password
    mountStatus: getMountStatus(d),
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, type, localPath, remoteHost, remotePath, smbDomain, smbUsername, smbPassword, mountOptions } = body;

    if (!name || !type || !localPath) {
      return NextResponse.json({ error: "Name, type, and local path are required" }, { status: 400 });
    }

    if ((type === "nfs" || type === "smb") && (!remoteHost || !remotePath)) {
      return NextResponse.json({ error: "Remote host and path are required for NFS/SMB" }, { status: 400 });
    }

    const destinations = await getDestinations();

    // Check for duplicate names
    if (destinations.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "A destination with this name already exists" }, { status: 409 });
    }

    const newDest: Destination = {
      id: randomUUID(),
      name,
      type,
      localPath,
      remoteHost: remoteHost || undefined,
      remotePath: remotePath || undefined,
      smbDomain: smbDomain || undefined,
      smbUsername: smbUsername || undefined,
      smbPasswordEncrypted: smbPassword ? encryptPassword(smbPassword) : undefined,
      mountOptions: mountOptions || undefined,
      createdAt: new Date().toISOString(),
    };

    destinations.push(newDest);
    await writeDestinations(destinations);

    return NextResponse.json({ ...newDest, smbPasswordEncrypted: undefined, mountStatus: getMountStatus(newDest) });
  } catch (error) {
    console.error("Create destination error:", error);
    return NextResponse.json({ error: "Failed to create destination" }, { status: 500 });
  }
}
