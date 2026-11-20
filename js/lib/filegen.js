// Generates files of an exact size. Text formats are valid documents padded to size;
// PNG and PDF are valid files padded with legal filler. No DOM access (uses Blob,
// crypto and CompressionStream, which exist in browsers and Node 22+).

export const MAX_SIZE = 100 * 1024 * 1024;
const CHUNK = 1024 * 1024;

export const UNITS = { B: 1, KB: 1000, KiB: 1024, MB: 1_000_000, MiB: 1_048_576 };

export const FORMATS = {
  txt: { label: 'Text (.txt)', ext: 'txt', mime: 'text/plain' },
  csv: { label: 'CSV (.csv)', ext: 'csv', mime: 'text/csv' },
  json: { label: 'JSON (.json)', ext: 'json', mime: 'application/json' },
  png: { label: 'PNG image (.png)', ext: 'png', mime: 'image/png' },
  pdf: { label: 'PDF document (.pdf)', ext: 'pdf', mime: 'application/pdf' },
  zeros: { label: 'Binary, all zeros (.bin)', ext: 'bin', mime: 'application/octet-stream' },
  random: { label: 'Binary, random bytes (.bin)', ext: 'bin', mime: 'application/octet-stream' },
};

export const PNG_DIMENSIONS = { '1x1': [1, 1], '100x100': [100, 100], '800x600': [800, 600], '1920x1080': [1920, 1080] };

const fmt = (n) => n.toLocaleString('en-US');

/** Converts a number and unit into whole bytes, or throws a message fit for the UI. */
export function parseSize(value, unit = 'B') {
  const factor = UNITS[unit];
  if (!factor) throw new RangeError(`Unknown unit: ${unit}`);
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isFinite(n) || n <= 0) throw new RangeError('Size must be a number greater than zero.');
  const bytes = n * factor;
  if (!Number.isInteger(bytes)) throw new RangeError(`${value} ${unit} is not a whole number of bytes.`);
  if (bytes > MAX_SIZE) throw new RangeError(`Size is limited to ${fmt(MAX_SIZE)} bytes (100 MiB) because the file is built in memory.`);
  return bytes;
}

export function fileName(format, size) {
  const label = size % 1_048_576 === 0 ? `${size / 1_048_576}MiB` : size % 1024 === 0 ? `${size / 1024}KiB` : `${size}B`;
  return `testfile-${label}.${FORMATS[format].ext}`;
}

const tick = () => new Promise((resolve) => setTimeout(resolve));
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// ---- simple binary and text ------------------------------------------------------

async function* zeroChunks(size) {
  const buf = new Uint8Array(CHUNK);
  for (let left = size; left > 0; left -= CHUNK) yield left >= CHUNK ? buf : buf.subarray(0, left);
}

async function* randomChunks(size) {
  const buf = new Uint8Array(CHUNK);
  for (let left = size; left > 0; left -= CHUNK) {
    const n = Math.min(CHUNK, left);
    for (let off = 0; off < n; off += 65536) globalThis.crypto.getRandomValues(buf.subarray(off, Math.min(off + 65536, n)));
    yield buf.subarray(0, n);
  }
}

async function* textChunks(size) {
  const line = ascii('The quick brown fox jumps over the lazy dog 0123456789.\n');
  const buf = new Uint8Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) buf[i] = line[i % line.length];
  for (let left = size; left > 0; left -= CHUNK) {
    if (left > CHUNK) {
      yield buf;
    } else {
      const last = buf.slice(0, left);
      last[left - 1] = 10; // end the file with a line break
      yield last;
    }
  }
}

// ---- CSV and JSON (valid documents, exact size) -----------------------------------

// All content is ASCII, so characters equal bytes. `row(k)` builds item k; `finalRow(k, pad)`
// builds the last item with `pad` extra filler characters so the total is exactly `size`.
const STRUCTURED = {
  csv: {
    head: 'id,name,email,amount,note\n',
    sep: '',
    tail: '',
    row: (k) => `${k},User ${k},user${k}@example.com,${((k * 37) % 100000) / 100},note ${k}\n`,
    finalRow: (k, pad) => `${k},User ${k},user${k}@example.com,1.00,${'x'.repeat(pad)}\n`,
  },
  json: {
    head: '[\n',
    sep: ',\n',
    tail: '\n]',
    row: (k) => `{"id":${k},"name":"User ${k}","email":"user${k}@example.com","active":${k % 2 === 0}}`,
    finalRow: (k, pad) => `{"id":${k},"name":"User ${k}","email":"user${k}@example.com","note":"${'x'.repeat(pad)}"}`,
  },
};
const RESERVE = 160; // more than any single row, so the last row can always be padded

