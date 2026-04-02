import { NextResponse } from "next/server";
import { getCurrentSanitizedUser, hasUsers } from "@/lib/auth";

export async function GET() {
  try {
    const hasExistingUsers = await hasUsers();
    if (!hasExistingUsers) {
      return NextResponse.json({ needsSetup: true });
    }

    const user = await getCurrentSanitizedUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ user: null });
  }
}
