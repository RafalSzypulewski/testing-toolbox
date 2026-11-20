// Text diffing: Myers' O(ND) algorithm on lines, words or characters, plus
// inline highlighting inside changed lines and unified-diff output. No DOM access.

export const MAX_LINES = 20000;
export const MAX_TOKENS = 50000;

// ---- core: shortest edit script ------------------------------------------------

function myers(a, b, maxD) {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((_, j) => ({ type: 'insert', a: -1, b: j }));
  if (m === 0) return a.map((_, i) => ({ type: 'delete', a: i, b: -1 }));

  const max = Math.min(n + m, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;

  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2)); // state before round d, only the part round d can read
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }
  if (found < 0) return null; // more than maxD differences

  const ops = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const t = trace[d];
    const get = (k) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const prevX = get(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ type: 'equal', a: x, b: y });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        ops.push({ type: 'insert', a: -1, b: y });
      } else {
        x--;
        ops.push({ type: 'delete', a: x, b: -1 });
      }
    }
  }
  return ops.reverse();
}

/**
 * Diffs two arrays of comparable keys.
 * Returns ops in order: {type: 'equal'|'delete'|'insert', a: indexInA|-1, b: indexInB|-1}.
 * If the inputs differ by more than `maxD` edits the middle section is reported as
 * one block of deletes followed by inserts instead of failing.
 */
export function diffArrays(a, b, { maxD = 2000 } = {}) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', a: i, b: i });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const mid = myers(midA, midB, maxD);
  if (mid) {
    for (const op of mid) ops.push({ type: op.type, a: op.a < 0 ? -1 : op.a + start, b: op.b < 0 ? -1 : op.b + start });
  } else {
    for (let i = 0; i < midA.length; i++) ops.push({ type: 'delete', a: start + i, b: -1 });
    for (let j = 0; j < midB.length; j++) ops.push({ type: 'insert', a: -1, b: start + j });
  }
  for (let i = endA, j = endB; i < a.length; i++, j++) ops.push({ type: 'equal', a: i, b: j });
  return ops;
}

// ---- normalisation ---------------------------------------------------------------

const keyOf = (token, { ignoreWhitespace, ignoreCase }) => {
  let k = token;
  if (ignoreWhitespace) k = /^\s+$/.test(k) ? ' ' : k.trim().replace(/\s+/g, ' ');
  return ignoreCase ? k.toLowerCase() : k;
};

export function lineEndings(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf && 'CRLF', lf && 'LF', cr && 'CR'].filter(Boolean);
  return kinds.length === 0 ? 'none' : kinds.length === 1 ? kinds[0] : 'mixed';
}

export function splitLines(text) {
  if (text === '') return { lines: [], finalNewline: false };
  const t = text.replace(/\r\n|\r/g, '\n');
  const finalNewline = t.endsWith('\n');
  return { lines: (finalNewline ? t.slice(0, -1) : t).split('\n'), finalNewline };
}

const WORD_TOKENS = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
export const tokenizeWords = (text) => text.match(WORD_TOKENS) ?? [];

function mergeParts(parts) {
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.type === p.type) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

// ---- word / character diff -------------------------------------------------------

/** Diff of two token arrays as merged parts: [{text, type: 'equal'|'delete'|'insert'}]. */
function tokenParts(ta, tb, opts) {
  const ops = diffArrays(ta.map((t) => keyOf(t, opts)), tb.map((t) => keyOf(t, opts)));
  return mergeParts(ops.map((op) => ({ type: op.type, text: op.type === 'insert' ? tb[op.b] : ta[op.a] })));
}

/** Inline highlighting for one changed line pair: both sides as [{text, changed}]. */
export function inlineDiff(a, b, opts = {}) {
  const ta = tokenizeWords(a);
  const tb = tokenizeWords(b);
  const ops = diffArrays(ta.map((t) => keyOf(t, opts)), tb.map((t) => keyOf(t, opts)));
  const side = (skip, tokens, index) =>
    mergeParts(ops.filter((o) => o.type !== skip).map((o) => ({ type: o.type, text: tokens[o[index]] }))).map((p) => ({
      text: p.text,
      changed: p.type !== 'equal',
    }));
  return { aParts: side('insert', ta, 'a'), bParts: side('delete', tb, 'b') };
}

/** Whole-text diff by words or characters. */
export function textDiff(a, b, { mode = 'words', ...opts } = {}) {
  const tokens = mode === 'chars' ? (t) => Array.from(t) : tokenizeWords;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length > MAX_TOKENS || tb.length > MAX_TOKENS) {
    throw new RangeError(`Texts are too long to compare by ${mode === 'chars' ? 'character' : 'word'} (limit ${MAX_TOKENS.toLocaleString('en-US')}). Use line mode.`);
  }
  const parts = tokenParts(ta, tb, opts);
  return {
    parts,
    identical: parts.every((p) => p.type === 'equal'),
    stats: {
      removed: parts.filter((p) => p.type === 'delete').reduce((n, p) => n + Array.from(p.text).length, 0),
      added: parts.filter((p) => p.type === 'insert').reduce((n, p) => n + Array.from(p.text).length, 0),
    },
  };
}

// ---- line diff -------------------------------------------------------------------

