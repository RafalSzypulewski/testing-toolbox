import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv, jsonToCsv, csvToJson, CsvError } from '../js/lib/csv.js';
import { python, pythonHas } from './helpers-python.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('parseCsv handles quotes, embedded delimiters and line breaks, every kind of line end, and a BOM', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']], 'CRLF and a final line break');
  assert.deepEqual(parseCsv('a,b\r1,2'), [['a', 'b'], ['1', '2']], 'old Mac line ends');
  assert.deepEqual(parseCsv('"x,1","say ""hi""","two\nlines"'), [['x,1', 'say "hi"', 'two\nlines']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']], 'CRLF inside quotes is kept');
  assert.deepEqual(parseCsv('a,,c\n,,\n'), [['a', '', 'c'], ['', '', '']]);
  assert.deepEqual(parseCsv('a,b\n\n\nc,d'), [['a', 'b'], ['c', 'd']], 'blank lines are skipped');
  assert.deepEqual(parseCsv('a,b\n""\nc'), [['a', 'b'], [''], ['c']], 'a quoted empty field is a real row');
  assert.deepEqual(parseCsv('﻿name\nAnn'), [['name'], ['Ann']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
  assert.deepEqual(parseCsv('a;b|c', { delimiter: ';' }), [['a', 'b|c']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('x"y,z'), [['x"y', 'z']], 'a quote inside an unquoted field is just a character');
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']], 'spaces are kept');
  assert.deepEqual(parseCsv('ünï,😀'), [['ünï', '😀']]);
});

test('parseCsv reports unclosed quotes and stray characters with a line number', () => {
  assert.throws(() => parseCsv('a,b\n"open,c\nd'), (e) => e instanceof CsvError && /starts on line 2 is never closed/.test(e.message));
  assert.throws(() => parseCsv('"ab"c,d'), /Line 1: unexpected "c" after the closing quote/);
  assert.throws(() => parseCsv('a\n"b"x'), /Line 2: unexpected "x"/);
  assert.throws(() => parseCsv('a', { delimiter: '"' }), /single character/);
  assert.throws(() => parseCsv('a', { delimiter: ',,' }), /single character/);
});

test('toCsv quotes only when needed', () => {
  assert.equal(toCsv([['a', 'b c', 'd']]), 'a,b c,d');
  assert.equal(toCsv([['x,1', 'say "hi"', 'two\nlines', 'cr\rhere']]), '"x,1","say ""hi""","two\nlines","cr\rhere"');
  assert.equal(toCsv([['a;b', 'c,d']], { delimiter: ';' }), '"a;b";c,d');
  assert.equal(toCsv([['a\tb', 'c']], { delimiter: '\t' }), '"a\tb"\tc');
  assert.equal(toCsv([['a|b', 'c']], { delimiter: '|' }), '"a|b"|c');
  assert.equal(toCsv([['a', 'b'], ['c', 'd']], { eol: '\r\n' }), 'a,b\r\nc,d');
  assert.equal(toCsv([['']]), '""', 'a row with one empty cell must not look like a blank line');
  assert.equal(toCsv([['', '']]), ',');
  assert.equal(toCsv([]), '');
  for (const d of ['\\', ']', '^', '-']) assert.equal(toCsv([[`a${d}b`, 'c']], { delimiter: d }), `"a${d}b"${d}c`, `delimiter ${d}`);
});

test('jsonToCsv: the header is the union of all keys, nested objects become dotted columns', () => {
  const rows = [
    { name: 'Ann', address: { city: 'Rome', zip: '00100' }, tags: ['a', 'b'], note: null, ok: true },
    { name: 'Bob', extra: 1.5, address: { city: 'Oslo' } },
  ];
  assert.equal(
    jsonToCsv(rows),
    'name,address.city,address.zip,tags,note,ok,extra\nAnn,Rome,00100,"[""a"",""b""]",,true,\nBob,Oslo,,,,,1.5',
  );
  assert.equal(jsonToCsv(rows, { arrays: 'index' }).split('\n')[0], 'name,address.city,address.zip,tags[0],tags[1],note,ok,extra');
  assert.equal(jsonToCsv(rows, { nullAs: 'null' }).split('\n')[1], 'Ann,Rome,00100,"[""a"",""b""]",null,true,');
  assert.equal(jsonToCsv(rows, { flatten: false }).split('\n')[0], 'name,address,tags,note,ok,extra');
  assert.ok(jsonToCsv(rows, { flatten: false }).includes('"{""city"":""Rome"",""zip"":""00100""}"'));
  assert.equal(jsonToCsv(rows, { delimiter: ';' }).split('\n')[0], 'name;address.city;address.zip;tags;note;ok;extra');
  assert.equal(jsonToCsv({ a: 1, b: { c: 2 } }), 'a,b.c\n1,2', 'one object is one row');
  assert.equal(jsonToCsv([1, 'x', null]), 'value\n1\nx\n""', 'plain values become one column; a null is written as "" so the row does not look like a blank line');
  assert.deepEqual(csvToJson(jsonToCsv([1, 'x', null]), { emptyAs: 'null' }).map((r) => r.value), [1, 'x', null], 'and it reads back as null');
  assert.equal(jsonToCsv([[1, 'a'], [2, 'b,c']]), '1,a\n2,"b,c"', 'arrays of arrays are written as they are');
  assert.equal(jsonToCsv([]), '');
  assert.equal(jsonToCsv([{}, {}]), '\n\n', 'objects without keys have no columns (an empty header and two empty rows), not a column with an empty name');
  assert.equal(jsonToCsv([{ a: 1 }, {}]), 'a\n1\n""', 'an empty object among others is an empty row, written as "" in a one-column table so it is not lost');
  assert.equal(jsonToCsv([{ a: 1, b: 2 }, {}]), 'a,b\n1,2\n,');
  assert.equal(jsonToCsv([{ a: {} , b: [] }]), 'a,b\n{},[]', 'empty containers stay visible as {} and []');
  assert.throws(() => jsonToCsv(5), CsvError);
  assert.throws(() => jsonToCsv('text'), /not a single value/);
  assert.throws(() => jsonToCsv(null), CsvError);
  assert.throws(() => jsonToCsv([{ a: 1 }, [1]]), /Item 2 is an array/);
});

test('csvToJson: type inference, empty cells, ragged rows and header problems', () => {
  const csv = 'id,name,price,ok,when,code,big,sci\n1,Ann,2.5,true,null,007,12345678901234567890,1e3\n-2,"B,ob",,false,x,0,9007199254740991,TRUE';
  assert.deepEqual(csvToJson(csv), [
    { id: 1, name: 'Ann', price: 2.5, ok: true, when: null, code: '007', big: '12345678901234567890', sci: 1000 },
    { id: -2, name: 'B,ob', price: '', ok: false, when: 'x', code: 0, big: 9007199254740991, sci: 'TRUE' },
  ]);
  assert.deepEqual(csvToJson(csv, { infer: false })[0], { id: '1', name: 'Ann', price: '2.5', ok: 'true', when: 'null', code: '007', big: '12345678901234567890', sci: '1e3' });
  assert.deepEqual(csvToJson('a,b\n1,\n,2', { emptyAs: 'null' }), [{ a: 1, b: null }, { a: null, b: 2 }]);
  assert.deepEqual(csvToJson('a,b,c\n1'), [{ a: 1, b: '', c: '' }], 'a short row is padded');
  assert.deepEqual(csvToJson('1,x\n2,y', { header: false }), [[1, 'x'], [2, 'y']]);
  assert.deepEqual(csvToJson('a,b\n1,2', { delimiter: ';' }), [{ 'a,b': '1,2' }], 'with the wrong delimiter the whole line is one column');
  assert.deepEqual(csvToJson('a;b\n1;2', { delimiter: ';' }), [{ a: 1, b: 2 }]);
  assert.deepEqual(csvToJson(''), []);
  assert.deepEqual(csvToJson('a,b'), []);
  assert.throws(() => csvToJson('a,b\n1,2,3'), /Row 2 has 3 cells but the header has only 2 columns/);
  assert.throws(() => csvToJson('a,a\n1,2'), /column "a" more than once/);
  assert.throws(() => csvToJson('a,\n1,2'), /empty column name/);
  for (const [text, value] of [['1.0', 1], ['-0', -0], ['1.5e-3', 0.0015], ['0.5', 0.5], ['.5', '.5'], ['1.', '1.'], ['+1', '+1'], ['0x10', '0x10'], ['1_000', '1_000'], ['NaN', 'NaN'], ['Infinity', 'Infinity'], ['01', '01'], [' 1', ' 1'], ['1e999', '1e999']]) {
    assert.deepEqual(csvToJson(`v\n${text}`)[0].v, value, text);
  }
});

test('csvToJson can rebuild nested objects and arrays from dotted and indexed column names', () => {
  const csv = 'name,address.city,address.zip,tags[0],tags[1],deep.a.b\nAnn,Rome,00100,x,y,1';
  assert.deepEqual(csvToJson(csv, { unflatten: true }), [{ name: 'Ann', address: { city: 'Rome', zip: '00100' }, tags: ['x', 'y'], deep: { a: { b: 1 } } }]);
  assert.deepEqual(csvToJson(csv)[0]['address.city'], 'Rome', 'without unflatten the headers stay as they are');
  assert.throws(() => csvToJson('a,a.b\n1,2', { unflatten: true }), /clashes with a column that holds a plain value at "a"/);
  assert.throws(() => csvToJson('a.b,a\n1,2', { unflatten: true }), /clashes with another column/);
});

test('JSON to CSV and back gives the same data (nested, with arrays spread into columns)', () => {
  const data = [
    { id: 1, name: 'Ann', address: { city: 'Rome', zip: '00100' }, tags: ['a', 'b'] },
    { id: 2, name: 'Bob', address: { city: 'Oslo', zip: '0150' }, tags: ['c', 'd'] },
  ];
  const csv = jsonToCsv(data, { arrays: 'index' });
  assert.deepEqual(csvToJson(csv, { unflatten: true }), data);
  assert.deepEqual(csvToJson(jsonToCsv(data, { delimiter: '\t' }), { delimiter: '\t', unflatten: true }).map((r) => r.id), [1, 2]);
});

// ---- cross-checks against Python's csv module -----------------------------------------------------------
const REFERENCE = `
import sys, csv, json, io
cases = json.load(sys.stdin)
out = []
for case in cases:
    d = case['delimiter']
    parsed = [r for r in csv.reader(io.StringIO(case['text'], newline=''), delimiter=d) if r]
    buf = io.StringIO(newline='')
    csv.writer(buf, delimiter=d, lineterminator='\\r\\n').writerows(case['rows'])
    out.append({'parsed': parsed, 'written': buf.getvalue()})
print(json.dumps(out))
`;

test('cross-check: parsing and writing agree with Python\'s csv module on 400 random tables', { skip: !pythonHas('csv') && 'python3 is not installed' }, () => {
  const r = seeded(31);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const cells = ['', 'a', 'b c', 'x,y', 'q"uote', 'line\nbreak', 'cr\rhere', 'crlf\r\nhere', ';semi', '\ttab', ' lead', 'trail ', 'ünï😀', '"', '""', ',', '|pipe', '"quoted"', "it's", '0123', '\\'];
  const word = () => Array.from({ length: Math.floor(r() * 6) }, () => 'ab,;|"\n\r\t é'[Math.floor(r() * 11)]).join('');
  const cases = [];
  for (let t = 0; t < 400; t++) {
    const delimiter = pick([',', ',', ';', '\t', '|']);
    const width = 1 + Math.floor(r() * 5);
    const rows = Array.from({ length: 1 + Math.floor(r() * 5) }, () => Array.from({ length: width }, () => (r() < 0.7 ? pick(cells) : word())));
    cases.push({ delimiter, rows, text: toCsv(rows, { delimiter, eol: '\r\n' }) });
  }
  const reference = python(REFERENCE, cases);
  cases.forEach((c, i) => {
    assert.deepEqual(parseCsv(c.text, { delimiter: c.delimiter }), c.rows, `case ${i}: my reader reads my writer`);
    assert.deepEqual(reference[i].parsed, c.rows, `case ${i}: Python reads my writer`);
    // Python ends the last row with a line break too; apart from that the text must be identical
    assert.equal(`${c.text}\r\n`, reference[i].written, `case ${i}: my writer and Python's writer produce the same text`);
    assert.deepEqual(parseCsv(reference[i].written, { delimiter: c.delimiter }), c.rows, `case ${i}: my reader reads Python's writer`);
  });
});
