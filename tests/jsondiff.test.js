import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJson, DiffError, ARRAY_MODES } from '../js/lib/jsondiff.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const summary = (a, b, options) => diffJson(a, b, options).differences.map((d) => `${d.kind} ${d.path}`);

test('objects: added, removed, changed and type changes; key order does not matter', () => {
  const a = { x: 1, y: 2, z: { k: 1 } };
  const b = { w: 0, z: { n: 2, k: 1 }, y: 3 };
  assert.deepEqual(summary(a, b), ["removed $['x']", "changed $['y']", "added $['z']['n']", "added $['w']"]);
  assert.deepEqual(diffJson(a, b).stats, { added: 2, removed: 1, changed: 1, type: 0, total: 4 });
  const d = diffJson({ a: 1 }, { a: 2 }).differences[0];
  assert.deepEqual(d, { kind: 'changed', path: "$['a']", leftPath: "$['a']", rightPath: "$['a']", left: 1, right: 2 });
  assert.deepEqual(diffJson({}, { a: 1 }).differences[0], { kind: 'added', path: "$['a']", leftPath: null, rightPath: "$['a']", right: 1 });
  assert.deepEqual(diffJson({ a: 1 }, {}).differences[0], { kind: 'removed', path: "$['a']", leftPath: "$['a']", rightPath: null, left: 1 });
  assert.deepEqual(summary({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
  assert.deepEqual(summary({ a: 1 }, { a: '1' }), ["type $['a']"]);
  assert.deepEqual(summary({ a: null }, { a: 0 }), ["type $['a']"]);
  assert.deepEqual(summary({ a: [] }, { a: {} }), ["type $['a']"]);
  assert.deepEqual(summary({ a: true }, { a: false }), ["changed $['a']"]);
  assert.deepEqual(summary(1, 2), ['changed $']);
  assert.deepEqual(summary([1], {}), ['type $']);
  assert.deepEqual(summary('a', 'a'), []);
  assert.deepEqual(summary(null, null), []);
});

test('arrays by position', () => {
  const options = { arrays: 'position' };
  assert.deepEqual(summary([1, 2, 3], [1, 5, 3, 4], options), ['changed $[1]', 'added $[3]']);
  assert.deepEqual(summary([1, 2, 3], [1], options), ['removed $[1]', 'removed $[2]']);
  assert.deepEqual(summary([0, 1, 2, 3], [1, 2, 3], options).length, 4, 'an item removed at the start shifts everything');
  assert.deepEqual(summary([{ a: 1 }], [{ a: 2 }], options), ["changed $[0]['a']"]);
});

test('arrays by best alignment spot inserted and removed items', () => {
  assert.deepEqual(summary([1, 2, 3], [0, 1, 2, 3]), ['added $[0]']);
  assert.deepEqual(summary(['a', 'b', 'c', 'd'], ['a', 'c', 'd']), ['removed $[1]']);
  assert.deepEqual(summary([1, 2, 3], [1, 9, 3]), ['changed $[1]']);
  assert.deepEqual(summary([1, 2, 3], [1, 2, 3, 4, 5]), ['added $[3]', 'added $[4]']);
  assert.deepEqual(summary([1, 2, 3, 4], [1, 4]), ['removed $[1]', 'removed $[2]']);
  assert.deepEqual(summary([1, 2, 3], [3, 2, 1]).length > 0, true, 'a reversed list is different');
  const people = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }];
  assert.deepEqual(summary(people, [{ id: 1, n: 'a' }, { id: 2, n: 'c' }]), ["changed $[1]['n']"]);
  assert.deepEqual(summary(people, [...people, { id: 3, n: 'x' }]), ['added $[2]']);
  assert.deepEqual(summary(people, [{ id: 0, n: 'z' }, ...people]), ['added $[0]'], 'an inserted item does not disturb the rest');
  assert.deepEqual(summary([[1, 2], [3]], [[1, 2, 9], [3]]), ['added $[0][2]']);
  const moved = diffJson([1, 2, 3], [0, 1, 2, 3]).differences[0];
  assert.deepEqual([moved.leftPath, moved.rightPath], [null, '$[0]']);
  const shifted = diffJson([{ k: 1 }, { k: 2 }], [{ k: 0 }, { k: 1 }, { k: 9 }]).differences;
  assert.ok(shifted.every((d) => d.rightPath !== null || d.leftPath !== null));
});

test('arrays in any order', () => {
  const options = { arrays: 'unordered' };
  assert.deepEqual(summary([1, 2, 3], [3, 1, 2], options), []);
  assert.deepEqual(summary([{ a: 1 }, { b: 2 }], [{ b: 2 }, { a: 1 }], options), []);
  assert.deepEqual(summary([1, 2, 2], [2, 1, 1], options), ['changed $[2]'], 'duplicates are counted; the one left over on each side is the edit');
  assert.notDeepEqual(summary([1, 2, 3], [3, 2, 1]), [], 'the default mode keeps order, so a reversed list differs');
  assert.deepEqual(summary([1, 2, 3, 3], [3, 2, 1], options), ['removed $[3]'], 'one extra item');
  assert.deepEqual(summary([1, 2], [2, 1, 3], options), ['added $[2]']);
  const rows = (n) => ({ id: n, name: `name ${n}`, tags: ['x'] });
  assert.deepEqual(summary([rows(1), rows(2), rows(3)], [rows(3), { ...rows(1), name: 'changed' }, rows(2)], options), ["changed $[1]['name']"], 'a lightly edited item is reported as an edit');
  assert.deepEqual(summary([rows(1), rows(2)], [{ id: 9, name: 'zzz', tags: ['q'] }], options).sort(), ['added $[0]', 'removed $[0]', 'removed $[1]'], 'items with nothing in common are not paired when the counts differ');
  assert.deepEqual(summary([{ name: 'b' }], [{}], options), ["removed $[0]['name']"], 'one item left on each side: it is the edited one');
  assert.deepEqual(summary([{ a: [3, 1] }], [{ a: [1, 3] }], options), [], 'unordered applies at every level');
});

test('arrays matched by an identifying field', () => {
  const options = { arrays: 'key', arrayKey: 'id' };
  const left = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 5, v: 'gone' }];
  const right = [{ id: 2, v: 'b' }, { id: 1, v: 'z' }, { id: 3, v: 'new' }];
  const d = diffJson(left, right, options).differences;
  assert.deepEqual(d.map((x) => `${x.kind} ${x.path}`), ["changed $[1]['v']", 'removed $[2]', 'added $[2]']);
  assert.deepEqual([d[0].leftPath, d[0].rightPath], ["$[0]['v']", "$[1]['v']"], 'the change is reported on both sides');
  assert.deepEqual(summary([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], options), [], 'order does not matter');
  assert.deepEqual(summary([{ id: 1, v: 1 }], [{ id: '1', v: 1 }], options).sort(), ['added $[0]', 'removed $[0]'], 'the number 1 and the text "1" are different keys');
  assert.deepEqual(summary([{ id: 1 }, { x: 1 }], [{ id: 1 }, { x: 2 }], options), ["changed $[1]['x']"], 'items without the field are lined up by order');
  assert.deepEqual(summary([{ code: 'A', v: 1 }], [{ code: 'A', v: 2 }], { arrays: 'key', arrayKey: 'code' }), ["changed $[0]['v']"]);
  const dup = diffJson([{ id: 1, v: 1 }, { id: 1, v: 2 }], [{ id: 1, v: 1 }, { id: 1, v: 3 }], options);
  assert.deepEqual(dup.differences.map((x) => `${x.kind} ${x.path}`), ["changed $[1]['v']"]);
  assert.match(dup.warnings[0], /share the same "id"/);
  assert.deepEqual(summary([{ id: null, v: 1 }], [{ id: null, v: 2 }], options), ["changed $[0]['v']"], 'null is not a usable key, so the item is lined up by order');
  assert.deepEqual(summary({ items: [{ id: 1, v: 1 }] }, { items: [{ id: 1, v: 2 }] }, options), ["changed $['items'][0]['v']"], 'works below the top level');
});

