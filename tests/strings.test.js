import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterString, randomString, CHARSETS } from '../js/lib/strings.js';

test('counterString matches the classic example', () => {
  assert.equal(counterString(10), '*3*5*7*10*');
  assert.equal(counterString(1), '*');
  assert.equal(counterString(2), '2*');
  assert.equal(counterString(3), '*3*');
});

test('counterString always has the requested length and correct positions', () => {
  for (const n of [1, 2, 9, 10, 11, 99, 100, 101, 255, 256, 1000, 9999, 10000, 65535, 100000]) {
    const s = counterString(n, '#');
    assert.equal(s.length, n, `length for ${n}`);
    // each number must equal the index (1-based) of the marker that follows it
    for (const m of s.matchAll(/(\d+)#/g)) {
      assert.equal(m.index + m[1].length + 1, Number(m[1]), `position in ${n}`);
    }
  }
});

test('counterString validates input', () => {
  assert.throws(() => counterString(0), RangeError);
  assert.throws(() => counterString(-5), RangeError);
  assert.throws(() => counterString(1.5), RangeError);
  assert.throws(() => counterString('abc'), RangeError);
  assert.throws(() => counterString('', '*'), RangeError);
  assert.throws(() => counterString(10, ''), RangeError);
  assert.throws(() => counterString(10, '**'), RangeError);
  assert.throws(() => counterString(10, '5'), RangeError);
  assert.throws(() => counterString(1_000_001), RangeError);
});

test('randomString has exact length and only allowed characters', () => {
  const s = randomString({ length: 500, charset: 'abc' });
  assert.equal(s.length, 500);
  assert.match(s, /^[abc]+$/);
});

test('randomString supports unicode charsets by code point', () => {
  const s = randomString({ length: 20, charset: '😀🚀' });
  assert.equal(Array.from(s).length, 20);
});

test('randomString spaces respect range and never lead, trail or double up', () => {
  for (let run = 0; run < 50; run++) {
    const s = randomString({ length: 200, charset: 'x', spaces: { min: 3, max: 6 } });
    assert.equal(s.length, 200);
    assert.ok(!s.startsWith(' ') && !s.endsWith(' '));
    assert.ok(!s.includes('  '));
    const words = s.split(' ');
    for (const w of words.slice(0, -1)) assert.ok(w.length >= 3 && w.length <= 6, `word length ${w.length}`);
  }
});

test('randomString line breaks keep exact length for LF and CRLF', () => {
  for (const newline of ['\n', '\r\n']) {
    for (let run = 0; run < 50; run++) {
      const s = randomString({
        length: 300,
        charset: CHARSETS.letters,
        spaces: { min: 2, max: 5 },
        newlines: { min: 10, max: 20 },
        newline,
      });
      assert.equal(s.length, 300);
      assert.ok(s.includes(newline));
      assert.ok(!s.startsWith(newline) && !s.endsWith(newline.slice(-1)));
    }
  }
});

test('randomString is deterministic with a seeded rng and validates input', () => {
  const seeded = () => {
    let x = 1;
    return () => ((x = (x * 16807) % 2147483647) / 2147483647);
  };
  const a = randomString({ length: 30, charset: CHARSETS.alphanumeric, rng: seeded() });
  const b = randomString({ length: 30, charset: CHARSETS.alphanumeric, rng: seeded() });
  assert.equal(a, b);
  assert.throws(() => randomString({ length: 10, charset: '' }), RangeError);
  assert.throws(() => randomString({ length: 10, charset: 'a', spaces: { min: 5, max: 2 } }), RangeError);
  assert.throws(() => randomString({ length: 10, charset: 'a', newlines: { min: 0, max: 2 } }), RangeError);
});
