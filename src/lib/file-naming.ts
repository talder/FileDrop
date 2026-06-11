import path from "path";
import { randomUUID } from "crypto";
import type { FileNaming } from "./types";
export const FILE_NAMING_TOKENS = [
  "{ORIGINAL}",
  "{EXT}",
  "{YYYY}",
  "{YY}",
  "{MM}",
  "{DD}",
  "{HH}",
  "{mm}",
  "{ss}",
  "{UUID}",
  "{UUID8}",
  "{SEQ}",
] as const;

/**
 * Apply a filename mask to generate the stored filename.
 *
 * Tokens:
 *   {ORIGINAL}  - original filename without extension
 *   {EXT}       - extension with dot (e.g. ".pdf")
 *   {YYYY}      - 4-digit year
 *   {YY}        - 2-digit year
 *   {MM}        - 2-digit month
 *   {DD}        - 2-digit day
 *   {HH}        - 2-digit hour (24h)
 *   {mm}        - 2-digit minute
 *   {ss}        - 2-digit second
 *   {UUID}      - full UUID
 *   {UUID8}     - first 8 chars of UUID
 *   {SEQ}       - sequence number (passed in)
 */
export function applyFilenameMask(
  naming: FileNaming,
  originalFilename: string,
  now?: Date,
  seq?: number,
): string {
  // Mode: keep original — sanitize but preserve name
  if (naming.mode === "original") {
    return sanitizeFilename(originalFilename);
  }

  const d = now || new Date();
  const ext = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, ext);
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uuid = randomUUID();

  let result = naming.mask || "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}";

  result = result
    .replace(/\{ORIGINAL\}/g, safeBase)
    .replace(/\{EXT\}/g, ext)
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{YY\}/g, String(d.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, pad2(d.getMonth() + 1))
    .replace(/\{DD\}/g, pad2(d.getDate()))
    .replace(/\{HH\}/g, pad2(d.getHours()))
    .replace(/\{mm\}/g, pad2(d.getMinutes()))
    .replace(/\{ss\}/g, pad2(d.getSeconds()))
    .replace(/\{UUID\}/g, uuid)
    .replace(/\{UUID8\}/g, uuid.substring(0, 8))
    .replace(/\{SEQ\}/g, String(seq ?? 0));

  return sanitizeFilename(result);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function sanitizeFilename(name: string): string {
  // Remove dangerous characters but keep dots, dashes, underscores
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "unnamed";
}
