// Semantic comparison of two JSON values. Key order never matters. Arrays can be compared by
// position, by best alignment, regardless of order, or by an identifying field. Paths can be
// ignored (with JSONPath), numbers compared with a tolerance, and so on. No DOM access.
import { query, normalizedPath, JsonPathError } from './jsonpath.js';
import { diffArrays } from './diff.js';

export class DiffError extends Error {}

const MAX_TABLE_CELLS = 4_000_000; // alignment table size when numbers are compared with a tolerance
const PAIR_THRESHOLD = 0.5; // two leftover items are treated as "the same item, edited" if at least this alike
const MAX_COST_PAIRS = 2500; // leftover containers are paired by edit cost only while there are at most this many combinations

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export const ARRAY_MODES = {
  smart: 'Best alignment: spot inserted and removed items, keep order',
  position: 'By position: item 1 with item 1, item 2 with item 2',
  unordered: 'Ignore order: the same items in any order',
  key: 'Match by an identifying field (such as id)',
};

/**
 * @typedef {{kind: 'added'|'removed'|'changed'|'type', path: string, leftPath: string|null, rightPath: string|null, left?: any, right?: any}} Difference
 * @param {*} left
 * @param {*} right
 * @param {{
 *   arrays?: 'smart'|'position'|'unordered'|'key', arrayKey?: string, ignore?: string[],
 *   numberTolerance?: number, ignoreCase?: boolean, trimStrings?: boolean, nullEqualsMissing?: boolean
 * }} options
 * @returns {{differences: Difference[], stats: {added: number, removed: number, changed: number, type: number, total: number}, warnings: string[]}}
 */