function structuredMin(kind) {
  const s = STRUCTURED[kind];
  return s.head.length + s.finalRow(1, 0).length + s.tail.length;
}

async function* structuredChunks(kind, size) {
  const s = STRUCTURED[kind];
  const enc = new TextEncoder();
  if (kind === 'json' && size < structuredMin('json')) {
    // too small for an item: a valid empty array padded with whitespace
    yield enc.encode(`[${' '.repeat(size - 2)}]`);
    return;
  }
  let pending = [s.head];
  let pendingLen = s.head.length;
  let bytes = s.head.length;
  let k = 1;
  for (;;) {
    const next = (k > 1 ? s.sep : '') + s.row(k);
    if (bytes + next.length + s.tail.length + RESERVE > size) break;
    pending.push(next);
    pendingLen += next.length;
    bytes += next.length;
    k++;
    if (pendingLen >= CHUNK) {
      yield enc.encode(pending.join(''));
      pending = [];
      pendingLen = 0;
    }
  }
  const lead = k > 1 ? s.sep : '';
  const pad = size - bytes - s.tail.length - lead.length - s.finalRow(k, 0).length;
  pending.push(lead + s.finalRow(k, pad) + s.tail);
  yield enc.encode(pending.join(''));
}

// ---- PNG -----------------------------------------------------------------------------

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crcUpdate(crc, bytes) {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

const u32 = (n) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const concat = (...arrays) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
};

function pngChunk(type, data) {
  const body = concat(ascii(type), data);
  return concat(u32(data.length), body, u32((crcUpdate(0xffffffff, body) ^ 0xffffffff) >>> 0));
}

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const pngCache = new Map();

async function pngParts(width, height) {
  const key = `${width}x${height}`;
  if (pngCache.has(key)) return pngCache.get(key);
  if (typeof CompressionStream === 'undefined') throw new Error('Creating PNG files needs a newer browser (CompressionStream).');
  // raw scanlines: filter byte 0 + RGB gradient
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = Math.floor((x * 255) / Math.max(1, width - 1));
      raw[row + 2 + x * 3] = Math.floor((y * 255) / Math.max(1, height - 1));
      raw[row + 3 + x * 3] = 128;
    }
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const zlib = new Uint8Array(await new Response(stream).arrayBuffer());
  const ihdr = pngChunk('IHDR', concat(u32(width), u32(height), Uint8Array.of(8, 2, 0, 0, 0)));
  const parts = { head: concat(PNG_SIGNATURE, ihdr), idat: pngChunk('IDAT', zlib), iend: pngChunk('IEND', new Uint8Array(0)) };
  parts.base = parts.head.length + parts.idat.length + parts.iend.length;
  pngCache.set(key, parts);
  return parts;
}

async function* pngChunks(size, width, height) {
  const p = await pngParts(width, height);
  const extra = size - p.base;
  yield p.head;
  if (extra > 0) {
    // a private, ancillary, safe-to-copy chunk ("paDd") full of zeros: legal in every PNG
    const dataLen = extra - 12;
    yield u32(dataLen);
    let crc = crcUpdate(0xffffffff, ascii('paDd'));
    yield ascii('paDd');
    for await (const z of zeroChunks(dataLen)) {
      crc = crcUpdate(crc, z);
      yield z;
    }
    yield u32((crc ^ 0xffffffff) >>> 0);
  }
  yield p.idat;
  yield p.iend;
}

// ---- PDF -----------------------------------------------------------------------------

