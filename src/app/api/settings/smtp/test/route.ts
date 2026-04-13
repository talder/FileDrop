import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to } = await request.json();
  if (!to) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  const ok = await sendMail(
    to,
    "[FileDrop] Test Email",
    `<div style="font-family: -apple-system, sans-serif; max-width: 400px;">
      <h2 style="color: #3b82f6;">FileDrop SMTP Test</h2>
      <p>If you received this, your SMTP settings are configured correctly.</p>
      <p style="font-size: 12px; color: #9ca3af;">Sent at ${new Date().toISOString()}</p>
    </div>`
  );

  if (ok) return NextResponse.json({ success: true });
  return NextResponse.json({ error: "Failed to send. Check SMTP settings and server logs." }, { status: 500 });
}
