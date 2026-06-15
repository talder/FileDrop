import type {
  ApiKey,
  Destination,
  DropEndpoint,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FtpConnection,
  Integration,
  NodeKind,
  SftpConnection,
  SoapConnection,
  Tag,
  TagMember,
  TaggableKind,
  Transfer,
} from "./types";

/**
 * Pure, dependency-free graph + tag helpers.
 *
 * This module must NOT import anything that touches the database or Node
 * built-ins beyond types, so it can be unit-tested under `node --test`
 * type-stripping the same way `file-naming.ts` is.
 */

/** Default palette offered when creating tags. */
export const TAG_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const TAGGABLE_KINDS: TaggableKind[] = [
  "endpoint",
  "destination",
  "transfer",
  "integration",
  "sftp",
  "soap",
  "ftp",
];

const TAGGABLE_KIND_SET = new Set<string>(TAGGABLE_KINDS);

/** Validate a tag display name (1–60 trimmed characters). */
export function isValidTagName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 60;
}

/** True for `#rgb` / `#rrggbb` hex colors. */
export function isValidHexColor(color: unknown): boolean {
  return typeof color === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

/** Coerce arbitrary input into a clean, de-duplicated TagMember list. */
export function normalizeTagMembers(input: unknown): TagMember[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TagMember[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as { type?: unknown; id?: unknown };
    if (typeof m.type !== "string" || !TAGGABLE_KIND_SET.has(m.type)) continue;
    if (typeof m.id !== "string" || !m.id) continue;
    const key = `${m.type}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m.type as TaggableKind, id: m.id });
  }
  return out;
}

/**
 * Coerce arbitrary input into a safe Tag. `base` carries immutable fields
 * (id/createdAt) when updating an existing tag.
 */
export function normalizeTag(
  input: unknown,
  base: { id: string; createdAt: string },
): Tag {
  const cfg = (input && typeof input === "object" ? input : {}) as {
    name?: unknown;
    color?: unknown;
    description?: unknown;
    members?: unknown;
  };
  const name = typeof cfg.name === "string" ? cfg.name.trim() : "";
  const color = isValidHexColor(cfg.color) ? (cfg.color as string) : TAG_COLORS[0];
  const description =
    typeof cfg.description === "string" && cfg.description.trim()
      ? cfg.description.trim()
      : undefined;
  return {
    id: base.id,
    name,
    color,
    description,
    members: normalizeTagMembers(cfg.members),
    createdAt: base.createdAt,
  };
}

/**
 * Drop tag members whose referenced entity no longer exists.
 * `existing` maps each taggable kind to the set of still-present entity ids.
 * Returns the pruned list plus a `changed` flag so callers can persist.
 */
export function pruneTagMembers(
  tags: Tag[],
  existing: Partial<Record<TaggableKind, Set<string>>>,
): { tags: Tag[]; changed: boolean } {
  let changed = false;
  const pruned = tags.map((tag) => {
    const members = tag.members.filter((m) => existing[m.type]?.has(m.id));
    if (members.length !== tag.members.length) changed = true;
    return members.length === tag.members.length ? tag : { ...tag, members };
  });
  return { tags: pruned, changed };
}

/** Inputs required to assemble the full flow graph (already loaded from storage). */
export interface FlowGraphInput {
  endpoints: DropEndpoint[];
  destinations: Destination[];
  transfers: Transfer[];
  integrations: Integration[];
  sftpConnections: SftpConnection[];
  soapConnections: SoapConnection[];
  ftpConnections: FtpConnection[];
  apiKeys: ApiKey[];
}

/**
 * Build the topology graph: configured connectors as nodes and file-movement
 * relationships as directed edges. Never includes secrets.
 */
export function buildFlowGraph(input: FlowGraphInput, tags: Tag[]): FlowGraph {
  // Index tag membership by node id (`${kind}:${entityId}`).
  const tagIndex = new Map<string, string[]>();
  for (const tag of tags) {
    for (const member of tag.members) {
      const nodeId = `${member.type}:${member.id}`;
      const list = tagIndex.get(nodeId);
      if (list) list.push(tag.id);
      else tagIndex.set(nodeId, [tag.id]);
    }
  }

  const nodes: FlowNode[] = [];
  const nodeIds = new Set<string>();

  const addNode = (kind: NodeKind, entityId: string, label: string, sub?: string) => {
    const id = `${kind}:${entityId}`;
    if (nodeIds.has(id)) return id;
    nodeIds.add(id);
    nodes.push({
      id,
      kind,
      entityId,
      label,
      sub,
      tagIds: kind === "party" ? [] : tagIndex.get(id) ?? [],
    });
    return id;
  };

  // Nodes — order influences default row stacking within a column.
  for (const k of input.apiKeys) addNode("party", k.id, k.partyName, k.keyPrefix);

  const endpointIdBySlug = new Map<string, string>();
  for (const e of input.endpoints) {
    const id = addNode("endpoint", e.id, e.slug, e.type === "sftp-server" ? "SFTP in" : "API");
    endpointIdBySlug.set(e.slug, id);
  }

  for (const t of input.transfers) {
    addNode("transfer", t.id, t.name, t.direction === "pull" ? "Pull" : "Push");
  }
  for (const i of input.integrations) addNode("integration", i.id, i.name, "SOAP");
  for (const d of input.destinations) addNode("destination", d.id, d.name, d.type.toUpperCase());
  for (const c of input.sftpConnections) addNode("sftp", c.id, c.name, `${c.host}:${c.port}`);
  for (const c of input.soapConnections) addNode("soap", c.id, c.name, c.url);
  for (const c of input.ftpConnections) addNode("ftp", c.id, c.name, `${c.host}:${c.port}`);

  const edges: FlowEdge[] = [];
  const edgeIds = new Set<string>();
  const addEdge = (source: string, target: string, label?: string) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const id = `${source}__${target}__${label ?? ""}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target, label });
  };

  // API key party → endpoint (access grant).
  for (const k of input.apiKeys) {
    for (const slug of k.allowedEndpoints || []) {
      const endpointId = endpointIdBySlug.get(slug);
      if (endpointId) addEdge(`party:${k.id}`, endpointId, "key");
    }
  }

  // Endpoint → destination (uploaded-file writes).
  for (const e of input.endpoints) {
    addEdge(`endpoint:${e.id}`, `destination:${e.destinationId}`, "writes");
  }

  // Transfers connect an SFTP server and a destination, directed by mode.
  for (const t of input.transfers) {
    const tNode = `transfer:${t.id}`;
    const sftpNode = `sftp:${t.connectionId}`;
    const destNode = `destination:${t.destinationId}`;
    if (t.direction === "pull") {
      addEdge(sftpNode, tNode, "pull");
      addEdge(tNode, destNode, "pull");
    } else {
      addEdge(destNode, tNode, "push");
      addEdge(tNode, sftpNode, "push");
    }
  }

  // Integration: source destination → integration → SOAP, plus optional outputs.
  for (const i of input.integrations) {
    const iNode = `integration:${i.id}`;
    addEdge(`destination:${i.sourceDestinationId}`, iNode, "source");
    addEdge(iNode, `soap:${i.soapConnectionId}`, "SOAP");
    if (i.responseDestinationId) addEdge(iNode, `destination:${i.responseDestinationId}`, "response");
    if (i.ftpConnectionId) addEdge(iNode, `ftp:${i.ftpConnectionId}`, "FTP");
  }

  return { nodes, edges, tags };
}

// ── Deterministic layered layout ──────────────────────────────────────────────

const COLUMN_BY_KIND: Record<NodeKind, number> = {
  party: 0,
  endpoint: 1,
  transfer: 2,
  integration: 2,
  destination: 3,
  sftp: 4,
  soap: 4,
  ftp: 4,
};

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 104;

/**
 * Position nodes in left-to-right columns by kind (parties → endpoints →
 * transfers/integrations → destinations → remote targets), stacking each
 * column vertically. Deterministic so re-renders are stable.
 */
export function computeLayout(nodes: FlowNode[]): Map<string, { x: number; y: number }> {
  const rowByColumn = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const col = COLUMN_BY_KIND[node.kind];
    const row = rowByColumn.get(col) ?? 0;
    rowByColumn.set(col, row + 1);
    positions.set(node.id, { x: col * COLUMN_WIDTH, y: row * ROW_HEIGHT });
  }
  return positions;
}
