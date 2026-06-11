import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";
import { invalidateVictoriaLogsCache } from "@/lib/victorialog";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";

const SETTINGS_FILE = "settings.json";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await readJsonConfig<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...settings });
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
    victoriaLogsEnabled: body.victoriaLogsEnabled ?? current.victoriaLogsEnabled ?? DEFAULT_SETTINGS.victoriaLogsEnabled,
    victoriaLogsHost: body.victoriaLogsHost ?? current.victoriaLogsHost ?? DEFAULT_SETTINGS.victoriaLogsHost,
    victoriaLogsPort: body.victoriaLogsPort ?? current.victoriaLogsPort ?? DEFAULT_SETTINGS.victoriaLogsPort,
    victoriaLogsProtocol: body.victoriaLogsProtocol ?? current.victoriaLogsProtocol ?? DEFAULT_SETTINGS.victoriaLogsProtocol,
  };

  await writeJsonConfig(SETTINGS_FILE, updated);
  invalidateVictoriaLogsCache();
  return NextResponse.json(updated);
}
