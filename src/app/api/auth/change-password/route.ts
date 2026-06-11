import { NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, verifyPassword, hashPassword } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const currentPasswordOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentPasswordOk) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const users = await getUsers();
    const idx = users.findIndex((u) => u.username === user.username);
    if (idx === -1) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    users[idx].passwordHash = await hashPassword(newPassword);
    await writeUsers(users);

    auditLog({
      actor: user.username,
      action: "auth.password.change",
      targetType: "user",
      targetId: user.username,
      sourceIp: getRequestIp(request),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
