import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: no DB/native deps, so it loads safely under `node --test`
// type-stripping. Import with the explicit .ts extension like the other tests.
import {
  normalizeWatch,
  isInternalChange,
  DEFAULT_WATCH_DEBOUNCE_MS,
  MIN_WATCH_DEBOUNCE_MS,
  MAX_WATCH_DEBOUNCE_MS,
} from "../src/lib/transfer-util.ts";

describe("normalizeWatch", () => {
  it("defaults to disabled with default debounce when input is missing", () => {
    for (const input of [undefined, null, {}, "nonsense", 42]) {
      assert.deepEqual(normalizeWatch(input), {
        enabled: false,
        recursive: false,
        debounceMs: DEFAULT_WATCH_DEBOUNCE_MS,
      });
    }
  });

  it("coerces enabled and recursive to booleans", () => {
    assert.equal(normalizeWatch({ enabled: 1 }).enabled, true);
    assert.equal(normalizeWatch({ enabled: 0 }).enabled, false);
    assert.equal(normalizeWatch({ enabled: "yes" }).enabled, true);
    assert.equal(normalizeWatch({ recursive: 1 }).recursive, true);
    assert.equal(normalizeWatch({ recursive: "" }).recursive, false);
  });

  it("passes a valid debounce through unchanged", () => {
    assert.equal(normalizeWatch({ debounceMs: 3500 }).debounceMs, 3500);
  });

  it("clamps debounce below the minimum up to MIN", () => {
    assert.equal(normalizeWatch({ debounceMs: 10 }).debounceMs, MIN_WATCH_DEBOUNCE_MS);
    assert.equal(normalizeWatch({ debounceMs: 0 }).debounceMs, MIN_WATCH_DEBOUNCE_MS);
    assert.equal(normalizeWatch({ debounceMs: -5 }).debounceMs, MIN_WATCH_DEBOUNCE_MS);
  });

  it("clamps debounce above the maximum down to MAX", () => {
    assert.equal(normalizeWatch({ debounceMs: 999_999 }).debounceMs, MAX_WATCH_DEBOUNCE_MS);
  });

  it("floors fractional debounce values", () => {
    assert.equal(normalizeWatch({ debounceMs: 3500.9 }).debounceMs, 3500);
  });

  it("falls back to the default for non-numeric debounce", () => {
    assert.equal(normalizeWatch({ debounceMs: "abc" }).debounceMs, DEFAULT_WATCH_DEBOUNCE_MS);
    assert.equal(normalizeWatch({ debounceMs: NaN }).debounceMs, DEFAULT_WATCH_DEBOUNCE_MS);
  });
});

describe("isInternalChange", () => {
  const internal = ["_dead-letter", "success"];

  it("treats null/empty filenames as non-internal so the run still fires", () => {
    assert.equal(isInternalChange(null, internal), false);
    assert.equal(isInternalChange(undefined, internal), false);
    assert.equal(isInternalChange("", internal), false);
  });

  it("matches the dead-letter subdirectory with either separator", () => {
    assert.equal(isInternalChange("_dead-letter/file.xml", internal), true);
    assert.equal(isInternalChange("_dead-letter\\file.xml", internal), true);
  });

  it("matches the archive subdirectory", () => {
    assert.equal(isInternalChange("success/inv.xml", internal), true);
  });

  it("ignores a leading separator", () => {
    assert.equal(isInternalChange("/success/inv.xml", internal), true);
  });

  it("does not match ordinary files or unrelated subfolders", () => {
    assert.equal(isInternalChange("inv.xml", internal), false);
    assert.equal(isInternalChange("subdir/inv.xml", internal), false);
  });

  it("never matches when no internal dirs are configured", () => {
    assert.equal(isInternalChange("_dead-letter/x.xml", []), false);
  });
});
