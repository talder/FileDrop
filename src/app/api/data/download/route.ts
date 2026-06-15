import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { auditLog, getRequestIp } from "@/lib/audit";
import { isWithinDataRoot, walkDirFiles, type WalkedFile } from "@/lib/data-folders";
import { createZipStream, type ZipSource } from "@/lib/zip";

// Store-only/non-ZIP64 keeps the archive < 4GB; guard well under that.
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

/** Strip characters that would break a quoted Content-Disposition filename. */
function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\u0000-\u001f]/g, "_");
}

/**
 * Download a path under /DATA. A file streams back as an attachment; a folder
 * streams as `<folder>.zip` (store-only) after a total-size guard.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");
  if (!requestedPath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const resolved = path.resolve(requestedPath);
  if (!isWithinDataRoot(resolved)) {
    return NextResponse.json({ error: "Path must be inside /DATA" }, { status: 400 });
  }

  let info;
  try {
    info = await stat(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sourceIp = getRequestIp(request);

  // ── Single file ─────────────────────────────────────────────────────────────
  if (info.isFile()) {
    const name = path.basename(resolved);
    const webStream = Readable.toWeb(createReadStream(resolved)) as unknown as ReadableStream<Uint8Array>;
    auditLog({
      actor: user.username,
      action: "data.download",
      targetType: "file",
      targetId: resolved,
      details: { path: resolved, size: info.size },
      sourceIp,
    });
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename(name)}"`,
        "Content-Length": String(info.size),
      },
    });
  }

  if (!info.isDirectory()) {
    return NextResponse.json({ error: "Unsupported path" }, { status: 400 });
  }

  // ── Folder → zip ──────────────────────────────────────────────────────────────
  // First pass: enumerate files + enforce the total-size guard before streaming.
  const folderName = path.basename(resolved);
  const parent = path.dirname(resolved);
  const walked: WalkedFile[] = [];
  let total = 0;
  for await (const file of walkDirFiles(resolved, parent)) {
    total += file.size;
    if (total > MAX_ZIP_BYTES) {
      return NextResponse.json(
        { error: "Folder is too large to download as a zip (limit ~2GB)" },
        { status: 413 },
      );
    }
    walked.push(file);
  }

  const sources: ZipSource[] = walked.map((file) => ({
    name: file.relPath.split(path.sep).join("/"),
    open: () => createReadStream(file.absPath),
  }));

  auditLog({
    actor: user.username,
    action: "data.download",
    targetType: "folder",
    targetId: resolved,
    details: { path: resolved, files: walked.length, bytes: total },
    sourceIp,
  });

  return new NextResponse(createZipStream(sources), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename(folderName)}.zip"`,
    },
  });
}
