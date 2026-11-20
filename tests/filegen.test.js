import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  parseSize, fileName, generateFile, minimumSize, FORMATS, MAX_SIZE, PNG_DIMENSIONS,
} from '../js/lib/filegen.js';

const bytesOf = async (format, size, options = {}) => new Uint8Array(await (await generateFile({ format, size, ...options })).arrayBuffer());
const text = (u8) => Buffer.from(u8).toString('latin1');

test('parseSize converts units and rejects bad values', () => {
  assert.equal(parseSize('5', 'MiB'), 5_242_880);
  assert.equal(parseSize('5', 'MB'), 5_000_000);
  assert.equal(parseSize('1.5', 'KiB'), 1536);
  assert.equal(parseSize('100', 'B'), 100);
  assert.equal(parseSize(1, 'KB'), 1000);
  assert.equal(parseSize('100', 'MiB'), MAX_SIZE);
  for (const bad of ['', '0', '-3', 'abc', Infinity]) assert.throws(() => parseSize(bad, 'KB'), /greater than zero/, String(bad));
  assert.throws(() => parseSize('0.5', 'B'), /whole number of bytes/);
  assert.throws(() => parseSize('101', 'MiB'), /limited to/);
  assert.throws(() => parseSize('1', 'GB'), /Unknown unit/);
});

test('fileName reflects the size', () => {
  assert.equal(fileName('pdf', 5 * 1_048_576), 'testfile-5MiB.pdf');
  assert.equal(fileName('txt', 2048), 'testfile-2KiB.txt');
  assert.equal(fileName('zeros', 1000), 'testfile-1000B.bin');
  assert.equal(fileName('json', 1_048_577), 'testfile-1048577B.json');
});

test('every format produces exactly the requested number of bytes', async () => {
  const sizes = [1, 2, 3, 10, 99, 100, 101, 999, 1000, 1023, 1024, 1025, 65535, 65536, 65537, 1_048_575, 1_048_576, 1_048_577, 3_000_000];
  for (const format of Object.keys(FORMATS)) {
    const min = await minimumSize(format);
    for (const size of sizes) {
      if (size < min) continue;
      try {
        const blob = await generateFile({ format, size });
        assert.equal(blob.size, size, `${format} ${size}`);
        assert.equal(blob.type, FORMATS[format].mime);
      } catch (err) {
        // PNG cannot be 1..11 bytes larger than its minimum
        assert.ok(format === 'png' && /nothing in between/.test(err.message), `${format} ${size}: ${err.message}`);
      }
    }
  }
});

test('txt: ASCII lines ending with a line break, at awkward sizes', async () => {
  for (const size of [1, 57, 58, 1000, 1_048_576, 1_048_577, 2_097_152]) {
    const u8 = await bytesOf('txt', size);
    assert.equal(u8[size - 1], 10, `ends with newline at ${size}`);
    assert.ok(u8.every((b) => b < 128), 'ASCII');
  }
});

test('zeros and random', async () => {
  const z = await bytesOf('zeros', 2_500_000);
  assert.ok(z.every((b) => b === 0));
  const a = await bytesOf('random', 200_000);
  const b = await bytesOf('random', 200_000);
  assert.notDeepEqual(a, b);
  assert.ok(new Set(a).size > 250, 'uses (nearly) all byte values');
  assert.ok(a.some((x) => x !== 0));
  const big = await bytesOf('random', 1_048_577);
  assert.equal(big.length, 1_048_577);
});

test('csv: valid rows with sequential ids and a padded last row', async () => {
  for (const size of [minimumSize('csv') && (await minimumSize('csv')), 200, 5000, 1_048_576, 3_000_000]) {
    const lines = text(await bytesOf('csv', size)).split('\n');
    assert.equal(lines.pop(), '', 'ends with a line break');
    assert.equal(lines[0], 'id,name,email,amount,note');
    lines.slice(1).forEach((line, i) => {
      const cells = line.split(',');
      assert.equal(cells.length, 5, `row ${i + 1}: ${line.slice(0, 80)}`);
      assert.equal(Number(cells[0]), i + 1);
    });
    assert.ok(lines.length >= 2);
  }
  assert.ok(text(await bytesOf('csv', 3_000_000)).split('\n').length > 30_000);
  await assert.rejects(() => generateFile({ format: 'csv', size: 20 }), /smallest CSV file is/);
});

test('json: always parses, uses real items when large enough', async () => {
  for (const size of [2, 3, 50, 100, 120, 135, 136, 137, 200, 1000, 70_000, 1_048_576, 3_000_000]) {
    const data = JSON.parse(text(await bytesOf('json', size)));
    assert.ok(Array.isArray(data), `${size}`);
    if (size >= 140) {
      assert.ok(data.length >= 1);
      data.forEach((item, i) => assert.equal(item.id, i + 1));
    }
  }
  assert.ok(JSON.parse(text(await bytesOf('json', 3_000_000))).length > 25_000);
  assert.equal(text(await bytesOf('json', 2)), '[]');
  await assert.rejects(() => generateFile({ format: 'json', size: 1 }), /smallest JSON/);
});

