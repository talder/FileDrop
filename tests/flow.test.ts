import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: type-only imports of the domain types, no DB/native deps, so it
// loads safely under `node --test` type-stripping (same as file-naming.test.ts).
import {
  buildFlowGraph,
  pruneTagMembers,
  isValidTagName,
  isValidHexColor,
  normalizeTag,
  normalizeTagMembers,
  computeLayout,
  buildDisplayEdges,
  displayEdgeLabel,
  TAG_COLORS,
  type FlowGraphInput,
} from "../src/lib/flow.ts";
import type {
  ApiKey,
  Destination,
  DropEndpoint,
  FlowEdge,
  FlowGraph,
  FtpConnection,
  Integration,
  SftpConnection,
  SoapConnection,
  Tag,
  TaggableKind,
  Transfer,
} from "../src/lib/types.ts";

const NOW = "2026-06-15T00:00:00.000Z";

// ── Minimal typed fixture builders (fill required fields; allow overrides) ────

function apiKey(o: Partial<ApiKey> & Pick<ApiKey, "id">): ApiKey {
  return {
    partyName: "Party", keyHash: "h", keyPrefix: "fd_abc",
    allowedEndpoints: [], expiresAt: null, revokedAt: null, createdAt: NOW, ...o,
  } as ApiKey;
}
function endpoint(o: Partial<DropEndpoint> & Pick<DropEndpoint, "id" | "slug" | "destinationId">): DropEndpoint {
  return {
    description: "", type: "api", allowedExtensions: [], maxFileSize: 0, enabled: true,
    fileNaming: { mode: "original", mask: "" }, allowRetrieval: false, createdAt: NOW, ...o,
  } as DropEndpoint;
}
function destination(o: Partial<Destination> & Pick<Destination, "id">): Destination {
  return { name: "Dest", type: "local", localPath: "/DATA/x", createdAt: NOW, ...o } as Destination;
}
function sftp(o: Partial<SftpConnection> & Pick<SftpConnection, "id">): SftpConnection {
  return { name: "SFTP", host: "h", port: 22, username: "u", createdAt: NOW, ...o } as SftpConnection;
}
function soap(o: Partial<SoapConnection> & Pick<SoapConnection, "id">): SoapConnection {
  return {
    name: "SOAP", url: "https://x", username: "u", soapAction: "", envelopeMode: "raw",
    extractBody: false, ignoreTlsErrors: false, createdAt: NOW, ...o,
  } as SoapConnection;
}
function ftp(o: Partial<FtpConnection> & Pick<FtpConnection, "id">): FtpConnection {
  return {
    name: "FTP", host: "h", port: 21, username: "u", secure: false, ignoreTlsErrors: false, createdAt: NOW, ...o,
  } as FtpConnection;
}
function transfer(o: Partial<Transfer> & Pick<Transfer, "id" | "connectionId" | "destinationId" | "direction">): Transfer {
  return {
    name: "Transfer", description: "", enabled: true, remotePath: "/",
    selection: { mode: "all" }, fileNaming: { mode: "original", mask: "" },
    conflictPolicy: "skip", deleteSourceAfterTransfer: false,
    schedule: { enabled: false, every: 5, unit: "minutes" }, createdAt: NOW, ...o,
  } as Transfer;
}
function integration(o: Partial<Integration> & Pick<Integration, "id" | "sourceDestinationId" | "soapConnectionId">): Integration {
  return {
    name: "Integration", description: "", enabled: true,
    sourceSelection: { mode: "all" }, responseFileNaming: { mode: "original", mask: "" },
    deleteSourceAfterRun: false, schedule: { enabled: false, every: 5, unit: "minutes" }, createdAt: NOW, ...o,
  } as Integration;
}

function emptyInput(): FlowGraphInput {
  return {
    endpoints: [], destinations: [], transfers: [], integrations: [],
    sftpConnections: [], soapConnections: [], ftpConnections: [], apiKeys: [],
  };
}

function tag(o: Partial<Tag> & Pick<Tag, "id" | "members">): Tag {
  return { name: "Tag", color: "#3b82f6", createdAt: NOW, ...o } as Tag;
}

const hasEdge = (g: FlowGraph, source: string, target: string, label?: string) =>
  g.edges.some((e) => e.source === source && e.target === target && (label === undefined || e.label === label));

// ── buildFlowGraph: edges ─────────────────────────────────────────────────────

