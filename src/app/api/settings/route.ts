import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";

const SETTINGS_FILE = "settings.json";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await readJsonConfig<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const current = await readJsonConfig<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);

  const updated: AppSettings = {
    appName: body.appName ?? current.appName,
    maxFileSize: body.maxFileSize ?? current.maxFileSize,
    fileRetentionDays: body.fileRetentionDays ?? current.fileRetentionDays,
    rateLimitPerKey: body.rateLimitPerKey ?? current.rateLimitPerKey,
    allowedOrigins: body.allowedOrigins ?? current.allowedOrigins,
    sftpServerEnabled: body.sftpServerEnabled ?? current.sftpServerEnabled,
    sftpServerPort: body.sftpServerPort ?? current.sftpServerPort,
  };

  await writeJsonConfig(SETTINGS_FILE, updated);
  return NextResponse.json(updated);
}