// --- independent PNG checker (zlib.crc32 / inflate from node, not the generator's code) ---
function checkPng(u8) {
  const buf = Buffer.from(u8);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'signature');
  let pos = 8;
  const chunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    const crc = buf.readUInt32BE(pos + 8 + len);
    assert.equal(crc, zlib.crc32(buf.subarray(pos + 4, pos + 8 + len)), `CRC of ${type}`);
    chunks.push({ type, data });
    pos += 12 + len;
  }
  assert.equal(pos, buf.length, 'chunks fill the file exactly');
  assert.equal(chunks[0].type, 'IHDR');
  assert.equal(chunks.at(-1).type, 'IEND');
  const width = chunks[0].data.readUInt32BE(0);
  const height = chunks[0].data.readUInt32BE(4);
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  assert.equal(zlib.inflateSync(idat).length, (width * 3 + 1) * height, 'decompresses to the right amount of pixels');
  return { width, height, chunks };
}

test('png: valid chunks and CRCs at many sizes and dimensions', async () => {
  for (const png of Object.keys(PNG_DIMENSIONS)) {
    const min = await minimumSize('png', { png });
    for (const size of [min, min + 12, min + 13, min + 100, 100_000, 1_048_576, 2_000_000]) {
      if (size < min) continue;
      const { width, height, chunks } = checkPng(await bytesOf('png', size, { png }));
      assert.deepEqual([width, height], PNG_DIMENSIONS[png]);
      if (size > min) assert.ok(chunks.some((c) => c.type === 'paDd'), 'padding chunk present');
    }
    for (const gap of [1, 5, 11]) await assert.rejects(() => generateFile({ format: 'png', size: min + gap, png }), /nothing in between/);
    await assert.rejects(() => generateFile({ format: 'png', size: min - 1, png }), /smallest PNG/);
  }
  assert.equal((await minimumSize('png', { png: '1x1' })) < 100, true);
});

// --- independent PDF checker: header, xref offsets, stream lengths, startxref ---
function checkPdf(u8) {
  const s = text(u8);
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.match(s, /%%EOF\n+$/);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.equal(s.slice(startxref, startxref + 5), 'xref\n');
  const entries = [...s.slice(startxref).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  assert.equal(entries.length, 7);
  entries.slice(1).forEach((m, i) => assert.equal(s.slice(Number(m[1])).startsWith(`${i + 1} 0 obj\n`), true, `object ${i + 1} offset`));
  for (const m of s.matchAll(/(\d) 0 obj\n<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(s.slice(start + Number(m[2]), start + Number(m[2]) + 17), '\nendstream\nendobj', `stream ${m[1]} length`);
  }
  assert.equal(/\/Size (\d+)/.exec(s)[1], '7');
}

test('pdf: consistent xref table and stream lengths at many sizes, including digit boundaries', async () => {
  const min = await minimumSize('pdf');
  assert.ok(min > 400 && min < 1000, `minimum ${min}`);
  const sizes = new Set([min, min + 1, min + 2, min + 3]);
  for (let n = 0; n < 40; n++) sizes.add(min + n); // dense around the minimum, where digit boundaries live
  for (const near of [100, 1000, 10_000, 100_000, 1_000_000]) for (let d = -6; d <= 6; d++) sizes.add(near + d + 700);
  [5000, 65_536, 1_048_576, 5_000_000].forEach((s) => sizes.add(s));
  for (const size of sizes) {
    if (size < min) continue;
    const u8 = await bytesOf('pdf', size);
    assert.equal(u8.length, size);
    checkPdf(u8);
  }
  await assert.rejects(() => generateFile({ format: 'pdf', size: min - 1 }), /smallest PDF/);
});

test('size limits', async () => {
  await assert.rejects(() => generateFile({ format: 'txt', size: 0 }), RangeError);
  await assert.rejects(() => generateFile({ format: 'txt', size: 1.5 }), RangeError);
  await assert.rejects(() => generateFile({ format: 'txt', size: MAX_SIZE + 2 }), RangeError);
  await assert.rejects(() => generateFile({ format: 'exe', size: 10 }), /Unknown format/);
});

test('progress is reported and ends at 1', async () => {
  const seen = [];
  await generateFile({ format: 'zeros', size: 5_000_000, onProgress: (f) => seen.push(f) });
  assert.ok(seen.length >= 5);
  assert.equal(seen.at(-1), 1);
  assert.deepEqual([...seen].sort((a, b) => a - b), seen);
});
