/**
 * Dependency-free, **store-only** (uncompressed) streaming ZIP writer.
 *
 * Each entry is emitted as: a local file header with the data-descriptor flag
 * set (general-purpose bit 3) and method 0 (store), the raw file bytes, then a
 * data descriptor carrying the CRC32 + sizes computed while streaming. After
 * all entries, the central directory and end-of-central-directory record are
 * written. This lets us stream arbitrarily large files without buffering them
 * or knowing their CRC up front.
 *
 * Limitations (acceptable for v1): non-ZIP64, so individual entries and the
 * total archive must each stay below 4 GB. Callers should apply their own
 * total-size guard before streaming.
 */

// ── CRC32 ─────────────────────────────────────────────────────────────────────

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Incremental CRC32. Call once for a whole buffer, or chain across chunks by
 * feeding the previous return value back in as `crc`:
 *   let c = 0; for (const chunk of chunks) c = crc32(chunk, c);
 * The XOR-in/XOR-out cancels between calls, so chaining matches a single pass.
 */
export function crc32(data: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    c = (CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── ZIP record builders ───────────────────────────────────────────────────────

const LOCAL_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
// Bit 3: sizes/CRC follow in a data descriptor. Bit 11: filename is UTF-8.
const GP_FLAGS = 0x0008 | 0x0800;
const VERSION = 20; // 2.0

function localHeader(nameBytes: Uint8Array): Uint8Array {
  const buf = new Uint8Array(30 + nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, LOCAL_SIG, true);
  dv.setUint16(4, VERSION, true);
  dv.setUint16(6, GP_FLAGS, true);
  dv.setUint16(8, 0, true); // method: store
  dv.setUint16(10, 0, true); // mod time
  dv.setUint16(12, 0, true); // mod date
  dv.setUint32(14, 0, true); // crc32 (in data descriptor)
  dv.setUint32(18, 0, true); // compressed size (in data descriptor)
  dv.setUint32(22, 0, true); // uncompressed size (in data descriptor)
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true); // extra length
  buf.set(nameBytes, 30);
  return buf;
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  const buf = new Uint8Array(16);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, DATA_DESCRIPTOR_SIG, true);
  dv.setUint32(4, crc >>> 0, true);
  dv.setUint32(8, size >>> 0, true); // compressed (== uncompressed for store)
  dv.setUint32(12, size >>> 0, true); // uncompressed
  return buf;
}

function centralHeader(entry: CentralRecord): Uint8Array {
  const buf = new Uint8Array(46 + entry.nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, CENTRAL_SIG, true);
  dv.setUint16(4, VERSION, true); // version made by
  dv.setUint16(6, VERSION, true); // version needed
  dv.setUint16(8, GP_FLAGS, true);
  dv.setUint16(10, 0, true); // method: store
  dv.setUint16(12, 0, true); // mod time
  dv.setUint16(14, 0, true); // mod date
  dv.setUint32(16, entry.crc >>> 0, true);
  dv.setUint32(20, entry.size >>> 0, true); // compressed
  dv.setUint32(24, entry.size >>> 0, true); // uncompressed
  dv.setUint16(28, entry.nameBytes.length, true);
  dv.setUint16(30, 0, true); // extra length
  dv.setUint16(32, 0, true); // comment length
  dv.setUint16(34, 0, true); // disk number start
  dv.setUint16(36, 0, true); // internal attributes
  dv.setUint32(38, 0, true); // external attributes
  dv.setUint32(42, entry.offset >>> 0, true); // local header offset
  buf.set(entry.nameBytes, 46);
  return buf;
}

function endOfCentralDirectory(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new Uint8Array(22);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, EOCD_SIG, true);
  dv.setUint16(4, 0, true); // this disk
  dv.setUint16(6, 0, true); // disk with CD start
  dv.setUint16(8, count, true); // CD records on this disk
  dv.setUint16(10, count, true); // total CD records
  dv.setUint32(12, cdSize >>> 0, true);
  dv.setUint32(16, cdOffset >>> 0, true);
  dv.setUint16(20, 0, true); // comment length
  return buf;
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

// ── Streaming writer ──────────────────────────────────────────────────────────

/** One file to place in the archive. */
export interface ZipSource {
  /** Path stored in the archive; should use forward slashes. */
  name: string;
  /** Opens the file's bytes, yielded in order (sync or async). */
  open: () => AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}

/**
 * Build a store-only ZIP as a web `ReadableStream<Uint8Array>` from an ordered
 * (sync or async) iterable of sources. Bytes read from `source.open()` are
 * copied before being enqueued so callers may reuse pooled buffers (e.g. from
 * `fs.createReadStream`).
 */
export function createZipStream(
  sources: AsyncIterable<ZipSource> | Iterable<ZipSource>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const central: CentralRecord[] = [];
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const source of sources) {
          const nameBytes = encoder.encode(source.name);
          const localOffset = offset;

          const header = localHeader(nameBytes);
          controller.enqueue(header);
          offset += header.length;

          let crc = 0;
          let size = 0;
          for await (const chunk of source.open()) {
            // Copy so a reused/pooled source buffer can't mutate enqueued bytes.
            const bytes = (chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)).slice();
            crc = crc32(bytes, crc);
            size += bytes.length;
            controller.enqueue(bytes);
            offset += bytes.length;
          }

          const descriptor = dataDescriptor(crc, size);
          controller.enqueue(descriptor);
          offset += descriptor.length;

          central.push({ nameBytes, crc, size, offset: localOffset });
        }

        const cdOffset = offset;
        let cdSize = 0;
        for (const record of central) {
          const header = centralHeader(record);
          controller.enqueue(header);
          cdSize += header.length;
        }

        controller.enqueue(endOfCentralDirectory(central.length, cdSize, cdOffset));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