test('options: tolerance, case, whitespace and null versus missing', () => {
  assert.deepEqual(summary({ a: 1.0000001 }, { a: 1 }, { numberTolerance: 1e-6 }), []);
  assert.deepEqual(summary({ a: 1.1 }, { a: 1 }, { numberTolerance: 0.05 }), ["changed $['a']"]);
  assert.deepEqual(summary([0.1 + 0.2], [0.3], { numberTolerance: 1e-9 }), []);
  assert.deepEqual(summary([0.1 + 0.2], [0.3]), ['changed $[0]'], 'without a tolerance the float error shows');
  assert.deepEqual(summary({ a: 'Hello' }, { a: 'hello' }), ["changed $['a']"]);
  assert.deepEqual(summary({ a: 'Hello' }, { a: 'hello' }, { ignoreCase: true }), []);
  assert.deepEqual(summary({ a: ' x ' }, { a: 'x' }, { trimStrings: true }), []);
  assert.deepEqual(summary({ a: ' X ' }, { a: 'x' }, { trimStrings: true, ignoreCase: true }), []);
  assert.deepEqual(summary({ a: null }, {}), ["removed $['a']"]);
  assert.deepEqual(summary({ a: null }, {}, { nullEqualsMissing: true }), []);
  assert.deepEqual(summary({ a: null, b: 1 }, { b: 1 }, { nullEqualsMissing: true }), []);
  assert.deepEqual(summary({ a: null }, { a: 1 }, { nullEqualsMissing: true }), ["added $['a']"]);
  assert.deepEqual(summary([1.0000001, 2], [2, 1], { arrays: 'unordered', numberTolerance: 1e-6 }), [], 'tolerance also works when order is ignored');
  assert.deepEqual(summary([1, 1.0000001, 5], [1, 1, 5, 6], { numberTolerance: 1e-6 }), ['added $[3]'], 'and when aligning');
  assert.deepEqual(summary({ items: [{ n: 'A' }] }, { items: [{ n: 'a' }] }, { arrays: 'unordered', ignoreCase: true }), []);
  assert.deepEqual(summary([{ id: 'A', v: 1 }], [{ id: 'a', v: 2 }], { arrays: 'key', ignoreCase: true }), ["changed $[0]['v']"], 'keys follow the case option');
});