describe("buildFlowGraph edges", () => {
  it("connects API-key party → endpoint (key) and endpoint → destination (writes)", () => {
    const input = emptyInput();
    input.apiKeys = [apiKey({ id: "k1", allowedEndpoints: ["invoices"] })];
    input.endpoints = [endpoint({ id: "e1", slug: "invoices", destinationId: "d1" })];
    input.destinations = [destination({ id: "d1" })];

    const g = buildFlowGraph(input, []);
    assert.ok(hasEdge(g, "party:k1", "endpoint:e1", "key"));
    assert.ok(hasEdge(g, "endpoint:e1", "destination:d1", "writes"));
  });

  it("does not connect a party to an endpoint slug it is not allowed", () => {
    const input = emptyInput();
    input.apiKeys = [apiKey({ id: "k1", allowedEndpoints: ["other"] })];
    input.endpoints = [endpoint({ id: "e1", slug: "invoices", destinationId: "d1" })];
    input.destinations = [destination({ id: "d1" })];

    const g = buildFlowGraph(input, []);
    assert.equal(hasEdge(g, "party:k1", "endpoint:e1"), false);
  });

  it("orients a pull transfer sftp → transfer → destination", () => {
    const input = emptyInput();
    input.sftpConnections = [sftp({ id: "c1" })];
    input.destinations = [destination({ id: "d1" })];
    input.transfers = [transfer({ id: "t1", connectionId: "c1", destinationId: "d1", direction: "pull" })];

    const g = buildFlowGraph(input, []);
    assert.ok(hasEdge(g, "sftp:c1", "transfer:t1", "pull"));
    assert.ok(hasEdge(g, "transfer:t1", "destination:d1", "pull"));
    // No reverse push edges.
    assert.equal(hasEdge(g, "destination:d1", "transfer:t1"), false);
  });

  it("orients a push transfer destination → transfer → sftp", () => {
    const input = emptyInput();
    input.sftpConnections = [sftp({ id: "c1" })];
    input.destinations = [destination({ id: "d1" })];
    input.transfers = [transfer({ id: "t1", connectionId: "c1", destinationId: "d1", direction: "push" })];

    const g = buildFlowGraph(input, []);
    assert.ok(hasEdge(g, "destination:d1", "transfer:t1", "push"));
    assert.ok(hasEdge(g, "transfer:t1", "sftp:c1", "push"));
  });

  it("wires an integration source → integration → soap, plus response + ftp outputs", () => {
    const input = emptyInput();
    input.destinations = [destination({ id: "dsrc" }), destination({ id: "dresp" })];
    input.soapConnections = [soap({ id: "s1" })];
    input.ftpConnections = [ftp({ id: "f1" })];
    input.integrations = [integration({
      id: "i1", sourceDestinationId: "dsrc", soapConnectionId: "s1",
      responseDestinationId: "dresp", ftpConnectionId: "f1",
    })];

    const g = buildFlowGraph(input, []);
    assert.ok(hasEdge(g, "destination:dsrc", "integration:i1", "source"));
    assert.ok(hasEdge(g, "integration:i1", "soap:s1", "SOAP"));
    assert.ok(hasEdge(g, "integration:i1", "destination:dresp", "response"));
    assert.ok(hasEdge(g, "integration:i1", "ftp:f1", "FTP"));
  });

  it("omits optional integration outputs when not configured", () => {
    const input = emptyInput();
    input.destinations = [destination({ id: "dsrc" })];
    input.soapConnections = [soap({ id: "s1" })];
    input.integrations = [integration({ id: "i1", sourceDestinationId: "dsrc", soapConnectionId: "s1" })];

    const g = buildFlowGraph(input, []);
    assert.equal(g.edges.filter((e) => e.label === "response").length, 0);
    assert.equal(g.edges.filter((e) => e.label === "FTP").length, 0);
  });
});

// ── buildFlowGraph: tag annotation ────────────────────────────────────────────

describe("buildFlowGraph tag annotation", () => {
  it("annotates tagged nodes with their tag ids and never tags parties", () => {
    const input = emptyInput();
    input.apiKeys = [apiKey({ id: "k1", allowedEndpoints: ["invoices"] })];
    input.endpoints = [endpoint({ id: "e1", slug: "invoices", destinationId: "d1" })];
    input.destinations = [destination({ id: "d1" })];

    const tags: Tag[] = [tag({ id: "tag1", members: [{ type: "destination", id: "d1" }] })];
    const g = buildFlowGraph(input, tags);

    const dest = g.nodes.find((n) => n.id === "destination:d1");
    const party = g.nodes.find((n) => n.id === "party:k1");
    assert.deepEqual(dest?.tagIds, ["tag1"]);
    assert.deepEqual(party?.tagIds, []);
    // Tags are echoed back on the graph payload.
    assert.equal(g.tags.length, 1);
  });
});

