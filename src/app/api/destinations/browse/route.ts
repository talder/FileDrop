import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { DATA_ROOT, isWithinDataRoot } from "@/lib/data-folders";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get("path") || DATA_ROOT;
    const resolvedPath = path.resolve(requestedPath);

    if (!isWithinDataRoot(resolvedPath)) {
      return NextResponse.json({ error: "Path must be inside /DATA" }, { status: 400 });
    }

    const info = await stat(resolvedPath);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const entries = await readdir(resolvedPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(resolvedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        name: entry.name,
        path: path.join(resolvedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    const parentPath = resolvedPath === DATA_ROOT ? null : path.dirname(resolvedPath);

    return NextResponse.json({
      root: DATA_ROOT,
      currentPath: resolvedPath,
      parentPath,
      directories,
      files,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }
    if (err.code === "EACCES" || err.code === "EPERM") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to browse directory" }, { status: 500 });
  }
}
