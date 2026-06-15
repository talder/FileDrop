import { describe, it } from "node:test";
import assert from "node:assert/strict";

// zip.ts has no relative imports, so it loads cleanly under `node --test`
// type-stripping. Import with the explicit .ts extension for Node ESM.
import { crc32, createZipStream, type ZipSource } from "../src/lib/zip.ts";

const LOCAL_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const enc = (s: string) => new TextEncoder().encode(s);

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

describe("crc32", () => {
  it("matches the canonical IEEE check vector", () => {
    // The standard CRC-32 check value for the ASCII string "123456789".
    assert.equal(crc32(enc("123456789")), 0xcbf43926);
  });

  it("is 0 for empty input", () => {
    assert.equal(crc32(new Uint8Array()), 0);
  });

  it("chains incrementally to match a single pass", () => {
    const full = enc("The quick brown fox jumps over the lazy dog");
    const once = crc32(full);
    let chained = 0;
    chained = crc32(full.subarray(0, 10), chained);
    chained = crc32(full.subarray(10, 25), chained);
    chained = crc32(full.subarray(25), chained);
    assert.equal(chained, once);
  });
});

describe("createZipStream", () => {
  it("produces a valid store-only archive that round-trips", async () => {
    const hello = enc("Hello, world!\n");
    const bin = new Uint8Array(256);
    for (let i = 0; i < bin.length; i++) bin[i] = i;

    const expected = new Map<string, Uint8Array>([
      ["hello.txt", hello],
      ["nested/data.bin", bin],
    ]);

    const sources: ZipSource[] = [
      // Emit the first file in multiple chunks to exercise crc/size streaming.
      { name: "hello.txt", open: () => [hello.subarray(0, 5), hello.subarray(5)] },
      { name: "nested/data.bin", open: () => [bin] },
    ];

    const zip = await collect(createZipStream(sources));
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const u16 = (o: number) => dv.getUint16(o, true);
    const u32 = (o: number) => dv.getUint32(o, true);

    // Starts with a local file header and contains a data descriptor.
    assert.equal(u32(0), LOCAL_SIG);
    let sawDescriptor = false;
    for (let i = 0; i + 4 <= zip.length; i++) {
      if (u32(i) === DATA_DESCRIPTOR_SIG) { sawDescriptor = true; break; }
    }
    assert.ok(sawDescriptor, "expected at least one data descriptor signature");

    // EOCD is the trailing 22 bytes (no archive comment).
    const eocd = zip.length - 22;
    assert.equal(u32(eocd), EOCD_SIG);
    const count = u16(eocd + 10);
    const cdSize = u32(eocd + 12);
    const cdOffset = u32(eocd + 16);
    assert.equal(count, sources.length);
    assert.equal(cdOffset + cdSize, eocd, "central directory should end at the EOCD");

    // Walk the central directory, then read each entry's stored bytes via its
    // local-header offset and verify the content + CRC round-trip.
    let p = cdOffset;
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      assert.equal(u32(p), CENTRAL_SIG);
      const crc = u32(p + 16);
      const compSize = u32(p + 20);
      const uncompSize = u32(p + 24);
      const nameLen = u16(p + 28);
      const extraLen = u16(p + 30);
      const commentLen = u16(p + 32);
      const localOffset = u32(p + 42);
      const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));

      assert.equal(compSize, uncompSize, "store-only entries are uncompressed");
      const want = expected.get(name);
      assert.ok(want, `unexpected entry name: ${name}`);
      assert.equal(uncompSize, want!.length);
      assert.equal(crc, crc32(want!), `crc mismatch for ${name}`);

      // Local header: 30 fixed bytes + name + extra, then the raw stored bytes.
      assert.equal(u32(localOffset), LOCAL_SIG);
      const lNameLen = u16(localOffset + 26);
      const lExtraLen = u16(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const content = zip.subarray(dataStart, dataStart + compSize);
      assert.deepEqual(content, want!, `content mismatch for ${name}`);

      seen.add(name);
      p += 46 + nameLen + extraLen + commentLen;
    }
    assert.deepEqual([...seen].sort(), ["hello.txt", "nested/data.bin"]);
  });

  it("writes an empty but valid archive for no sources", async () => {
    const zip = await collect(createZipStream([]));
    assert.equal(zip.length, 22);
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    assert.equal(dv.getUint32(0, true), EOCD_SIG);
    assert.equal(dv.getUint16(10, true), 0);
  });
});