export function diffJson(left, right, options = {}) {
  const {
    arrays = 'smart', arrayKey = 'id', ignore = [], numberTolerance = 0, ignoreCase = false, trimStrings = false, nullEqualsMissing = false,
  } = options;
  if (!(arrays in ARRAY_MODES)) throw new DiffError(`Unknown array mode: ${arrays}`);
  if (!(numberTolerance >= 0) || !Number.isFinite(numberTolerance)) throw new DiffError('The number tolerance must be zero or more.');
  if (arrays === 'key' && String(arrayKey).trim() === '') throw new DiffError('Enter the name of the field that identifies each item.');

  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const a = prune(left, ignore);
  const b = prune(right, ignore);
  const differences = [];

  const str = (s) => (ignoreCase ? (trimStrings ? s.trim() : s).toLowerCase() : trimStrings ? s.trim() : s);
  const present = (o, k) => hasOwn(o, k) && !(nullEqualsMissing && o[k] === null);

  /** Equal under the options? Objects ignore key order; arrays are compared item by item. */
  const same = (x, y) => {
    if (x === y) return true;
    const t = typeOf(x);
    if (t !== typeOf(y)) return false;
    if (t === 'number') return Math.abs(x - y) <= numberTolerance;
    if (t === 'string') return str(x) === str(y);
    if (t === 'array') {
      if (x.length !== y.length) return false;
      return arrays === 'unordered' ? sameItemsAnyOrder(x, y) : x.every((item, i) => same(item, y[i]));
    }
    if (t === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const px = present(x, k);
        if (px !== present(y, k) || (px && !same(x[k], y[k]))) return false;
      }
      return true;
    }
    return false;
  };

  /** The same items, in any order (used at every level when arrays are compared regardless of order). */
  const sameItemsAnyOrder = (x, y) => {
    if (numberTolerance === 0) {
      const p = x.map(canon).sort();
      const q = y.map(canon).sort();
      return p.every((text, i) => text === q[i]);
    }
    const used = new Set();
    return x.every((item) => {
      const k = y.findIndex((other, i) => !used.has(i) && same(item, other));
      if (k >= 0) used.add(k);
      return k >= 0;
    });
  };

  // With no tolerance, "equal" means "same canonical text", which lets large arrays be hashed.
  const canon = (v) => {
    const t = typeOf(v);
    if (t === 'string') return JSON.stringify(str(v));
    if (t === 'array') return `[${(arrays === 'unordered' ? v.map(canon).sort() : v.map(canon)).join(',')}]`;
    if (t === 'object') return `{${Object.keys(v).filter((k) => present(v, k)).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    return String(v);
  };

  /** How alike two values are, from 0 to 1. */
  const similarity = (x, y) => {
    if (same(x, y)) return 1;
    if (isObject(x) && isObject(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      let equal = 0;
      for (const k of keys) if (hasOwn(x, k) && hasOwn(y, k) && same(x[k], y[k])) equal++;
      return keys.size ? equal / keys.size : 1;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const total = Math.max(x.length, y.length);
      return total ? x.filter((item) => y.some((other) => same(item, other))).length / total : 1;
    }
    return 0;
  };

  const record = (kind, leftPath, rightPath, lv, rv) => {
    const entry = {
      kind, path: normalizedPath(rightPath ?? leftPath), leftPath: leftPath ? normalizedPath(leftPath) : null, rightPath: rightPath ? normalizedPath(rightPath) : null,
    };
    if (kind !== 'added') entry.left = lv;
    if (kind !== 'removed') entry.right = rv;
    differences.push(entry);
  };

  const compare = (x, y, lp, rp) => {
    if (same(x, y)) return;
    const t = typeOf(x);
    if (t !== typeOf(y)) record('type', lp, rp, x, y);
    else if (t === 'array') compareArrays(x, y, lp, rp);
    else if (t === 'object') compareObjects(x, y, lp, rp);
    else record('changed', lp, rp, x, y);
  };

  const compareObjects = (x, y, lp, rp) => {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const px = present(x, k);
      const py = present(y, k);
      if (px && !py) record('removed', [...lp, k], null, x[k]);
      else if (!px && py) record('added', null, [...rp, k], undefined, y[k]);
      else if (px && py) compare(x[k], y[k], [...lp, k], [...rp, k]);
    }
  };

  // Reporting happens in document order: removed items just before the position where they were.
  const run = (events) => events.sort((p, q) => p.at - q.at).forEach((e) => e.run());
  const removed = (lp, i, v) => ({ at: i - 0.5, run: () => record('removed', [...lp, i], null, v) });
  const added = (rp, i, v) => ({ at: i, run: () => record('added', null, [...rp, i], undefined, v) });
  const edited = (lp, rp, li, lv, ri, rv) => ({ at: ri, run: () => compare(lv, rv, [...lp, li], [...rp, ri]) });

  /** How many differences turning one item into the other would be reported as. */
  const editCost = (x, y) => diffJson(x, y, { ...options, ignore: [] }).stats.total;

  /**
   * Items that found no exact partner. Alike containers count as one item edited. Of the rest, two
   * containers are paired when editing one into the other takes at most 2 differences (which is what
   * "remove one, add one" would cost anyway). Plain values are paired when the same number are left on
   * both sides. Everything else is reported as removed or added.
   */
  const pairLeftovers = (L, R, lp, rp) => {
    const pairs = [];
    const usedL = new Set();
    const usedR = new Set();
    const take = (a, b) => {
      usedL.add(a);
      usedR.add(b);
      pairs.push([a, b]);
    };
    const isContainer = (v) => v !== null && typeof v === 'object';
    L.forEach(([, lv], a) => {
      if (!isContainer(lv)) return;
      let best = -1;
      let bestScore = PAIR_THRESHOLD - 1e-9;
      R.forEach(([, rv], b) => {
        if (usedR.has(b) || typeOf(rv) !== typeOf(lv)) return;
        const score = similarity(lv, rv);
        if (score > bestScore) [best, bestScore] = [b, score];
      });
      if (best >= 0) take(a, best);
    });
    const restL = L.map((_, a) => a).filter((a) => !usedL.has(a) && isContainer(L[a][1]));
    const restR = R.map((_, b) => b).filter((b) => !usedR.has(b) && isContainer(R[b][1]));
    if (restL.length * restR.length <= MAX_COST_PAIRS) {
      for (const a of restL) {
        let best = -1;
        let bestCost = 3;
        for (const b of restR) {
          if (usedR.has(b) || typeOf(R[b][1]) !== typeOf(L[a][1])) continue;
          const cost = editCost(L[a][1], R[b][1]);
          if (cost < bestCost) [best, bestCost] = [b, cost];
        }
        if (best >= 0) take(a, best);
      }
    }
    const plainL = L.map((_, a) => a).filter((a) => !usedL.has(a) && !isContainer(L[a][1]));
    const plainR = R.map((_, b) => b).filter((b) => !usedR.has(b) && !isContainer(R[b][1]));
    if (plainL.length === plainR.length) plainL.forEach((a, k) => take(a, plainR[k]));

    const events = pairs.map(([a, b]) => edited(lp, rp, L[a][0], L[a][1], R[b][0], R[b][1]));
    L.forEach(([li, lv], a) => {
      if (!usedL.has(a)) events.push(removed(lp, li, lv));
    });
    R.forEach(([ri, rv], b) => {
      if (!usedR.has(b)) events.push(added(rp, ri, rv));
    });
    return events;
  };

  const compareArrays = (x, y, lp, rp) => {
    if (arrays === 'position') return comparePositions(x, y, lp, rp);
    if (arrays === 'unordered') return compareUnordered(x, y, lp, rp);
    if (arrays === 'key') return compareByKey(x, y, lp, rp);
    return compareAligned(x, y, lp, rp);
  };

  const comparePositions = (x, y, lp, rp) => {
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if (i >= y.length) record('removed', [...lp, i], null, x[i]);
      else if (i >= x.length) record('added', null, [...rp, i], undefined, y[i]);
      else compare(x[i], y[i], [...lp, i], [...rp, i]);
    }
  };

  const compareUnordered = (x, y, lp, rp) => {
    const usedR = new Set();
    const restL = [];
    if (numberTolerance === 0) {
      const buckets = new Map();
      y.forEach((v, ri) => {
        const k = canon(v);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(ri);
      });
      x.forEach((v, li) => {
        const list = buckets.get(canon(v));
        if (list?.length) usedR.add(list.shift());
        else restL.push([li, v]);
      });
    } else {
      if (x.length * y.length > MAX_TABLE_CELLS) warn('An array is large and numbers are compared with a tolerance, so matching may be slow.');
      x.forEach((v, li) => {
        const ri = y.findIndex((rv, k) => !usedR.has(k) && same(v, rv));
        if (ri >= 0) usedR.add(ri);
        else restL.push([li, v]);
      });
    }
    const restR = y.map((v, ri) => [ri, v]).filter(([ri]) => !usedR.has(ri));
    run(pairLeftovers(restL, restR, lp, rp));
  };

  /** Edit script between two arrays: [{type: 'equal'|'delete'|'insert', a, b}] */
  const align = (x, y) => {
    if (numberTolerance === 0) return diffArrays(x.map(canon), y.map(canon));
    if (x.length * y.length > MAX_TABLE_CELLS) {
      warn('An array is too large to align item by item while numbers are compared with a tolerance, so it was compared by position.');
      return null;
    }
    const n = x.length;
    const m = y.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) table[i][j] = same(x[i], y[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && same(x[i], y[j]) && table[i][j] === table[i + 1][j + 1] + 1) ops.push({ type: 'equal', a: i++, b: j++ });
      else if (j < m && (i >= n || table[i][j + 1] >= table[i + 1][j])) ops.push({ type: 'insert', a: -1, b: j++ });
      else ops.push({ type: 'delete', a: i++, b: -1 });
    }
    return ops;
  };

  const compareAligned = (x, y, lp, rp) => {
    const ops = align(x, y);
    if (!ops) return comparePositions(x, y, lp, rp);
    let gapL = [];
    let gapR = [];
    const flush = () => {
      if (gapL.length || gapR.length) {
        // inside a stretch of differences, the items at the same offset are compared with each other
        const common = Math.min(gapL.length, gapR.length);
        const events = [];
        for (let k = 0; k < common; k++) events.push(edited(lp, rp, gapL[k][0], gapL[k][1], gapR[k][0], gapR[k][1]));
        for (const [li, lv] of gapL.slice(common)) events.push(removed(lp, li, lv));
        for (const [ri, rv] of gapR.slice(common)) events.push(added(rp, ri, rv));
        run(events);
      }
      gapL = [];
      gapR = [];
    };
    for (const op of ops) {
      if (op.type === 'equal') flush();
      else if (op.type === 'delete') gapL.push([op.a, x[op.a]]);
      else gapR.push([op.b, y[op.b]]);
    }
    flush();
  };

  const compareByKey = (x, y, lp, rp) => {
    const keyOf = (item) => {
      if (!isObject(item) || !hasOwn(item, arrayKey)) return null;
      const v = item[arrayKey];
      return v === null || typeof v === 'object' ? null : `${typeof v}:${typeof v === 'string' ? str(v) : String(v)}`;
    };
    const indexOf = (list) => {
      const map = new Map();
      list.forEach((item, i) => {
        const k = keyOf(item);
        if (k !== null) map.set(k, [...(map.get(k) ?? []), i]);
      });
      return map;
    };
    const left = indexOf(x);
    const right = indexOf(y);
    if ([...left.values(), ...right.values()].some((positions) => positions.length > 1)) warn(`Some items share the same "${arrayKey}", so they were matched in the order they appear.`);

    const events = [];
    const leftover = { L: [], R: [] };
    const usedR = new Set();
    x.forEach((item, li) => {
      const k = keyOf(item);
      if (k === null) return leftover.L.push([li, item]);
      const ri = (right.get(k) ?? [])[left.get(k).indexOf(li)]; // the n-th item with a key pairs with the n-th on the other side
      if (ri === undefined) events.push(removed(lp, li, item));
      else {
        usedR.add(ri);
        events.push(edited(lp, rp, li, item, ri, y[ri]));
      }
      return undefined;
    });
    y.forEach((item, ri) => {
      if (keyOf(item) === null) leftover.R.push([ri, item]);
      else if (!usedR.has(ri)) events.push(added(rp, ri, item));
    });
    // items that lack the identifying field cannot be matched by it: line them up like the default mode does
    if (leftover.L.length || leftover.R.length) {
      const sub = diffJson(leftover.L.map(([, v]) => v), leftover.R.map(([, v]) => v), { ...options, arrays: 'smart', ignore: [] });
      const remap = (path, list) => (path ? path.replace(/^\$\[(\d+)\]/, (_, n) => `$[${list[Number(n)][0]}]`) : path);
      for (const d of sub.differences) {
        events.push({
          at: 1e9,
          run: () => differences.push({ ...d, leftPath: remap(d.leftPath, leftover.L), rightPath: remap(d.rightPath, leftover.R), path: d.rightPath ? remap(d.rightPath, leftover.R) : remap(d.leftPath, leftover.L) }),
        });
      }
      for (const w of sub.warnings) warn(w);
    }
    run(events);
  };

  compare(a, b, [], []);

  const stats = { added: 0, removed: 0, changed: 0, type: 0, total: differences.length };
  for (const d of differences) stats[d.kind]++;
  return { differences, stats, warnings };
}

/** A copy of the document without the nodes that the JSONPath queries select. */
function prune(doc, queries) {
  const wanted = (queries ?? []).map((q) => String(q).trim()).filter(Boolean);
  if (wanted.length === 0) return doc;
  const copy = JSON.parse(JSON.stringify(doc));
  const doomed = [];
  for (const q of wanted) {
    try {
      for (const m of query(copy, q)) if (m.path.length) doomed.push(m.path);
    } catch (err) {
      if (err instanceof JsonPathError) throw new DiffError(`The ignore path "${q}" is not valid: ${err.message}`);
      throw err;
    }
  }
  // delete from the end of each array first, so earlier positions do not shift
  const lastFirst = (p, q) => {
    for (let i = 0; i < Math.min(p.length, q.length); i++) {
      if (p[i] !== q[i]) return typeof p[i] === 'number' && typeof q[i] === 'number' ? q[i] - p[i] : String(q[i]).localeCompare(String(p[i]));
    }
    return q.length - p.length;
  };
  for (const path of doomed.sort(lastFirst)) {
    let node = copy;
    for (const step of path.slice(0, -1)) node = node?.[step];
    const last = path[path.length - 1];
    if (Array.isArray(node)) {
      if (last < node.length) node.splice(last, 1);
    } else if (node && typeof node === 'object') delete node[last];
  }
  return copy;
}
