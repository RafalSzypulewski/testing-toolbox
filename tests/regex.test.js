import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRegex, segments, compile, PRESETS } from '../js/lib/regex.js';

test('finds matches with index, position and capture groups', () => {
  const r = runRegex({ pattern: '(\\d+)-(\\w+)?', flags: 'g', text: 'ab 12-x\n7-' });
  assert.equal(r.ok, true);
  assert.equal(r.matches.length, 2);
  assert.deepEqual(
    { index: r.matches[0].index, value: r.matches[0].value, groups: r.matches[0].groups, line: r.matches[0].line, column: r.matches[0].column },
    { index: 3, value: '12-x', groups: ['12', 'x'], line: 1, column: 4 },
  );
  assert.deepEqual(r.matches[1].groups, ['7', null]); // unmatched optional group
  assert.equal(r.matches[1].line, 2);
  assert.equal(r.matches[1].column, 1);
});

test('named groups are returned', () => {
  const r = runRegex({ pattern: '(?<y>\\d{4})-(?<m>\\d{2})', text: '2026-11' });
  assert.deepEqual(r.matches[0].named, { y: '2026', m: '11' });
});

test('finds every match even without the g flag, but replace honours the flags', () => {
  const r = runRegex({ pattern: 'a', flags: '', text: 'aaa', replacement: 'b' });
  assert.equal(r.matches.length, 3);
  assert.equal(r.replaced, 'baa');
  assert.equal(runRegex({ pattern: 'a', flags: 'g', text: 'aaa', replacement: 'b' }).replaced, 'bbb');
});

test('replacement supports $1, $<name> and $&', () => {
  assert.equal(runRegex({ pattern: '(\\w+) (\\w+)', flags: 'g', text: 'hello world', replacement: '$2 $1' }).replaced, 'world hello');
  assert.equal(runRegex({ pattern: '(?<a>\\d)', flags: 'g', text: '1-2', replacement: '[$<a>]' }).replaced, '[1]-[2]');
  assert.equal(runRegex({ pattern: 'x', flags: 'g', text: 'axb', replacement: '<$&>' }).replaced, 'a<x>b');
  assert.equal(runRegex({ pattern: 'x', text: 'axb' }).replaced, null);
});

test('empty matches do not loop forever and advance over emoji', () => {
  const r = runRegex({ pattern: 'a*', text: 'baab' });
  assert.deepEqual(r.matches.map((m) => [m.index, m.value]), [[0, ''], [1, 'aa'], [3, ''], [4, '']]);
  const u = runRegex({ pattern: '', flags: 'u', text: '😀' });
  assert.deepEqual(u.matches.map((m) => m.index), [0, 2]);
  const noU = runRegex({ pattern: '', text: '😀' });
  assert.deepEqual(noU.matches.map((m) => m.index), [0, 1, 2]);
});

test('match limit truncates', () => {
  const r = runRegex({ pattern: 'a', text: 'a'.repeat(50), limit: 10 });
  assert.equal(r.matches.length, 10);
  assert.equal(r.truncated, true);
  assert.equal(runRegex({ pattern: 'a', text: 'aaa', limit: 3 }).truncated, false);
});

test('errors are reported, not thrown', () => {
  assert.match(runRegex({ pattern: '(', text: 'x' }).error, /Invalid regular expression/);
  assert.match(runRegex({ pattern: 'a', flags: 'z', text: 'x' }).error, /Unknown flag "z"/);
  assert.match(runRegex({ pattern: 'a', flags: 'ii', text: 'x' }).error, /only be used once/);
  assert.equal(runRegex({ pattern: 'a', flags: 'u', text: '' }).ok, true);
  assert.throws(() => compile('(', ''));
});

test('flags i, m, s and y change behaviour', () => {
  assert.equal(runRegex({ pattern: 'abc', flags: 'i', text: 'ABC' }).matches.length, 1);
  assert.equal(runRegex({ pattern: '^b', flags: 'm', text: 'a\nb' }).matches.length, 1);
  assert.equal(runRegex({ pattern: '^b', flags: '', text: 'a\nb' }).matches.length, 0);
  assert.equal(runRegex({ pattern: 'a.b', flags: 's', text: 'a\nb' }).matches.length, 1);
  assert.equal(runRegex({ pattern: 'a', flags: 'y', text: 'aab' }).matches.length, 2);
});

test('segments reconstruct the text and mark matches', () => {
  const text = 'ab 12 cd 345';
  const { matches } = runRegex({ pattern: '\\d+', text });
  const segs = segments(text, matches);
  assert.equal(segs.map((s) => s.text).join(''), text);
  assert.deepEqual(segs.filter((s) => s.match).map((s) => s.text), ['12', '345']);
  assert.deepEqual(segments('abc', runRegex({ pattern: '', text: 'abc' }).matches).map((s) => s.text), ['abc']);
  assert.deepEqual(segments('', []), []);
});

test('line and column are right for many lines', () => {
  const text = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n');
  const r = runRegex({ pattern: 'line(\\d+)', text });
  const last = r.matches.at(-1);
  assert.equal(last.line, 500);
  assert.equal(last.column, 1);
  assert.equal(r.matches[9].line, 10);
});

test('every preset compiles and matches its own sample', () => {
  for (const p of PRESETS) {
    const r = runRegex({ pattern: p.pattern, flags: p.flags, text: p.sample });
    assert.equal(r.ok, true, p.label);
    assert.ok(r.matches.length >= 1, `${p.label} found nothing`);
  }
  const ip = PRESETS.find((p) => p.label.startsWith('IPv4'));
  assert.deepEqual(runRegex({ pattern: ip.pattern, flags: 'g', text: ip.sample }).matches.map((m) => m.value), ['192.168.0.1', '10.0.0.255']);
});
