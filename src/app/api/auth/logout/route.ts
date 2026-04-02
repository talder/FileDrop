import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, getSessionCookieName } from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(getSessionCookieName());
    if (sessionCookie?.value) {
      await deleteSession(sessionCookie.value);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(getSessionCookieName(), "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
