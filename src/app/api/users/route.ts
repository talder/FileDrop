import { NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, hashPassword, sanitizeUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getUsers();
  return NextResponse.json(users.map(sanitizeUser));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, password, fullName } = await request.json();
  if (!username || !password) return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const users = await getUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  users.push({
    username: username.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    isAdmin: false,
    fullName: fullName?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });

  await writeUsers(users);
  return NextResponse.json({ success: true });
}
