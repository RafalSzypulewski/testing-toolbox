import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffArrays, lineDiff, textDiff, inlineDiff, collapse, toUnified, splitLines, lineEndings, tokenizeWords,
} from '../js/lib/diff.js';

// small deterministic PRNG
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function lcsLength(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  return t[a.length][b.length];
}

function apply(ops, a, b) {
  // rebuild both inputs from the ops to prove they are consistent and complete
  const ra = [];
  const rb = [];
  for (const op of ops) {
    if (op.type !== 'insert') ra.push(a[op.a]);
    if (op.type !== 'delete') rb.push(b[op.b]);
    if (op.type === 'equal') assert.equal(a[op.a], b[op.b]);
  }
  assert.deepEqual(ra, a);
  assert.deepEqual(rb, b);
}

test('diffArrays gives a minimal, consistent edit script (random vs brute-force LCS)', () => {
  const r = rng(42);
  for (let trial = 0; trial < 600; trial++) {
    const alphabet = 1 + Math.floor(r() * 4);
    const make = () => Array.from({ length: Math.floor(r() * 14) }, () => String(Math.floor(r() * alphabet)));
    const a = make();
    const b = make();
    const ops = diffArrays(a, b);
    apply(ops, a, b);
    const equal = ops.filter((o) => o.type === 'equal').length;
    assert.equal(equal, lcsLength(a, b), `a=${a} b=${b}`);
  }
});

test('diffArrays handles empty, identical and fully different inputs', () => {
  assert.deepEqual(diffArrays([], []), []);
  assert.deepEqual(diffArrays([], ['x']).map((o) => o.type), ['insert']);
  assert.deepEqual(diffArrays(['x'], []).map((o) => o.type), ['delete']);
  assert.ok(diffArrays(['a', 'b'], ['a', 'b']).every((o) => o.type === 'equal'));
  const ops = diffArrays(['a', 'b'], ['c', 'd']);
  assert.equal(ops.filter((o) => o.type === 'equal').length, 0);
});

test('diffArrays stays correct on larger inputs and when the edit limit is exceeded', () => {
  const r = rng(7);
  const a = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  const b = a.filter(() => r() > 0.02).map((l) => (r() < 0.02 ? `${l} changed` : l));
  const ops = diffArrays(a, b);
  apply(ops, a, b);
  assert.ok(ops.filter((o) => o.type === 'equal').length > 2800);
  // limit exceeded: falls back to delete-all then insert-all for the differing middle
  const x = Array.from({ length: 400 }, (_, i) => `x${i}`);
  const y = Array.from({ length: 400 }, (_, i) => `y${i}`);
  const fallback = diffArrays(['same', ...x, 'end'], ['same', ...y, 'end'], { maxD: 50 });
  apply(fallback, ['same', ...x, 'end'], ['same', ...y, 'end']);
  assert.equal(fallback.filter((o) => o.type === 'equal').length, 2);
});

test('lineDiff produces equal, change, delete and insert rows with line numbers', () => {
  const d = lineDiff('one\ntwo\nthree\nfour', 'one\n2\nthree\nfour\nfive');
  assert.deepEqual(d.rows.map((r) => r.type), ['equal', 'change', 'equal', 'equal', 'insert']);
  assert.deepEqual(d.stats, { added: 1, removed: 0, changed: 1, unchanged: 3 });
  assert.equal(d.rows[1].a, 'two');
  assert.equal(d.rows[1].b, '2');
  assert.equal(d.rows[1].aLine, 2);
  assert.equal(d.rows[4].bLine, 5);
  assert.equal(d.rows[4].aLine, null);
  const del = lineDiff('a\nb\nc', 'a\nc');
  assert.deepEqual(del.rows.map((r) => r.type), ['equal', 'delete', 'equal']);
  assert.equal(del.rows[2].bLine, 2);
  assert.equal(lineDiff('same\ntext', 'same\ntext').identical, true);
  assert.equal(lineDiff('', '').identical, true);
});

test('ignoreWhitespace and ignoreCase hide those differences', () => {
  assert.equal(lineDiff('a  b\n  c', 'a b\nc').identical, false);
  assert.equal(lineDiff('a  b\n  c', 'a b\nc', { ignoreWhitespace: true }).identical, true);
  assert.equal(lineDiff('Hello', 'hello').identical, false);
  assert.equal(lineDiff('Hello', 'hello', { ignoreCase: true }).identical, true);
});

