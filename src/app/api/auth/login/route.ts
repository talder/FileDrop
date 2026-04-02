import { NextRequest, NextResponse } from "next/server";
import {
  getUserByUsername, getUsers, writeUsers,
  verifyPassword, createSession,
  getSessionCookieName, useSecureCookies,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/auth";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { auditLog, getRequestIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const blocked = checkAuthRateLimit(request);
  if (blocked) return blocked;

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (user.isLocked) {
      return NextResponse.json(
        { error: "Account is locked. Please contact an administrator." },
        { status: 403 }
      );
    }

    const match = await verifyPassword(password, user.passwordHash);

    if (!match) {
      const users = await getUsers();
      const idx = users.findIndex((u) => u.username === user.username);
      if (idx !== -1) {
        const attempts = (users[idx].failedLoginAttempts ?? 0) + 1;
        users[idx].failedLoginAttempts = attempts;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          users[idx].isLocked = true;
          users[idx].lockedAt = new Date().toISOString();
          await writeUsers(users);
          return NextResponse.json(
            { error: "Account locked after too many failed attempts. Please contact an administrator." },
            { status: 403 }
          );
        }
        await writeUsers(users);
      }
      const remaining = MAX_FAILED_ATTEMPTS - ((user.failedLoginAttempts ?? 0) + 1);
      return NextResponse.json(
        { error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` },
        { status: 401 }
      );
    }

    // Reset failure counter
    const users = await getUsers();
    const idx = users.findIndex((u) => u.username === user.username);
    if (idx !== -1 && users[idx].failedLoginAttempts) {
      users[idx].failedLoginAttempts = 0;
      users[idx].lastLogin = new Date().toISOString();
      await writeUsers(users);
    } else if (idx !== -1) {
      users[idx].lastLogin = new Date().toISOString();
      await writeUsers(users);
    }

    const sessionId = await createSession(user.username);
    auditLog({ actor: user.username, action: "auth.login", sourceIp: getRequestIp(request) });
    const response = NextResponse.json({ success: true, username: user.username });
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true,
      secure: useSecureCookies(request),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