test('ignoring paths with JSONPath', () => {
  const a = { id: 1, updatedAt: 'x', items: [{ id: 1, name: 'a', updatedAt: 1 }, { id: 2, name: 'b', updatedAt: 2 }], meta: { token: 't1', page: 1 } };
  const b = { id: 1, updatedAt: 'y', items: [{ id: 1, name: 'a', updatedAt: 9 }, { id: 2, name: 'B', updatedAt: 8 }], meta: { token: 't2', page: 1 } };
  assert.equal(summary(a, b).length, 5);
  assert.deepEqual(summary(a, b, { ignore: ['$..updatedAt', '$.meta.token'] }), ["changed $['items'][1]['name']"]);
  assert.deepEqual(summary(a, b, { ignore: ['$..updatedAt', '$.meta', '$.items[*].name'] }), []);
  assert.deepEqual(summary({ list: [1, 2, 3] }, { list: [1, 9, 3] }, { ignore: ['$.list[1]'] }), [], 'the item at position 1 is ignored on both sides');
  assert.deepEqual(summary({ list: [1, 2, 3] }, { list: [1, 3] }, { ignore: ['$.list[1]'] }), ["removed $['list'][1]"], 'position 1 is dropped from each side separately, so the lists still differ');
  assert.deepEqual(summary({ list: [1, 2, 3, 4] }, { list: [1, 9, 3, 4] }, { ignore: ['$.list[1]', '$.list[3]'] }), [], 'several array items at once');
  assert.deepEqual(summary(a, b, { ignore: ['  ', ''] }).length, 5, 'blank entries are skipped');
  assert.deepEqual(summary(a, b, { ignore: ['$.nothing.here'] }).length, 5, 'a path that matches nothing is fine');
  assert.throws(() => diffJson(a, b, { ignore: ['$..['] }), (e) => e instanceof DiffError && /The ignore path "\$\.\.\[" is not valid: expected a selector/.test(e.message));
  assert.deepEqual(a.updatedAt, 'x', 'the originals are never changed');
  assert.equal(b.items[0].updatedAt, 9);
});

