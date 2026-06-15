import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: imports only `path` + `fs/promises` (both core), so it loads
// safely under `node --test` type-stripping without pulling in native deps.
import { isValidFolderName } from "../src/lib/data-folders.ts";

describe("isValidFolderName", () => {
  it("accepts ordinary folder names", () => {
    for (const name of ["Bestellingen", "SAP", "prod-2026", "a", "with space", "café"]) {
      assert.equal(isValidFolderName(name), true, `expected "${name}" to be valid`);
    }
    // 255 chars is the maximum allowed length.
    assert.equal(isValidFolderName("a".repeat(255)), true);
  });

  it("rejects empty, dot, and dot-dot names", () => {
    assert.equal(isValidFolderName(""), false);
    assert.equal(isValidFolderName("."), false);
    assert.equal(isValidFolderName(".."), false);
  });

  it("rejects names containing path separators", () => {
    assert.equal(isValidFolderName("a/b"), false);
    assert.equal(isValidFolderName("a\\b"), false);
  });

  it("rejects names containing control characters", () => {
    assert.equal(isValidFolderName("a\u0000b"), false);
    assert.equal(isValidFolderName("tab\tname"), false);
  });

  it("rejects names longer than 255 characters", () => {
    assert.equal(isValidFolderName("a".repeat(256)), false);
  });
});
