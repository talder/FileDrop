import { NextResponse } from "next/server";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { readJsonConfig } from "@/lib/config";
import { DATA_ROOT, isWithinDataRoot, sanitizeRelativeUploadPath } from "@/lib/data-folders";

const SETTINGS_FILE = "settings.json";
const DEFAULT_MAX_FILE_SIZE = 52428800; // 50MB

/**
 * Upload one or more files into a folder under /DATA. For folder uploads the
 * browser sends each file's `webkitRelativePath` as the multipart filename, so
 * the subtree is recreated beneath the target folder. Field name: `files`
 * (also accepts `file`). Body field `path` selects the target directory.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const targetRaw = formData.get("path");
  const baseDir = path.resolve(typeof targetRaw === "string" && targetRaw ? targetRaw : DATA_ROOT);
  if (!isWithinDataRoot(baseDir)) {
    return NextResponse.json({ error: "Path must be inside /DATA" }, { status: 400 });
  }

  try {
    const info = await stat(baseDir);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "Target path is not a directory" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
  }

  const files = formData.getAll("file").concat(formData.getAll("files"));
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided. Use field name 'file' or 'files'" }, { status: 400 });
  }

  const settings = await readJsonConfig<{ maxFileSize: number }>(SETTINGS_FILE, { maxFileSize: DEFAULT_MAX_FILE_SIZE });
  const maxSize = settings.maxFileSize > 0 ? settings.maxFileSize : DEFAULT_MAX_FILE_SIZE;

  let received = 0;
  const written: string[] = [];
  const errors: string[] = [];

  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    const rawName = entry.name || "unnamed";

    const segments = sanitizeRelativeUploadPath(rawName);
    if (!segments) {
      errors.push(`Invalid path: ${rawName}`);
      continue;
    }
    const relPath = segments.join("/");
    const destPath = path.join(baseDir, ...segments);
    if (!isWithinDataRoot(destPath)) {
      errors.push(`Invalid path: ${relPath}`);
      continue;
    }

    if (entry.size > maxSize) {
      errors.push(`File "${relPath}" exceeds maximum size of ${(maxSize / 1024 / 1024).toFixed(1)}MB`);
      continue;
    }

    try {
      await mkdir(path.dirname(destPath), { recursive: true });
      const buffer = Buffer.from(await entry.arrayBuffer());
      await writeFile(destPath, buffer);
      received++;
      written.push(relPath);
    } catch (err) {
      errors.push(`Failed to write "${relPath}": ${(err as Error).message}`);
    }
  }

  auditLog({
    actor: user.username,
    action: "data.file.upload",
    targetType: "folder",
    targetId: baseDir,
    details: { path: baseDir, received, failed: errors.length, files: written },
    sourceIp: getRequestIp(request),
  });

  const status = received === 0 && errors.length > 0 ? 400 : 200;
  return NextResponse.json({ received, failed: errors.length, ...(errors.length > 0 ? { errors } : {}) }, { status });
}
