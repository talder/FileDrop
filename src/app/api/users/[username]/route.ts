import { NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await params;
  if (username === user.username) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const users = await getUsers();
  const filtered = users.filter((u) => u.username !== username);
  if (filtered.length === users.length) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await writeUsers(filtered);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await params;
  const body = await request.json();
  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (body.unlock === true) {
    users[idx].isLocked = false;
    users[idx].lockedAt = undefined;
    users[idx].failedLoginAttempts = 0;
    await writeUsers(users);
    return NextResponse.json({ success: true, message: "Account unlocked" });
  }
  if (typeof body.isAdmin === "boolean") {
    if (username === user.username && body.isAdmin === false) {
      return NextResponse.json({ error: "You cannot remove your own admin rights" }, { status: 400 });
    }

    if (users[idx].isAdmin && body.isAdmin === false) {
      const adminCount = users.filter((u) => u.isAdmin).length;
      if (adminCount <= 1) {
        return NextResponse.json({ error: "At least one admin user is required" }, { status: 400 });
      }
    }

    users[idx].isAdmin = body.isAdmin;
    await writeUsers(users);
    return NextResponse.json({
      success: true,
      message: body.isAdmin ? "Admin rights granted" : "Admin rights removed",
    });
  }

  if (body.password) {
    if (body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    users[idx].passwordHash = await hashPassword(body.password);
    await writeUsers(users);
    return NextResponse.json({ success: true, message: "Password reset" });
  }

  return NextResponse.json({ error: "No valid action" }, { status: 400 });
}
