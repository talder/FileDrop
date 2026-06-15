import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: imports only `path` + `crypto` (both core), so it loads safely
// under `node --test` type-stripping without pulling in native deps.
import { applyFilenameMask } from "../src/lib/file-naming.ts";

describe("applyFilenameMask", () => {
  it("renders the importer timestamp mask (yyyyMMdd-HHmmss) + original name", () => {
    // 2026-06-15 08:08:54 local time
    const d = new Date(2026, 5, 15, 8, 8, 54);
    const out = applyFilenameMask(
      { mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" },
      "ARTICLE.csv",
      d,
    );
    assert.equal(out, "20260615-080854_ARTICLE.csv");
  });

  it("keeps the original filename in original mode", () => {
    assert.equal(
      applyFilenameMask({ mode: "original", mask: "" }, "ARTICLE.csv"),
      "ARTICLE.csv",
    );
  });

  it("sanitizes unsafe path characters in original mode", () => {
    assert.equal(
      applyFilenameMask({ mode: "original", mask: "" }, "a/b:c.csv"),
      "a_b_c.csv",
    );
  });

  it("supports the European date preset", () => {
    const d = new Date(2026, 5, 15, 8, 8, 54);
    assert.equal(
      applyFilenameMask({ mode: "mask", mask: "{DD}{MM}{YYYY}_{ORIGINAL}{EXT}" }, "doc.xml", d),
      "15062026_doc.xml",
    );
  });
});