// ── pruneTagMembers ───────────────────────────────────────────────────────────

describe("pruneTagMembers", () => {
  it("drops members whose entity no longer exists and flags the change", () => {
    const tags: Tag[] = [tag({
      id: "t1",
      members: [
        { type: "destination", id: "d1" },
        { type: "destination", id: "gone" },
        { type: "transfer", id: "tr1" },
      ],
    })];
    const existing: Partial<Record<TaggableKind, Set<string>>> = {
      destination: new Set(["d1"]),
      transfer: new Set(["tr1"]),
    };
    const { tags: pruned, changed } = pruneTagMembers(tags, existing);
    assert.equal(changed, true);
    assert.deepEqual(pruned[0].members, [
      { type: "destination", id: "d1" },
      { type: "transfer", id: "tr1" },
    ]);
  });

  it("leaves tags untouched when every member still exists", () => {
    const tags: Tag[] = [tag({ id: "t1", members: [{ type: "destination", id: "d1" }] })];
    const existing = { destination: new Set(["d1"]) };
    const { tags: pruned, changed } = pruneTagMembers(tags, existing);
    assert.equal(changed, false);
    assert.equal(pruned[0], tags[0]); // same reference when unchanged
  });
});

// ── Validators / normalizers ──────────────────────────────────────────────────

describe("isValidTagName", () => {
  it("accepts 1–60 trimmed characters", () => {
    assert.equal(isValidTagName("Payroll"), true);
    assert.equal(isValidTagName("  x  "), true);
    assert.equal(isValidTagName("a".repeat(60)), true);
  });
  it("rejects empty, whitespace-only, overlong, and non-strings", () => {
    assert.equal(isValidTagName(""), false);
    assert.equal(isValidTagName("   "), false);
    assert.equal(isValidTagName("a".repeat(61)), false);
    assert.equal(isValidTagName(42), false);
  });
});

describe("isValidHexColor", () => {
  it("accepts #rgb and #rrggbb", () => {
    assert.equal(isValidHexColor("#fff"), true);
    assert.equal(isValidHexColor("#3b82f6"), true);
  });
  it("rejects malformed colors", () => {
    assert.equal(isValidHexColor("3b82f6"), false);
    assert.equal(isValidHexColor("#zzz"), false);
    assert.equal(isValidHexColor(null), false);
  });
});

describe("normalizeTagMembers", () => {
  it("filters invalid entries and de-duplicates", () => {
    const out = normalizeTagMembers([
      { type: "destination", id: "d1" },
      { type: "destination", id: "d1" }, // dup
      { type: "party", id: "k1" }, // party not taggable
      { type: "bogus", id: "x" },
      { type: "transfer" }, // missing id
      "nope",
    ]);
    assert.deepEqual(out, [{ type: "destination", id: "d1" }]);
  });
});

describe("normalizeTag", () => {
  it("trims the name, defaults a bad color, and preserves base id/createdAt", () => {
    const t = normalizeTag(
      { name: "  Ops  ", color: "not-a-color", members: [{ type: "sftp", id: "c1" }] },
      { id: "t1", createdAt: NOW },
    );
    assert.equal(t.name, "Ops");
    assert.equal(t.color, TAG_COLORS[0]);
    assert.equal(t.id, "t1");
    assert.equal(t.createdAt, NOW);
    assert.deepEqual(t.members, [{ type: "sftp", id: "c1" }]);
  });
});

// ── computeLayout ─────────────────────────────────────────────────────────────

