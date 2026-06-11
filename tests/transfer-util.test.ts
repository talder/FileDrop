import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: imports only `path` + type-only imports, so it is safe to load
// under `node --test` type-stripping without pulling in native deps.
import {
  selectFiles,
  isSelected,
  applyConflictPolicy,
  uniqueName,
  validateSchedule,
  normalizeSchedule,
  scheduleIntervalMs,
  nextRunAt,
  describeSchedule,
  globToRegExp,
  mapLegacyEndpoint,
  MIN_SCHEDULE_SECONDS,
  type SelectableFile,
} from "../src/lib/transfer-util.ts";

const files: SelectableFile[] = [
  { name: "invoice.xml", relPath: "invoice.xml" },
  { name: "report.pdf", relPath: "2024/report.pdf" },
  { name: "data.csv", relPath: "2024/data.csv" },
  { name: "notes.txt", relPath: "notes.txt" },
];

describe("globToRegExp", () => {
  it("translates * and ? and anchors the match", () => {
    assert.ok(globToRegExp("*.xml").test("invoice.xml"));
    assert.ok(!globToRegExp("*.xml").test("invoice.xmlx"));
    assert.ok(globToRegExp("inv?ice.xml").test("invoice.xml"));
    assert.ok(!globToRegExp("a*").test("ba"));
  });

  it("escapes regex metacharacters in literals", () => {
    assert.ok(globToRegExp("a.b").test("a.b"));
    assert.ok(!globToRegExp("a.b").test("axb"));
  });
});

describe("file selection", () => {
  it("mode=all returns everything", () => {
    assert.equal(selectFiles(files, { mode: "all" }).length, files.length);
  });

  it("mode=all + extensions filters by extension", () => {
    const sel = selectFiles(files, { mode: "all", extensions: ["xml", ".csv"] });
    assert.deepEqual(sel.map((f) => f.name).sort(), ["data.csv", "invoice.xml"]);
  });

  it("mode=single matches by name or relPath", () => {
    assert.ok(isSelected(files[1], { mode: "single", value: "report.pdf" }));
    assert.ok(isSelected(files[1], { mode: "single", value: "2024/report.pdf" }));
    assert.ok(!isSelected(files[1], { mode: "single", value: "other.pdf" }));
  });

  it("mode=glob matches against the base name", () => {
    const sel = selectFiles(files, { mode: "glob", value: "*.pdf" });
    assert.deepEqual(sel.map((f) => f.name), ["report.pdf"]);
  });

  it("mode=list matches name or relPath", () => {
    const sel = selectFiles(files, { mode: "list", list: ["invoice.xml", "2024/data.csv"] });
    assert.deepEqual(sel.map((f) => f.name).sort(), ["data.csv", "invoice.xml"]);
  });

  it("extension filter combines with glob", () => {
    const sel = selectFiles(files, { mode: "glob", value: "*", extensions: [".csv"] });
    assert.deepEqual(sel.map((f) => f.name), ["data.csv"]);
  });
});

describe("conflict resolution", () => {
  const exists = (taken: string[]) => (n: string) => taken.includes(n);

  it("writes the desired name when no collision", () => {
    assert.deepEqual(applyConflictPolicy("a.txt", "skip", exists([])), { action: "write", name: "a.txt" });
  });

  it("overwrite keeps the same name", () => {
    assert.deepEqual(applyConflictPolicy("a.txt", "overwrite", exists(["a.txt"])), { action: "write", name: "a.txt" });
  });

  it("skip refuses to write on collision", () => {
    assert.deepEqual(applyConflictPolicy("a.txt", "skip", exists(["a.txt"])), { action: "skip" });
  });

  it("rename finds the next free suffix", () => {
    const res = applyConflictPolicy("a.txt", "rename", exists(["a.txt", "a (1).txt"]));
    assert.deepEqual(res, { action: "write", name: "a (2).txt" });
  });

  it("uniqueName preserves the extension", () => {
    assert.equal(uniqueName("report.tar.gz", exists(["report.tar.gz"])), "report.tar (1).gz");
  });
});