/** Builds the PDF around a padding stream of `pad` bytes; returns the text before and after it. */
function pdfLayout(size, pad) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // content stream, below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const text = `BT /F1 24 Tf 72 700 Td (Test file: ${size} bytes) Tj ET`;
  let prefix = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(prefix.length);
    prefix += body === null
      ? `${i + 1} 0 obj\n<< /Length ${text.length} >>\nstream\n${text}\nendstream\nendobj\n`
      : `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  offsets.push(prefix.length);
  prefix += `6 0 obj\n<< /Length ${pad} >>\nstream\n`;
  const afterPad = '\nendstream\nendobj\n';
  const xrefAt = prefix.length + pad + afterPad.length;
  const xref = `xref\n0 7\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  const suffix = `${afterPad}${xref}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return { prefix, suffix, total: prefix.length + pad + suffix.length };
}

/** Padding that makes a PDF of exactly `target` bytes (printing `size` in the page text), or -1. */
function solvePad(size, target) {
  let pad = 0;
  for (let i = 0; i < 6; i++) {
    const { total } = pdfLayout(size, pad);
    if (total === target) return pad;
    pad += target - total; // only the digit counts of /Length and startxref can change between rounds
    if (pad < 0) return -1;
  }
  return pdfLayout(size, pad).total === target ? pad : -1;
}

/**
 * Where /Length or startxref gain a digit the size can skip a value; a few harmless blank
 * lines after %%EOF (which readers ignore) fill such a gap.
 */
function pdfPlan(size) {
  for (let trail = 0; trail <= 3; trail++) {
    const pad = solvePad(size, size - trail);
    if (pad >= 0) return { pad, trail };
  }
  return null;
}

async function* pdfChunks(size) {
  const { pad, trail } = pdfPlan(size);
  const { prefix, suffix } = pdfLayout(size, pad);
  yield ascii(prefix);
  const spaces = new Uint8Array(CHUNK).fill(32);
  for (let left = pad; left > 0; left -= CHUNK) yield left >= CHUNK ? spaces : spaces.subarray(0, left);
  yield ascii(suffix + '\n'.repeat(trail));
}

// ---- public API ------------------------------------------------------------------------

/** Smallest size this format can be made at. */
export async function minimumSize(format, { png = '1x1' } = {}) {
  if (!FORMATS[format]) throw new RangeError(`Unknown format: ${format}`);
  switch (format) {
    case 'csv':
      return structuredMin('csv');
    case 'json':
      return 2; // "[]"; larger sizes up to the first item are padded with whitespace
    case 'png':
      return (await pngParts(...PNG_DIMENSIONS[png])).base;
    case 'pdf': {
      let size = 400;
      while (!pdfPlan(size)) size++;
      return size;
    }
    default:
      return 1;
  }
}

/**
 * Builds a Blob of exactly `size` bytes.
 * @param {{format: string, size: number, png?: string, onProgress?: (fraction: number) => void}} options
 */
export async function generateFile({ format, size, png = '1x1', onProgress }) {
  const spec = FORMATS[format];
  if (!spec) throw new RangeError(`Unknown format: ${format}`);
  if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE + 1) throw new RangeError(`Size must be between 1 and ${fmt(MAX_SIZE)} bytes.`);

  const min = await minimumSize(format, { png });
  if (size < min) throw new RangeError(`The smallest ${spec.label.split(' (')[0]} file is ${fmt(min)} bytes.`);

  let chunks;
  if (format === 'zeros') chunks = zeroChunks(size);
  else if (format === 'random') chunks = randomChunks(size);
  else if (format === 'txt') chunks = textChunks(size);
  else if (format === 'csv' || format === 'json') chunks = structuredChunks(format, size);
  else if (format === 'png') {
    const [w, h] = PNG_DIMENSIONS[png];
    const gap = size - (await pngParts(w, h)).base;
    if (gap > 0 && gap < 12) {
      throw new RangeError(`A PNG of this image size can be ${fmt(min)} bytes or at least ${fmt(min + 12)} bytes, nothing in between.`);
    }
    chunks = pngChunks(size, w, h);
  } else {
    if (!pdfPlan(size)) throw new RangeError(`The smallest PDF file is ${fmt(min)} bytes.`);
    chunks = pdfChunks(size);
  }

  const parts = [];
  let done = 0;
  for await (const chunk of chunks) {
    parts.push(new Blob([chunk])); // copies now, so the generators may reuse their buffers
    done += chunk.length;
    onProgress?.(Math.min(1, done / size));
    if (parts.length % 8 === 0) await tick();
  }
  const blob = new Blob(parts, { type: spec.mime });
  if (blob.size !== size) throw new Error(`Internal error: built ${fmt(blob.size)} bytes instead of ${fmt(size)}.`);
  return blob;
}