describe("computeLayout", () => {
  it("places different kinds in distinct columns and stacks same-kind nodes", () => {
    const input = emptyInput();
    input.apiKeys = [apiKey({ id: "k1", allowedEndpoints: ["a"] })];
    input.endpoints = [
      endpoint({ id: "e1", slug: "a", destinationId: "d1" }),
      endpoint({ id: "e2", slug: "b", destinationId: "d1" }),
    ];
    input.destinations = [destination({ id: "d1" })];

    const g = buildFlowGraph(input, []);
    const pos = computeLayout(g.nodes);
    const party = pos.get("party:k1")!;
    const e1 = pos.get("endpoint:e1")!;
    const e2 = pos.get("endpoint:e2")!;
    assert.equal(party.x, 0);
    assert.ok(e1.x > party.x); // endpoints sit in a later column
    assert.equal(e1.x, e2.x); // same kind shares a column
    assert.ok(e2.y > e1.y); // and stacks vertically
  });

  it("orders tiers connections < jobs < storage, grouping kinds per tier", () => {
    const input = emptyInput();
    input.apiKeys = [apiKey({ id: "k1", allowedEndpoints: ["a"] })];
    input.endpoints = [endpoint({ id: "e1", slug: "a", destinationId: "d1" })];
    input.destinations = [destination({ id: "d1" })];
    input.sftpConnections = [sftp({ id: "c1" })];
    input.transfers = [transfer({ id: "t1", connectionId: "c1", destinationId: "d1", direction: "pull" })];
    input.soapConnections = [soap({ id: "s1" })];
    input.integrations = [integration({ id: "i1", sourceDestinationId: "d1", soapConnectionId: "s1" })];

    const pos = computeLayout(buildFlowGraph(input, []).nodes);
    const x = (id: string) => pos.get(id)!.x;
    // Connections tier (left): parties leftmost; endpoints + remote servers share a column.
    assert.ok(x("party:k1") < x("endpoint:e1"));
    assert.equal(x("endpoint:e1"), x("sftp:c1"));
    assert.equal(x("sftp:c1"), x("soap:s1"));
    // Jobs tier (middle): transfers + integrations share a column, right of connections.
    assert.ok(x("transfer:t1") > x("endpoint:e1"));
    assert.equal(x("transfer:t1"), x("integration:i1"));
    // Storage tier (right): destinations are rightmost.
    assert.ok(x("destination:d1") > x("transfer:t1"));
  });
});

// ── buildDisplayEdges / displayEdgeLabel ──────────────────────────────────────

describe("displayEdgeLabel", () => {
  it("humanizes known labels and falls back to the raw value", () => {
    assert.equal(displayEdgeLabel("key"), "grants key");
    assert.equal(displayEdgeLabel("writes"), "writes to");
    assert.equal(displayEdgeLabel("SOAP"), "posts to SOAP");
    assert.equal(displayEdgeLabel("pull"), "pull"); // already human
    assert.equal(displayEdgeLabel("mystery"), "mystery"); // unknown passthrough
    assert.equal(displayEdgeLabel(undefined), "");
  });
});

describe("buildDisplayEdges", () => {
  it("keeps a one-way edge oriented along its real direction with a humanized label", () => {
    const edges: FlowEdge[] = [
      { id: "x", source: "endpoint:e1", target: "destination:d1", label: "writes" },
    ];
    const out = buildDisplayEdges(edges);
    assert.equal(out.length, 1);
    assert.equal(out[0].source, "endpoint:e1");
    assert.equal(out[0].target, "destination:d1");
    assert.equal(out[0].label, "writes to");
    assert.equal(out[0].bidirectional, false);
  });

  it("merges a reverse-duplicate pair into one bidirectional edge", () => {
    // Integration whose source and response destination are the same node.
    const edges: FlowEdge[] = [
      { id: "a", source: "destination:d1", target: "integration:i1", label: "source" },
      { id: "b", source: "integration:i1", target: "destination:d1", label: "response" },
    ];
    const out = buildDisplayEdges(edges);
    assert.equal(out.length, 1);
    assert.equal(out[0].bidirectional, true);
    assert.equal(out[0].source, "destination:d1");
    assert.equal(out[0].target, "integration:i1");
    assert.equal(out[0].label, "reads / response");
  });

  it("leaves distinct node pairs as separate edges, in input order", () => {
    const edges: FlowEdge[] = [
      { id: "1", source: "sftp:c1", target: "transfer:t1", label: "pull" },
      { id: "2", source: "transfer:t1", target: "destination:d1", label: "pull" },
    ];
    const out = buildDisplayEdges(edges);
    assert.equal(out.length, 2);
    assert.equal(out[0].source, "sftp:c1");
    assert.equal(out[0].target, "transfer:t1");
    assert.equal(out[1].source, "transfer:t1");
    assert.equal(out[1].target, "destination:d1");
    assert.ok(out.every((e) => e.bidirectional === false));
  });
});
