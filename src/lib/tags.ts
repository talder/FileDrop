import { readJsonConfig, writeJsonConfig } from "./config";
import { getDestinations } from "./destinations";
import { getTransfers } from "./transfers";
import { getIntegrations } from "./integrations";
import { getSftpConnections } from "./sftp-connections";
import { getSoapConnections } from "./soap-connections";
import { getFtpConnections } from "./ftp-connections";
import { pruneTagMembers } from "./flow";
import type { DropEndpoint, Tag, TaggableKind } from "./types";

const TAGS_FILE = "tags.json";
const ENDPOINTS_FILE = "endpoints.json";

export async function getTags(): Promise<Tag[]> {
  return readJsonConfig<Tag[]>(TAGS_FILE, []);
}

export async function writeTags(tags: Tag[]): Promise<void> {
  await writeJsonConfig(TAGS_FILE, tags);
}

export async function getTagById(id: string): Promise<Tag | null> {
  const tags = await getTags();
  return tags.find((t) => t.id === id) || null;
}

/** Load the set of still-existing entity ids for every taggable kind. */
export async function getExistingTaggableIds(): Promise<Record<TaggableKind, Set<string>>> {
  const [endpoints, destinations, transfers, integrations, sftp, soap, ftp] = await Promise.all([
    readJsonConfig<DropEndpoint[]>(ENDPOINTS_FILE, []),
    getDestinations(),
    getTransfers(),
    getIntegrations(),
    getSftpConnections(),
    getSoapConnections(),
    getFtpConnections(),
  ]);
  return {
    endpoint: new Set(endpoints.map((e) => e.id)),
    destination: new Set(destinations.map((d) => d.id)),
    transfer: new Set(transfers.map((t) => t.id)),
    integration: new Set(integrations.map((i) => i.id)),
    sftp: new Set(sftp.map((c) => c.id)),
    soap: new Set(soap.map((c) => c.id)),
    ftp: new Set(ftp.map((c) => c.id)),
  };
}

/**
 * Read tags, dropping members whose referenced entity no longer exists.
 * Persists the cleaned list only when something actually changed.
 */
export async function getTagsPruned(): Promise<Tag[]> {
  const tags = await getTags();
  if (tags.length === 0) return tags;
  const existing = await getExistingTaggableIds();
  const { tags: pruned, changed } = pruneTagMembers(tags, existing);
  if (changed) await writeTags(pruned);
  return pruned;
}