test('line endings and final newline are reported, not silently hidden', () => {
  const d = lineDiff('a\r\nb\r\n', 'a\nb\n');
  assert.equal(d.identical, true);
  assert.ok(d.notes.some((n) => n.includes('CRLF') && n.includes('LF')));
  const e = lineDiff('a\nb\n', 'a\nb');
  assert.equal(e.identical, true);
  assert.ok(e.notes.some((n) => n.includes('ends with a line break')));
  assert.ok(lineDiff('a\r\nb\n', 'a').notes.some((n) => n.includes('mixed')));
  assert.equal(lineEndings('a\r\nb'), 'CRLF');
  assert.equal(lineEndings('a\nb'), 'LF');
  assert.equal(lineEndings('a\rb'), 'CR');
  assert.equal(lineEndings('abc'), 'none');
  assert.deepEqual(splitLines('a\n'), { lines: ['a'], finalNewline: true });
  assert.deepEqual(splitLines(''), { lines: [], finalNewline: false });
});

test('inline diff highlights only the changed words on each side', () => {
  const r = inlineDiff('the quick brown fox', 'the slow brown dog');
  assert.deepEqual(r.aParts.filter((p) => p.changed).map((p) => p.text), ['quick', 'fox']);
  assert.deepEqual(r.bParts.filter((p) => p.changed).map((p) => p.text), ['slow', 'dog']);
  assert.equal(r.aParts.map((p) => p.text).join(''), 'the quick brown fox');
  assert.equal(r.bParts.map((p) => p.text).join(''), 'the slow brown dog');
  const d = lineDiff('x = 1', 'x = 2');
  assert.ok(d.rows[0].inline.bParts.some((p) => p.changed && p.text === '2'));
  assert.equal(lineDiff('x = 1', 'x = 2', { inline: false }).rows[0].inline, undefined);
});

test('inline diff keeps each side\'s own text when ignoring whitespace and case', () => {
  const r = inlineDiff('Foo  bar', 'foo bar', { ignoreWhitespace: true, ignoreCase: true });
  assert.equal(r.aParts.map((p) => p.text).join(''), 'Foo  bar');
  assert.equal(r.bParts.map((p) => p.text).join(''), 'foo bar');
  assert.ok(r.aParts.every((p) => !p.changed));
});

test('textDiff by words and characters', () => {
  const w = textDiff('the quick fox', 'the slow fox');
  assert.deepEqual(w.parts.map((p) => [p.type, p.text]), [['equal', 'the '], ['delete', 'quick'], ['insert', 'slow'], ['equal', ' fox']]);
  assert.equal(w.identical, false);
  const c = textDiff('kitten', 'sitting', { mode: 'chars' });
  assert.deepEqual(c.stats, { removed: 2, added: 3 });
  assert.equal(c.parts.filter((p) => p.type !== 'insert').map((p) => p.text).join(''), 'kitten');
  assert.equal(c.parts.filter((p) => p.type !== 'delete').map((p) => p.text).join(''), 'sitting');
  assert.equal(textDiff('😀 a', '😀 b', { mode: 'chars' }).stats.removed, 1);
  assert.equal(textDiff('same', 'same').identical, true);
  assert.deepEqual(tokenizeWords('a_b, c1!'), ['a_b', ',', ' ', 'c1', '!']);
});

test('collapse keeps context around changes and counts skipped rows', () => {
  const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
  const b = a.replace('l10', 'CHANGED');
  const rows = collapse(lineDiff(a, b).rows, 2);
  assert.deepEqual(rows.map((r) => r.type), ['skip', 'equal', 'equal', 'change', 'equal', 'equal', 'skip']);
  assert.equal(rows[0].count, 8);
  assert.equal(rows.at(-1).count, 7);
  assert.deepEqual(collapse(lineDiff('a', 'a').rows), []);
});

test('toUnified matches the standard format', () => {
  const a = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten';
  const b = 'one\ntwo\nthree\nfour\nFIVE\nsix\nseven\neight\nnine\nten';
  assert.equal(
    toUnified(lineDiff(a, b).rows, { context: 2, nameA: 'old.txt', nameB: 'new.txt' }),
    ['--- old.txt', '+++ new.txt', '@@ -3,5 +3,5 @@', ' three', ' four', '-five', '+FIVE', ' six', ' seven'].join('\n'),
  );
  assert.equal(toUnified(lineDiff('a', 'a').rows), '');
  // pure insertion at the start and deletion everywhere
  assert.ok(toUnified(lineDiff('b', 'a\nb').rows, { context: 0 }).includes('@@ -0,0 +1,1 @@\n+a'));
  assert.ok(toUnified(lineDiff('a\nb', '').rows).includes('@@ -1,2 +0,0 @@\n-a\n-b'));
  // changes far apart become separate hunks
  const far = lineDiff(Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n'), Array.from({ length: 30 }, (_, i) => (i === 2 || i === 27 ? 'X' : `l${i}`)).join('\n'));
  assert.equal(toUnified(far.rows, { context: 1 }).split('\n').filter((l) => l.startsWith('@@')).length, 2);
});

test('limits are enforced with clear errors', () => {
  assert.throws(() => lineDiff('x\n'.repeat(20001), 'y'), /at most 20,000 lines/);
  assert.throws(() => textDiff('a '.repeat(30000), 'b'), /too long/);
});
