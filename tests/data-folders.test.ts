import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: imports only `path` + `fs/promises` (both core), so it loads
// safely under `node --test` type-stripping without pulling in native deps.
import { isValidFolderName, sanitizeRelativeUploadPath } from "../src/lib/data-folders.ts";

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

describe("sanitizeRelativeUploadPath", () => {
  it("splits nested relative paths into clean segments", () => {
    assert.deepEqual(sanitizeRelativeUploadPath("file.txt"), ["file.txt"]);
    assert.deepEqual(sanitizeRelativeUploadPath("a/b/c.txt"), ["a", "b", "c.txt"]);
    // Backslash separators (e.g. from Windows) are handled too.
    assert.deepEqual(sanitizeRelativeUploadPath("a\\b\\c.txt"), ["a", "b", "c.txt"]);
    // Repeated separators collapse rather than producing empty segments.
    assert.deepEqual(sanitizeRelativeUploadPath("a//b"), ["a", "b"]);
  });

  it("rejects empty or separator-only paths", () => {
    assert.equal(sanitizeRelativeUploadPath(""), null);
    assert.equal(sanitizeRelativeUploadPath("///"), null);
  });

  it("rejects absolute paths", () => {
    assert.equal(sanitizeRelativeUploadPath("/etc/passwd"), null);
    assert.equal(sanitizeRelativeUploadPath("\\windows\\system32"), null);
  });

  it("rejects traversal via dot-dot segments", () => {
    assert.equal(sanitizeRelativeUploadPath("../secret"), null);
    assert.equal(sanitizeRelativeUploadPath("a/../b"), null);
  });

  it("rejects control characters in any segment", () => {
    assert.equal(sanitizeRelativeUploadPath("a/\u0000/b"), null);
  });
});