describe("schedule validation & normalization", () => {
  it("treats a disabled schedule as valid", () => {
    assert.deepEqual(validateSchedule({ enabled: false, every: 0, unit: "seconds" }), { valid: true });
  });

  it("enforces the minimum seconds interval", () => {
    const r = validateSchedule({ enabled: true, every: 1, unit: "seconds" });
    assert.equal(r.valid, false);
  });

  it("rejects a malformed atTime", () => {
    assert.equal(validateSchedule({ enabled: true, every: 1, unit: "days", atTime: "25:00" }).valid, false);
    assert.equal(validateSchedule({ enabled: true, every: 1, unit: "days", atTime: "09:30" }).valid, true);
  });

  it("clamps the seconds interval up to the minimum", () => {
    const n = normalizeSchedule({ enabled: true, every: 1, unit: "seconds" });
    assert.equal(n.every, MIN_SCHEDULE_SECONDS);
  });

  it("drops an invalid atTime during normalization", () => {
    const n = normalizeSchedule({ enabled: true, every: 2, unit: "days", atTime: "nope" });
    assert.equal(n.atTime, undefined);
  });
});

describe("next-run computation", () => {
  it("uses a fixed interval for sub-day units", () => {
    assert.equal(scheduleIntervalMs({ enabled: true, every: 30, unit: "seconds" }), 30_000);
    assert.equal(scheduleIntervalMs({ enabled: true, every: 5, unit: "minutes" }), 300_000);
  });

  it("returns null interval for day+atTime schedules", () => {
    assert.equal(scheduleIntervalMs({ enabled: true, every: 1, unit: "days", atTime: "06:00" }), null);
  });

  it("nextRunAt adds the interval for sub-day units", () => {
    const from = new Date("2024-03-15T10:00:00.000Z");
    const next = nextRunAt({ enabled: true, every: 2, unit: "hours" }, from);
    assert.equal(next?.toISOString(), "2024-03-15T12:00:00.000Z");
  });

  it("nextRunAt rolls to a future time-of-day", () => {
    const from = new Date(2024, 2, 15, 10, 0, 0);
    const next = nextRunAt({ enabled: true, every: 1, unit: "days", atTime: "06:00" }, from)!;
    // 06:00 already passed today -> next day at 06:00
    assert.equal(next.getDate(), 16);
    assert.equal(next.getHours(), 6);
    assert.equal(next.getMinutes(), 0);
  });

  it("nextRunAt returns null when disabled", () => {
    assert.equal(nextRunAt({ enabled: false, every: 1, unit: "hours" }), null);
  });

  it("describeSchedule is human readable", () => {
    assert.equal(describeSchedule({ enabled: false, every: 1, unit: "hours" }), "Manual only");
    assert.equal(describeSchedule({ enabled: true, every: 1, unit: "hours" }), "Every 1 hour");
    assert.equal(describeSchedule({ enabled: true, every: 1, unit: "days", atTime: "06:00" }), "Daily at 06:00");
  });
});

describe("legacy endpoint migration mapping", () => {
  const now = "2024-03-15T10:00:00.000Z";

  it("returns null for non-sftp endpoints", () => {
    assert.equal(mapLegacyEndpoint({ id: "e1", type: "api" }, { connectionId: "c", transferId: "t", now }), null);
  });

  it("maps a polling pull endpoint to a connection + transfer", () => {
    const res = mapLegacyEndpoint(
      {
        id: "e1",
        slug: "pominbound",
        type: "sftp",
        destinationId: "dest1",
        subdirectory: "in",
        allowedExtensions: [".xml"],
        sftp: { host: "sftp.example.com", port: 2200, username: "bob", remotePath: "/out", direction: "pull" },
        poll: { enabled: true, intervalSeconds: 120, deleteAfterTransfer: true },
      },
      { connectionId: "conn-1", transferId: "tr-1", now },
    );
    assert.ok(res);
    assert.equal(res!.connection.host, "sftp.example.com");
    assert.equal(res!.connection.port, 2200);
    assert.equal(res!.connection.name, "pominbound");
    assert.equal(res!.transfer.direction, "pull");
    assert.equal(res!.transfer.remotePath, "/out");
    assert.equal(res!.transfer.destinationId, "dest1");
    assert.equal(res!.transfer.deleteSourceAfterTransfer, true);
    assert.equal(res!.transfer.conflictPolicy, "skip");
    assert.equal(res!.transfer.schedule.enabled, true);
    assert.equal(res!.transfer.schedule.unit, "seconds");
    assert.equal(res!.transfer.schedule.every, 120);
    assert.deepEqual(res!.transfer.selection, { mode: "all", extensions: [".xml"] });
  });

  it("defaults port to 22 and disables schedule when polling is off", () => {
    const res = mapLegacyEndpoint(
      { id: "e2", type: "sftp", sftp: { host: "h", username: "u", direction: "push" } },
      { connectionId: "c2", transferId: "t2", now },
    )!;
    assert.equal(res.connection.port, 22);
    assert.equal(res.transfer.direction, "push");
    assert.equal(res.transfer.schedule.enabled, false);
    assert.equal(res.transfer.remotePath, ".");
  });
});