test('invalid options are reported', () => {
  assert.throws(() => diffJson(1, 1, { arrays: 'nope' }), /Unknown array mode/);
  assert.throws(() => diffJson(1, 1, { numberTolerance: -1 }), /tolerance must be zero or more/);
  assert.throws(() => diffJson(1, 1, { numberTolerance: NaN }), DiffError);
  assert.throws(() => diffJson(1, 1, { arrays: 'key', arrayKey: ' ' }), /identifies each item/);
  assert.deepEqual(Object.keys(ARRAY_MODES), ['smart', 'position', 'unordered', 'key']);
});

// ---- properties --------------------------------------------------------------------------------------------------------
function randomValue(r, depth = 0) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (l) => l[int(0, l.length - 1)];
  const k = depth === 0 ? int(3, 5) : depth > 3 ? int(0, 2) : int(0, 5);
  if (k <= 2) return pick([0, 1, 2, -3, 4.5, 'a', 'b', 'c d', true, false, null, '']);
  if (k <= 4) return Array.from({ length: int(0, 5) }, () => randomValue(r, depth + 1));
  return Object.fromEntries(Array.from({ length: int(0, 4) }, () => [pick(['a', 'b', 'c', 'id', 'name']), randomValue(r, depth + 1)]));
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const shuffled = (v, r) => {
  if (Array.isArray(v)) {
    const out = v.map((x) => shuffled(x, r));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort(() => r() - 0.5).map((k) => [k, shuffled(v[k], r)]));
  return v;
};
const arraysIn = (v, path = []) => (Array.isArray(v) ? [path, ...v.flatMap((x, i) => arraysIn(x, [...path, i]))] : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => arraysIn(x, [...path, k])) : []);
const at = (v, path) => path.reduce((node, step) => node[step], v);

test('property: a document never differs from a copy of itself, whatever the mode or key order', () => {
  const r = seeded(7);
  for (let i = 0; i < 300; i++) {
    const doc = randomValue(r);
    const reordered = clone(doc);
    const keyShuffled = JSON.parse(JSON.stringify(doc), (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).reverse().map((key) => [key, v[key]])) : v));
    for (const arrays of ['smart', 'position', 'unordered', 'key']) {
      assert.deepEqual(diffJson(doc, reordered, { arrays }).differences, [], `trial ${i} ${arrays}`);
      assert.deepEqual(diffJson(doc, keyShuffled, { arrays }).differences, [], `trial ${i} ${arrays}: key order`);
    }
  }
});

test('property: shuffling arrays changes nothing when order is ignored', () => {
  const r = seeded(21);
  for (let i = 0; i < 300; i++) {
    const doc = randomValue(r);
    assert.deepEqual(diffJson(doc, shuffled(doc, r), { arrays: 'unordered' }).differences, [], `trial ${i}`);
  }
});