/**
 * Side-by-side rows: {type: 'equal'|'change'|'delete'|'insert', a, b, aLine, bLine, inline?}
 * ('change' = a line replaced by another; `inline` highlights the changed words.)
 */
export function lineDiff(textA, textB, { inline = true, ...opts } = {}) {
  const A = splitLines(textA);
  const B = splitLines(textB);
  if (A.lines.length > MAX_LINES || B.lines.length > MAX_LINES) {
    throw new RangeError(`Each text may have at most ${MAX_LINES.toLocaleString('en-US')} lines.`);
  }
  const ops = diffArrays(A.lines.map((l) => keyOf(l, opts)), B.lines.map((l) => keyOf(l, opts)));

  const rows = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      const { a, b } = ops[i++];
      rows.push({ type: 'equal', a: A.lines[a], b: B.lines[b], aLine: a + 1, bLine: b + 1 });
      continue;
    }
    const dels = [];
    const ins = [];
    while (i < ops.length && ops[i].type !== 'equal') (ops[i].type === 'delete' ? dels : ins).push(ops[i++]);
    const paired = Math.min(dels.length, ins.length);
    for (let p = 0; p < paired; p++) {
      const a = A.lines[dels[p].a];
      const b = B.lines[ins[p].b];
      rows.push({ type: 'change', a, b, aLine: dels[p].a + 1, bLine: ins[p].b + 1, ...(inline ? { inline: inlineDiff(a, b, opts) } : {}) });
    }
    for (const d of dels.slice(paired)) rows.push({ type: 'delete', a: A.lines[d.a], b: null, aLine: d.a + 1, bLine: null });
    for (const n of ins.slice(paired)) rows.push({ type: 'insert', a: null, b: B.lines[n.b], aLine: null, bLine: n.b + 1 });
  }

  const count = (t) => rows.filter((r) => r.type === t).length;
  const notes = [];
  const ea = lineEndings(textA);
  const eb = lineEndings(textB);
  if (ea === 'mixed') notes.push('Text A has mixed line endings.');
  if (eb === 'mixed') notes.push('Text B has mixed line endings.');
  if (ea !== 'none' && eb !== 'none' && ea !== eb && ea !== 'mixed' && eb !== 'mixed') {
    notes.push(`Line endings differ: A uses ${ea}, B uses ${eb}. Lines are compared without their endings.`);
  }
  if (A.lines.length && B.lines.length && A.finalNewline !== B.finalNewline) {
    notes.push(`${A.finalNewline ? 'Text A' : 'Text B'} ends with a line break and ${A.finalNewline ? 'text B' : 'text A'} does not.`);
  }
  return {
    rows,
    notes,
    identical: rows.every((r) => r.type === 'equal'),
    stats: { added: count('insert'), removed: count('delete'), changed: count('change'), unchanged: count('equal') },
  };
}

/** Replaces long runs of unchanged rows with {type: 'skip', count}, keeping `context` rows around changes. */
export function collapse(rows, context = 3) {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.type === 'equal') return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
  });
  const out = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (skipped) out.push({ type: 'skip', count: skipped });
      skipped = 0;
      out.push(r);
    } else skipped++;
  });
  if (skipped && out.length) out.push({ type: 'skip', count: skipped });
  return out;
}

/** Standard unified diff text (what `diff -u` / `git diff` print). */
export function toUnified(rows, { context = 3, nameA = 'a', nameB = 'b' } = {}) {
  // flatten: within a changed block all deletions come before all insertions
  const lines = [];
  let dels = [];
  let ins = [];
  const flush = () => {
    lines.push(...dels, ...ins);
    dels = [];
    ins = [];
  };
  for (const r of rows) {
    if (r.type === 'equal') {
      flush();
      lines.push({ op: ' ', text: r.a, aLine: r.aLine, bLine: r.bLine });
    } else {
      if (r.a !== null) dels.push({ op: '-', text: r.a, aLine: r.aLine });
      if (r.b !== null) ins.push({ op: '+', text: r.b, bLine: r.bLine });
    }
  }
  flush();

  const changed = lines.map((l) => l.op !== ' ');
  if (!changed.some(Boolean)) return '';
  const keep = new Array(lines.length).fill(false);
  changed.forEach((c, i) => {
    if (c) for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });

  const out = [`--- ${nameA}`, `+++ ${nameB}`];
  let aSeen = 0;
  let bSeen = 0;
  let i = 0;
  while (i < lines.length) {
    if (!keep[i]) {
      if (lines[i].op !== '+') aSeen++;
      if (lines[i].op !== '-') bSeen++;
      i++;
      continue;
    }
    const startA = aSeen;
    const startB = bSeen;
    const hunk = [];
    while (i < lines.length && keep[i]) {
      hunk.push(`${lines[i].op}${lines[i].text}`);
      if (lines[i].op !== '+') aSeen++;
      if (lines[i].op !== '-') bSeen++;
      i++;
    }
    const countA = aSeen - startA;
    const countB = bSeen - startB;
    out.push(`@@ -${countA ? startA + 1 : startA},${countA} +${countB ? startB + 1 : startB},${countB} @@`, ...hunk);
  }
  return out.join('\n');
}
