import { NextResponse } from "next/server";
import { hasUsers, getUsers, writeUsers, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const existing = await hasUsers();
    if (existing) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    const { username, password, fullName } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const users = await getUsers();
    users.push({
      username: username.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      isAdmin: true,
      fullName: fullName?.trim() || undefined,
      createdAt: new Date().toISOString(),
    });

    await writeUsers(users);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
