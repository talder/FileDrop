import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: imports only `path`, `crypto`, type-only imports, and the pure
// `transfer-util` helper, so it loads safely under `node --test` type-stripping.
import {
  normalizeExtension,
  sanitizeTargetSubdirectory,
  fileMatchesFilter,
  resolveFilterSubdirectory,
  normalizeFilters,
} from "../src/lib/endpoint-filters.ts";
import type { DropEndpoint, EndpointFilter } from "../src/lib/types.ts";

function filter(partial: Partial<EndpointFilter>): EndpointFilter {
  return {
    id: partial.id ?? "f1",
    name: partial.name ?? "",
    wildcards: partial.wildcards ?? [],
    extensions: partial.extensions ?? [],
    targetSubdirectory: partial.targetSubdirectory ?? "out",
  };
}

function endpoint(partial: Partial<DropEndpoint>): DropEndpoint {
  return { subdirectory: partial.subdirectory, filters: partial.filters } as DropEndpoint;
}

describe("normalizeExtension", () => {
  it("lowercases and adds a leading dot", () => {
    assert.equal(normalizeExtension("PDF"), ".pdf");
    assert.equal(normalizeExtension(".XML"), ".xml");
    assert.equal(normalizeExtension("  .Csv  "), ".csv");
  });

  it("returns empty for blank or dot-only input", () => {
    assert.equal(normalizeExtension(""), "");
    assert.equal(normalizeExtension("   "), "");
    assert.equal(normalizeExtension("."), "");
  });
});

describe("sanitizeTargetSubdirectory", () => {
  it("keeps a clean nested relative path", () => {
    assert.equal(sanitizeTargetSubdirectory("invoices/2026"), "invoices/2026");
  });

  it("normalizes backslashes and drops '.' segments", () => {
    assert.equal(sanitizeTargetSubdirectory("a\\b\\.\\c"), "a/b/c");
  });

  it("rejects absolute paths and traversal", () => {
    assert.equal(sanitizeTargetSubdirectory("/abs/path"), "");
    assert.equal(sanitizeTargetSubdirectory("../escape"), "");
    assert.equal(sanitizeTargetSubdirectory("a/../../b"), "");
  });

  it("returns empty for blank input", () => {
    assert.equal(sanitizeTargetSubdirectory("   "), "");
  });
});

describe("fileMatchesFilter", () => {
  it("matches on extension only", () => {
    const f = filter({ extensions: [".pdf"] });
    assert.ok(fileMatchesFilter("report.pdf", f));
    assert.ok(!fileMatchesFilter("report.xml", f));
  });

  it("matches on wildcard only", () => {
    const f = filter({ wildcards: ["invoice_*"] });
    assert.ok(fileMatchesFilter("invoice_2026.pdf", f));
    assert.ok(!fileMatchesFilter("statement_2026.pdf", f));
  });

  it("requires BOTH extension and wildcard when both are specified (AND)", () => {
    const f = filter({ wildcards: ["invoice_*"], extensions: [".pdf"] });
    assert.ok(fileMatchesFilter("invoice_1.pdf", f));
    assert.ok(!fileMatchesFilter("invoice_1.xml", f)); // wrong extension
    assert.ok(!fileMatchesFilter("credit_1.pdf", f)); // wrong wildcard
  });

  it("matches anything when no criteria are specified (catch-all)", () => {
    const f = filter({ wildcards: [], extensions: [] });
    assert.ok(fileMatchesFilter("anything.bin", f));
  });

  it("is case-insensitive for wildcards and extensions", () => {
    const f = filter({ wildcards: ["INVOICE_*"], extensions: [".PDF"] });
    assert.ok(fileMatchesFilter("Invoice_99.PDF", f));
    assert.ok(fileMatchesFilter("invoice_99.pdf", f));
  });
});

describe("resolveFilterSubdirectory", () => {
  it("returns the first matching filter's target (first match wins)", () => {
    const ep = endpoint({
      subdirectory: "default",
      filters: [
        filter({ id: "a", wildcards: ["*.pdf"], targetSubdirectory: "pdf" }),
        filter({ id: "b", wildcards: ["invoice_*"], targetSubdirectory: "invoices" }),
      ],
    });
    // matches the first filter (*.pdf) even though it also matches the second
    assert.equal(resolveFilterSubdirectory(ep, "invoice_1.pdf"), "pdf");
  });

  it("falls back to the endpoint default subdirectory when nothing matches", () => {
    const ep = endpoint({
      subdirectory: "default",
      filters: [filter({ extensions: [".pdf"], targetSubdirectory: "pdf" })],
    });
    assert.equal(resolveFilterSubdirectory(ep, "data.csv"), "default");
  });

  it("returns undefined when there are no filters and no default", () => {
    assert.equal(resolveFilterSubdirectory(endpoint({}), "a.pdf"), undefined);
  });
});

describe("normalizeFilters", () => {
  it("normalizes extensions (dot, lowercase, dedupe) and trims the name", () => {
    const [f] = normalizeFilters([
      { name: "  Invoices  ", wildcards: ["inv_*"], extensions: ["PDF", ".pdf", "xml"], targetSubdirectory: "invoices" },
    ]);
    assert.equal(f.name, "Invoices");
    assert.deepEqual(f.extensions, [".pdf", ".xml"]);
    assert.deepEqual(f.wildcards, ["inv_*"]);
    assert.equal(f.targetSubdirectory, "invoices");
    assert.ok(typeof f.id === "string" && f.id.length > 0);
  });

  it("drops filters whose target is unsafe (absolute / traversal) or missing", () => {
    const result = normalizeFilters([
      { extensions: [".pdf"], targetSubdirectory: "/etc" },
      { extensions: [".pdf"], targetSubdirectory: "../escape" },
      { extensions: [".pdf"], targetSubdirectory: "" },
      { extensions: [".pdf"], targetSubdirectory: "ok" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].targetSubdirectory, "ok");
  });

  it("drops blank wildcard entries", () => {
    const [f] = normalizeFilters([
      { wildcards: ["a*", "", "  "], targetSubdirectory: "out" },
    ]);
    assert.deepEqual(f.wildcards, ["a*"]);
  });

  it("returns an empty array for non-array input", () => {
    assert.deepEqual(normalizeFilters(undefined), []);
    assert.deepEqual(normalizeFilters(null), []);
    assert.deepEqual(normalizeFilters("nope"), []);
  });
});
