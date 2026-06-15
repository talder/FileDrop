import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DATA_ROOT, DataPathError, listDirectory } from "@/lib/data-folders";

/** List the contents (folders + files with size/mtime) of a directory in /DATA. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get("path") || DATA_ROOT;
    return NextResponse.json(await listDirectory(requestedPath));
  } catch (error) {
    if (error instanceof DataPathError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }
    if (err.code === "EACCES" || err.code === "EPERM") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to list directory" }, { status: 500 });
  }
}
