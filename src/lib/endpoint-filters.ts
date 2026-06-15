import { extname } from "path";
import { randomUUID } from "crypto";
import { globToRegExp } from "./transfer-util.ts";
import type { DropEndpoint, EndpointFilter } from "./types";

/** Normalize one extension to lowercase with a leading dot. Returns "" when empty/invalid. */
export function normalizeExtension(ext: string): string {
  const e = String(ext).trim().toLowerCase();
  if (!e || e === ".") return "";
  return e.startsWith(".") ? e : `.${e}`;
}

/**
 * Sanitize a routing target into a safe relative subdirectory: strips a leading
 * slash check (absolute paths are rejected), normalizes separators, drops `.`
 * segments, and rejects any `..` segment so a filter can never escape the
 * destination root. Returns "" when the input is empty or unsafe.
 */
export function sanitizeTargetSubdirectory(input: string): string {
  if (typeof input !== "string") return "";
  const normalized = input.trim().replace(/\\/g, "/");
  if (!normalized) return "";
  if (normalized.startsWith("/")) return ""; // reject absolute paths
  const safe: string[] = [];
  for (const segment of normalized.split("/")) {
    const seg = segment.trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return ""; // reject traversal
    safe.push(seg);
  }
  return safe.join("/");
}

/**
 * True when `filename` satisfies every *specified* criterion of `filter`:
 *   - if `extensions` is non-empty, the file extension must be in it;
 *   - if `wildcards` is non-empty, the filename must match at least one pattern.
 * An empty criterion is ignored, so a filter with no criteria matches anything.
 * Wildcards are matched case-insensitively.
 */
export function fileMatchesFilter(filename: string, filter: EndpointFilter): boolean {
  const extensions = (filter.extensions ?? []).map(normalizeExtension).filter(Boolean);
  if (extensions.length > 0) {
    const fileExt = extname(filename).toLowerCase();
    if (!extensions.includes(fileExt)) return false;
  }

  const wildcards = (filter.wildcards ?? []).map((w) => String(w).trim()).filter(Boolean);
  if (wildcards.length > 0) {
    const matched = wildcards.some((pattern) => globToRegExp(pattern, "i").test(filename));
    if (!matched) return false;
  }

  return true;
}

/**
 * Resolve which subdirectory (relative to the destination root) a file should
 * be written to: the first matching filter's `targetSubdirectory`, falling back
 * to the endpoint's default `subdirectory` when nothing matches.
 */
export function resolveFilterSubdirectory(endpoint: DropEndpoint, filename: string): string | undefined {
  for (const filter of endpoint.filters ?? []) {
    if (fileMatchesFilter(filename, filter)) {
      return filter.targetSubdirectory || endpoint.subdirectory;
    }
  }
  return endpoint.subdirectory;
}

/**
 * Validate and clean filters arriving from the API. Trims names, normalizes
 * extensions, drops blank wildcard entries, and sanitizes each target folder.
 * Filters without a usable target subdirectory are dropped (a filter must route
 * somewhere to be meaningful). Missing ids are generated.
 */
export function normalizeFilters(input: unknown): EndpointFilter[] {
  if (!Array.isArray(input)) return [];
  const filters: EndpointFilter[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<EndpointFilter>;

    const targetSubdirectory = sanitizeTargetSubdirectory(
      typeof r.targetSubdirectory === "string" ? r.targetSubdirectory : "",
    );
    if (!targetSubdirectory) continue;

    const wildcards = Array.isArray(r.wildcards)
      ? r.wildcards.map((w) => String(w).trim()).filter(Boolean)
      : [];
    const extensions = Array.isArray(r.extensions)
      ? Array.from(new Set(r.extensions.map((e) => normalizeExtension(String(e))).filter(Boolean)))
      : [];

    filters.push({
      id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
      name: typeof r.name === "string" ? r.name.trim() : "",
      wildcards,
      extensions,
      targetSubdirectory,
    });
  }
  return filters;
}
