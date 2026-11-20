import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  visualize, inspect, base64Encode, base64Decode, urlEncode, urlDecode,
  htmlEscape, htmlUnescape, unicodeEscape, unicodeUnescape,
} from '../js/lib/text.js';
import { formatJson } from '../js/lib/json.js';
import { decodeJwt } from '../js/lib/jwt.js';
import { parseInstant, formatInZone, relative, isValidTimeZone } from '../js/lib/time.js';

test('visualize reveals hidden characters', () => {
  assert.equal(visualize('a\tb'), 'a\\tb');
  assert.equal(visualize('zero​width'), 'zero\\u{200b}width');
  assert.equal(visualize('a\u0000b'), 'a\\u{0}b');
  assert.equal(visualize('plain ąę 😀'), 'plain ąę 😀');
});

test('inspect counts characters the different ways', () => {
  const r = inspect('a😀é');
  assert.equal(r.codePoints, 3);
  assert.equal(r.utf16Units, 4);
  assert.equal(r.utf8Bytes, 1 + 4 + 2);
  assert.equal(r.nonAscii, 2);
  assert.equal(inspect('').lines, 0);
  assert.equal(inspect('a\r\nb\nc\rd').lines, 4);
  assert.deepEqual(inspect('a\r\nb\nc\rd').lineBreaks, { lf: 1, crlf: 1, cr: 1 });
  assert.equal(inspect('x​y').invisible, 1);
  assert.equal(inspect(' x').leadingTrailingSpace, true);
});

test('base64 round-trips unicode and supports url-safe', () => {
  const text = 'Zażółć gęślą jaźń 😀 ??>>';
  assert.equal(base64Decode(base64Encode(text)), text);
  const url = base64Encode(text, { url: true });
  assert.ok(!/[+/=]/.test(url));
  assert.equal(base64Decode(url), text);
  assert.equal(base64Encode('hello'), 'aGVsbG8=');
  assert.throws(() => base64Decode('not base64!!'));
  assert.throws(() => base64Decode('/w=='), /UTF-8/);
});

test('url, html and unicode escapes round-trip', () => {
  const s = 'a b&c=d/ł?😀';
  assert.equal(urlDecode(urlEncode(s)), s);
  assert.equal(urlDecode('a+b%20c'), 'a b c');
  assert.throws(() => urlDecode('%E0%A4%A'));
  const html = `<a href="x">Tom & 'Jerry'</a>`;
  assert.equal(htmlUnescape(htmlEscape(html)), html);
  assert.equal(htmlUnescape('&#65;&#x42;&nbsp;&unknown;'), 'AB &unknown;');
  const u = 'zażółć 😀';
  assert.equal(unicodeEscape(u), 'za\\u017c\\u00f3\\u0142\\u0107 \\ud83d\\ude00');
  assert.equal(unicodeUnescape(unicodeEscape(u)), u);
  assert.equal(unicodeUnescape('\\u{1F600}'), '😀');
});

test('formatJson formats, minifies, sorts and locates errors', () => {
  assert.deepEqual(formatJson('{"b":1,"a":[1,2]}', { indent: 2 }), {
    ok: true,
    output: '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}',
  });
  assert.equal(formatJson('{ "a" : 1 }', { indent: 0 }).output, '{"a":1}');
  assert.equal(formatJson('{"b":1,"a":{"d":1,"c":2}}', { indent: 0, sortKeys: true }).output, '{"a":{"c":2,"d":1},"b":1}');
  assert.equal(formatJson('{"a":1}', { indent: '\t' }).output, '{\n\t"a": 1\n}');
  const bad = formatJson('{\n  "a": 1,\n  "b": \n}');
  assert.equal(bad.ok, false);
  assert.equal(bad.line, 4);
  assert.equal(formatJson('   ').ok, false);
});

test('decodeJwt decodes header, payload and expiry', () => {
  const enc = (o) => base64Encode(JSON.stringify(o), { url: true });
  const token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: 'x', iat: 1700000000, exp: 1800000000 })}.sig`;
  const d = decodeJwt(`Bearer ${token}`, 1750000000_000);
  assert.equal(d.header.alg, 'HS256');
  assert.equal(d.payload.sub, 'x');
  assert.equal(d.status, 'Not expired');
  assert.equal(d.times.find((t) => t.claim === 'exp').iso, '2027-01-15T08:00:00.000Z');
  assert.equal(decodeJwt(token, 1900000000_000).status, 'Expired');
  assert.throws(() => decodeJwt('abc'));
  assert.throws(() => decodeJwt('a.b.c'));
});

test('timestamp parsing and formatting', () => {
  assert.equal(parseInstant('1700000000').unit, 'seconds');
  assert.equal(parseInstant('1700000000').date.toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(parseInstant('1700000000000').unit, 'milliseconds');
  assert.equal(parseInstant('2026-11-20T10:00:00Z').date.getTime(), Date.UTC(2026, 10, 20, 10));
  assert.throws(() => parseInstant('nonsense'));
  assert.throws(() => parseInstant(''));
  assert.match(formatInZone(new Date(Date.UTC(2026, 10, 20, 10)), 'UTC'), /^2026-11-20 10:00:00/);
  assert.match(formatInZone(new Date(Date.UTC(2026, 10, 20, 10)), 'Europe/Warsaw'), /^2026-11-20 11:00:00/);
  assert.equal(isValidTimeZone('Europe/Warsaw'), true);
  assert.equal(isValidTimeZone('Mars/Base'), false);
  const now = Date.UTC(2026, 10, 20);
  assert.equal(relative(new Date(now - 3 * 86400_000), now), '3 days ago');
  assert.equal(relative(new Date(now + 2 * 3600_000), now), 'in 2 hours');
});