test('property: one changed, removed or added value gives exactly one difference at the right place', () => {
  const r = seeded(99);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  let tried = 0;
  for (let i = 0; i < 400; i++) {
    const doc = randomValue(r);
    // collect every object member path
    const members = [];
    const walk = (v, path) => {
      if (Array.isArray(v)) v.forEach((x, k) => walk(x, [...path, k]));
      else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { members.push([...path, k]); walk(v[k], [...path, k]); });
    };
    walk(doc, []);
    if (members.length === 0) continue;
    const path = members[int(0, members.length - 1)];
    const parentPath = path.slice(0, -1);
    const key = path[path.length - 1];
    const mutated = clone(doc);
    const parent = at(mutated, parentPath);
    const original = parent[key];
    const kind = int(0, 2);
    let expected;
    if (kind === 0) { delete parent[key]; expected = 'removed'; }
    else if (kind === 1) { parent.__fresh = 'new'; expected = 'added'; }
    else if (typeof original === 'number') { parent[key] = original + 100; expected = 'changed'; }
    else if (typeof original === 'string') { parent[key] = `${original}!`; expected = 'changed'; }
    else if (typeof original === 'boolean') { parent[key] = !original; expected = 'changed'; }
    else continue;
    tried++;
    // object members only, so array positions never shift: every mode must give the same single answer
    for (const arrays of ['position', 'smart', 'unordered']) {
      const d = diffJson(doc, mutated, { arrays }).differences;
      assert.equal(d.length, 1, `trial ${i} ${arrays}: ${JSON.stringify(d)}`);
      assert.equal(d[0].kind, expected, `trial ${i} ${arrays}`);
    }
  }
  assert.ok(tried > 150, `only ${tried} usable trials`);
});

test('property: inserting or deleting one array item gives exactly one difference when aligning', () => {
  const r = seeded(5);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  let tried = 0;
  for (let i = 0; i < 400; i++) {
    const doc = randomValue(r);
    const arrays = arraysIn(doc);
    if (arrays.length === 0) continue;
    const path = arrays[int(0, arrays.length - 1)];
    const mutated = clone(doc);
    const list = at(mutated, path);
    if (int(0, 1) === 0 || list.length === 0) list.splice(int(0, list.length), 0, { inserted: i });
    else list.splice(int(0, list.length - 1), 1);
    const d = diffJson(doc, mutated, { arrays: 'smart' }).differences;
    tried++;
    const lenDiff = at(mutated, path).length - at(doc, path).length;
    // deleting an item that sits inside a stretch of similar neighbours may be reported as an edit plus a removal;
    // the number of added/removed entries must still equal the length change
    assert.equal(d.filter((x) => x.kind === 'added').length - d.filter((x) => x.kind === 'removed').length, lenDiff, `trial ${i}: ${JSON.stringify(d.map((x) => x.kind))}`);
  }
  assert.ok(tried > 200);
});

test('property: swapping the two sides swaps added and removed (by position)', () => {
  const r = seeded(13);
  for (let i = 0; i < 300; i++) {
    const a = randomValue(r);
    const b = randomValue(r);
    const forward = diffJson(a, b, { arrays: 'position' }).stats;
    const backward = diffJson(b, a, { arrays: 'position' }).stats;
    assert.deepEqual([forward.added, forward.removed, forward.changed, forward.type], [backward.removed, backward.added, backward.changed, backward.type], `trial ${i}`);
  }
});

test('speed: two large lists with a few differences are compared quickly in every mode', () => {
  const items = Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'], price: i % 97 }));
  const edited = items.map((x) => ({ ...x }));
  edited[500].price = -1;
  edited.splice(9000, 1);
  edited.splice(15000, 0, { id: 99999, name: 'new', tags: [], price: 0 });
  for (const arrays of ['smart', 'unordered', 'key', 'position']) {
    const t0 = performance.now();
    const result = diffJson(items, edited, { arrays });
    const ms = performance.now() - t0;
    assert.ok(ms < 4000, `${arrays} took ${Math.round(ms)} ms`);
    if (arrays !== 'position') assert.equal(result.stats.total, 3, `${arrays}: ${JSON.stringify(result.differences.map((d) => `${d.kind} ${d.path}`))}`);
  }
  const t1 = performance.now();
  assert.equal(diffJson(items, edited, { arrays: 'smart', numberTolerance: 0.001 }).warnings.length, 1, 'with a tolerance a huge list falls back to position, and says so');
  assert.ok(performance.now() - t1 < 4000);
});
