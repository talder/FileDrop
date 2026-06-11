import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

interface DocItResult {
  title: string;
  url: string;
  snippet?: string;
  tag?: string;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizePayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["results", "items", "data", "hits"]) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
    }
  }
  return [];
}

function toAbsoluteUrl(urlLike: string, apiBaseUrl: string): string | null {
  try {
    return new URL(urlLike).toString();
  } catch {
    const fallbackBase = process.env.DOCIT_WEB_BASE_URL?.trim() || apiBaseUrl;
    try {
      return new URL(urlLike, fallbackBase.endsWith("/") ? fallbackBase : `${fallbackBase}/`).toString();
    } catch {
      return null;
    }
  }
}

function mapResults(payload: unknown, apiBaseUrl: string, limit: number): DocItResult[] {
  const rows = normalizePayload(payload);
  const out: DocItResult[] = [];

  for (const row of rows) {
    const rawUrl = firstString(row.url, row.href, row.link, row.path, row.permalink);
    if (!rawUrl) continue;
    const absoluteUrl = toAbsoluteUrl(rawUrl, apiBaseUrl);
    if (!absoluteUrl) continue;

    const tags = Array.isArray(row.tags) ? row.tags : [];
    const tagFromArray = tags.find((tag) => typeof tag === "string");
    const tag = firstString(row.tag, row.slug, tagFromArray);
    const title = firstString(row.title, row.name, row.heading, tag, rawUrl) || "Doc-it entry";
    const snippet = firstString(row.snippet, row.summary, row.description, row.excerpt);

    out.push({ title, url: absoluteUrl, snippet, tag });
    if (out.length >= limit) break;
  }

  return out;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiBaseUrl = process.env.DOCIT_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    return NextResponse.json({ configured: false, results: [] });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 6, 1), 20);

  if (!query) {
    return NextResponse.json({ configured: true, results: [] });
  }

  const searchPath = process.env.DOCIT_API_SEARCH_PATH?.trim() || "/search";
  let endpoint: URL;
  try {
    endpoint = new URL(searchPath, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
  } catch {
    return NextResponse.json(
      { configured: false, results: [], error: "Invalid Doc-it API base URL" },
      { status: 500 },
    );
  }

  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("limit", String(limit));

  const headers = new Headers({ Accept: "application/json" });
  const apiKey = process.env.DOCIT_API_KEY?.trim();
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("X-API-Key", apiKey);
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json({
        configured: true,
        results: [],
        error: `Doc-it API request failed (${response.status})`,
      });
    }

    const payload = await response.json().catch(() => null);
    const results = mapResults(payload, apiBaseUrl, limit);
    return NextResponse.json({ configured: true, results });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      results: [],
      error: (error as Error).message || "Failed to query Doc-it API",
    });
  }
}
