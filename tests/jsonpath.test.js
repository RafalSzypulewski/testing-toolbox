import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, parse, normalizedPath, JsonPathError } from '../js/lib/jsonpath.js';

const values = (doc, q) => query(doc, q).map((m) => m.value);
const paths = (doc, q) => query(doc, q).map((m) => m.pathText);
const fails = (q, pattern, position) => {
  assert.throws(() => parse(q), (e) => {
    assert.ok(e instanceof JsonPathError, `${q}: not a JsonPathError`);
    assert.match(e.message, pattern, q);
    if (position !== undefined) assert.equal(e.position, position, `${q}: position`);
    return true;
  });
};

// the example document used throughout RFC 9535
const store = {
  store: {
    book: [
      { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
      { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
      { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
      { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
    ],
    bicycle: { color: 'red', price: 399 },
  },
};
const books = store.store.book;

const childrenOf = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

// Independent reference for "$..*". RFC 9535 visits every node (parents before children, in
// document order) and appends ALL of that node's children, so the result is grouped by parent.
function* below(v) {
  yield* childrenOf(v);
  for (const k of childrenOf(v)) yield* below(k);
}

test('the RFC 9535 bookstore examples', () => {
  assert.deepEqual(values(store, '$.store.book[*].author'), books.map((b) => b.author));
  assert.deepEqual(values(store, '$..author'), books.map((b) => b.author));
  assert.deepEqual(values(store, '$.store.*'), [store.store.book, store.store.bicycle]);
  assert.deepEqual(values(store, '$.store..price'), [8.95, 12.99, 8.99, 22.99, 399]);
  assert.deepEqual(values(store, '$..book[2]'), [books[2]]);
  assert.deepEqual(values(store, '$..book[2].author'), ['Herman Melville']);
  assert.deepEqual(values(store, '$..book[2].publisher'), []);
  assert.deepEqual(values(store, '$..book[-1]'), [books[3]]);
  assert.deepEqual(values(store, '$..book[0,1]'), [books[0], books[1]]);
  assert.deepEqual(values(store, '$..book[:2]'), [books[0], books[1]]);
  assert.deepEqual(values(store, '$..book[?@.isbn]'), [books[2], books[3]]);
  assert.deepEqual(values(store, '$..book[?@.price<10]'), [books[0], books[2]]);
  assert.deepEqual(values(store, '$..book[?(@.price<10)]'), [books[0], books[2]], 'the older parenthesised form');
  assert.deepEqual(values(store, '$..*'), [...below(store)]);
  assert.deepEqual(values(store, '$'), [store]);
});

test('normalized paths', () => {
  assert.deepEqual(paths(store, '$..book[?@.isbn].title'), ["$['store']['book'][2]['title']", "$['store']['book'][3]['title']"]);
  assert.equal(normalizedPath([]), '$');
  assert.equal(normalizedPath(['a', 0, "it's", 'back\\slash', 'line\nbreak', 'tab\t', '\u0001']), "$['a'][0]['it\\'s']['back\\\\slash']['line\\nbreak']['tab\\t']['\\u0001']");
  const weird = { "a'b": { '[0]': 1 } };
  assert.deepEqual(values(weird, paths(weird, "$..['[0]']")[0]), [1], 'a normalized path can be run again and finds the same node');
});

test('names, brackets and unions', () => {
  const doc = { o: { 'j j': { 'k.k': 3 } }, 'a b': 1, a: [10, 20, 30], '': 'empty', ünï: 'u' };
  assert.deepEqual(values(doc, "$.o['j j']['k.k']"), [3]);
  assert.deepEqual(values(doc, '$["a b"]'), [1]);
  assert.deepEqual(values(doc, "$['']"), ['empty']);
  assert.deepEqual(values(doc, '$.ünï'), ['u']);
  assert.deepEqual(values(doc, "$['a','a b']"), [doc.a, 1]);
  assert.deepEqual(values(doc, '$.a[0, 2, -1, 0]'), [10, 30, 30, 10], 'a union keeps order and duplicates');
  assert.deepEqual(values(doc, "$.a['x']"), [], 'a name selects nothing on an array');
  assert.deepEqual(values(doc, '$.a[0].x'), [], 'and nothing on a number');
  assert.deepEqual(values(doc, '$ .a [ 1 ]'), [20], 'whitespace before a segment and inside brackets is allowed');
  assert.throws(() => parse('$. a'), /expected a name or \*/, 'but not between the dot and the name');
  assert.deepEqual(values([1, [2, 3]], '$[1][0]'), [2]);
  assert.deepEqual(values({ __proto__x: 1 }, '$.__proto__x'), [1]);
  assert.deepEqual(values({}, '$.toString'), [], 'inherited properties are not members');
  assert.deepEqual(values(JSON.parse('{"__proto__": 5}'), "$['__proto__']"), [5]);
});

test('indexes and slices follow the RFC algorithm', () => {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const cases = {
    '$[1:3]': ['b', 'c'], '$[5:]': ['f', 'g'], '$[1:5:2]': ['b', 'd'], '$[5:1:-2]': ['f', 'd'], '$[::-1]': [...letters].reverse(),
    '$[:2]': ['a', 'b'], '$[-3:]': ['e', 'f', 'g'], '$[0:0]': [], '$[2:1]': [], '$[::0]': [], '$[:]': letters, '$[::2]': ['a', 'c', 'e', 'g'],
    '$[-1]': ['g'], '$[0]': ['a'], '$[7]': [], '$[-8]': [], '$[10:20]': [], '$[-100:2]': ['a', 'b'], '$[3:-100:-1]': ['d', 'c', 'b', 'a'],
    '$[ 1 : 3 ]': ['b', 'c'], '$[1:3:]': ['b', 'c'], '$[::]': letters, '$[1,3:5]': ['b', 'd', 'e'],
  };
  for (const [q, expected] of Object.entries(cases)) assert.deepEqual(values(letters, q), expected, q);
  assert.deepEqual(values({ a: 1 }, '$[0]'), [], 'indexes only apply to arrays');
  assert.deepEqual(values('text', '$[0]'), []);
});

test('wildcards and descendants', () => {
  const doc = { a: { x: 1, y: [2, { z: 3 }] }, b: 4 };
  assert.deepEqual(values(doc, '$.*'), [doc.a, 4]);
  assert.deepEqual(values(doc, '$.a.*'), [1, [2, { z: 3 }]]);
  assert.deepEqual(values(doc, '$..z'), [3]);
  assert.deepEqual(values(doc, '$..[0]'), [2], 'the index applies at every level');
  assert.deepEqual(values(doc, "$..['x','z']"), [1, 3]);
  assert.deepEqual(values(doc, '$.a..*'), [1, [2, { z: 3 }], 2, { z: 3 }, 3]);
  assert.deepEqual(values(5, '$.*'), []);
  assert.deepEqual(values(5, '$..*'), []);
  assert.deepEqual(values([[1], [2]], '$..[*]'), [[1], [2], 1, 2]);
  assert.deepEqual(paths(doc, '$..*').slice(0, 4), ["$['a']", "$['b']", "$['a']['x']", "$['a']['y']"], 'children of the root first, then the children of a');
});

test('filters: existence, comparison, logic and nesting', () => {
  const items = [
    { id: 1, name: 'apple', price: 1.5, tags: ['fruit', 'red'], stock: null, ok: true },
    { id: 2, name: 'pear', price: 2, tags: ['fruit'], ok: false },
    { id: 3, name: 'carrot', price: '2', tags: [], extra: { deep: 1 } },
    { id: 4, name: 'Apricot', price: 4, tags: ['fruit', 'orange'], ok: true },
  ];
  const ids = (q) => values(items, q).map((i) => i.id);
  assert.deepEqual(ids('$[?@.stock]'), [1], 'null counts as present');
  assert.deepEqual(ids('$[?!@.ok]'), [3], 'missing key');
  assert.deepEqual(ids('$[?@.ok == false]'), [2]);
  assert.deepEqual(ids('$[?@.ok == true]'), [1, 4]);
  assert.deepEqual(ids('$[?@.price == 2]'), [2], 'a number never equals the string "2"');
  assert.deepEqual(ids("$[?@.price == '2']"), [3]);
  assert.deepEqual(ids('$[?@.price > 1.5]'), [2, 4], 'comparing a number with a string is false, not an error');
  assert.deepEqual(ids('$[?@.price >= 1.5 && @.price < 4]'), [1, 2]);
  assert.deepEqual(ids("$[?@.name == 'pear' || @.id == 4]"), [2, 4]);
  assert.deepEqual(ids("$[?@.name < 'b']"), [1, 4], 'strings compare by code point, so "Apricot" (A is 65) and "apple" come before "b" (98)');
  assert.deepEqual(ids("$[?(@.name == 'pear' || @.id == 1) && @.price]"), [1, 2]);
  assert.deepEqual(ids("$[?!(@.name == 'pear')]"), [1, 3, 4]);
  assert.deepEqual(ids('$[?@.stock == null]'), [1]);
  assert.deepEqual(ids('$[?@.missing == null]'), [], 'a missing value is not null');
  assert.deepEqual(ids('$[?@.missing != 1]'), [1, 2, 3, 4], 'nothing is different from 1');
  assert.deepEqual(ids('$[?@.missing == @.alsoMissing]'), [1, 2, 3, 4], 'nothing equals nothing');
  assert.deepEqual(ids('$[?@.extra.deep == 1]'), [3]);
  assert.deepEqual(ids('$[?@.tags[0] == "fruit"]'), [1, 2, 4]);
  assert.deepEqual(ids('$[?@.tags[-1] == "orange"]'), [4]);
  assert.deepEqual(ids('$[?@.tags == $[0].tags]'), [1], 'arrays are compared deeply; $ is the whole document');
  assert.deepEqual(ids('$[?@.price <= 2 && @.price >= 2]'), [2]);
  assert.deepEqual(ids('$[?@.tags[?@ == "red"]]'), [1], 'a filter inside a filter');
  assert.deepEqual(ids('$[?@.id != 2]'), [1, 3, 4]);
  assert.deepEqual(values({ a: [{ b: 1 }, { b: 2 }], c: { d: { b: 3 } } }, '$..[?@.b]').length, 3);
  assert.deepEqual(values({ x: 1, y: 2, z: 3 }, '$[?@ > 1]'), [2, 3], 'filters also work on object members');
  assert.deepEqual(values([1, 'a', null, 1.5], '$[?@ == 1]'), [1]);
  assert.deepEqual(values([1, 2], '$[?1 == 1]'), [1, 2]);
  assert.deepEqual(values([[1, 2], [1, 2], [2, 1]], '$[?@ == $[0]]'), [[1, 2], [1, 2]]);
});

test('filters: functions', () => {
  const items = [
    { n: 'apple', l: [1, 2, 3], o: { a: 1, b: 2 } },
    { n: 'pear', l: [], o: {} },
    { n: '😀😀', l: [1], o: { a: 1 } },
    { n: 'Banana', l: [1, 2], o: 5 },
  ];
  const names = (q) => values(items, q).map((i) => i.n);
  assert.deepEqual(names('$[?length(@.n) == 2]'), ['😀😀'], 'length counts characters, not UTF-16 units');
  assert.deepEqual(names('$[?length(@.n) > 4]'), ['apple', 'Banana']);
  assert.deepEqual(names('$[?length(@.l) == 0]'), ['pear']);
  assert.deepEqual(names('$[?length(@.o) == 2]'), ['apple'], 'length of an object counts members');
  assert.deepEqual(names('$[?length(@.o) >= 0]'), ['apple', 'pear', '😀😀'], 'length of a number is nothing');
  assert.deepEqual(names('$[?count(@.l[*]) == 2]'), ['Banana']);
  assert.deepEqual(names('$[?count(@.*) == 3]'), ['apple', 'pear', '😀😀', 'Banana'], 'every item has three members');
  assert.deepEqual(names('$[?count(@.l[?@ > 1]) == 2]'), ['apple'], 'count() accepts any query, including filters');
  assert.deepEqual(names("$[?match(@.n, 'a.*e')]"), ['apple'], 'match must cover the whole string');
  assert.deepEqual(names("$[?search(@.n, 'an')]"), ['Banana'], 'search finds a part');
  assert.deepEqual(names("$[?match(@.n, '[a-z]+')]"), ['apple', 'pear']);
  assert.deepEqual(names("$[?!match(@.n, '[a-z]+')]"), ['😀😀', 'Banana']);
  assert.deepEqual(names("$[?search(@.l, 'x')]"), [], 'a non-string is simply false');
  assert.deepEqual(names("$[?match(@.n, '(')]"), [], 'an invalid pattern is false, not an error');
  assert.deepEqual(names('$[?value(@.l[0]) == 1]'), ['apple', '😀😀', 'Banana']);
  assert.deepEqual(names('$[?value(@.l[*]) == 1]'), ['😀😀'], 'value() of several nodes is nothing');
  assert.deepEqual(names('$[?length(value(@.n)) == 4]'), ['pear']);
});

test('syntax errors name the problem and the character position', () => {
  fails('', /must start with \$/, 0);
  fails('a.b', /must start with \$/, 0);
  fails('$.', /expected a name or \* after "\."/, 2);
  fails('$..', /expected a name, \* or \[ after "\.\."/, 3);
  fails('$.[0]', /expected a name or \*/, 2);
  fails('$[', /expected a selector/, 2);
  fails("$['a'", /expected "," or "\]"/, 5);
  fails("$['a", /missing its closing quote/, 2);
  fails('$[01]', /leading zeros/, 2);
  fails('$[-0]', /"-0" is not a valid index/, 2);
  fails('$[9007199254740993]', /too large/, 2);
  fails('$[a]', /expected a selector/, 2);
  fails('$.a b', /unexpected "b"/, 4);
  fails('$.a ', /must not end with whitespace/);
  fails('$[1,]', /expected a selector/, 4);
  fails("$['a\\x']", /invalid escape/);
  fails('$["a\\\'"]', /invalid escape/);
  fails("$['\\ud800']", /surrogate/);
  fails("$['\\u12']", /four hexadecimal digits/);
  fails('$[?@.a = 1]', /use == to compare/);
  fails('$[?1]', /literal on its own/);
  fails("$[?'a']", /literal on its own/);
  fails('$[?@.a ==]', /expected @, \$, a literal or a function/);
  fails('$[?foo]', /unknown word "foo"/);
  fails('$[?foo(@.a)]', /unknown function foo\(\)/);
  fails('$[?length(@.a)]', /returns a value, so it must be compared/);
  fails('$[?count(@.a)]', /returns a value/);
  fails('$[?match(@.a)]', /takes 2 arguments but 1 was given/);
  fails('$[?length(@.*) > 1]', /must select a single value/);
  fails('$[?length(1, 2)]', /takes 1 argument but 2 were given/);
  fails('$[?count(1) == 1]', /must be a query/);
  fails('$[?match(@.a, "x") == true]', /cannot be compared/);
  fails('$[?@.* == 1]', /at most one node/);
  fails('$[?@..a == 1]', /at most one node/);
  fails('$[?@[0:2] == 1]', /at most one node/);
  fails('$[?!@.a == 1]', /put the comparison in parentheses/);
  fails('$[?(@.a == 1]', /expected "\)"/);
  fails('$[?@.a == 1 &&]', /expected @, \$, a literal or a function/);
  fails('$.a)', /unexpected "\)"/);
  fails('$[?@.a || ]', /expected @, \$, a literal or a function/);
  assert.equal(parse('$.a').segments.length, 1);
  assert.throws(() => parse(5), /must be text/);
});

test('property: random documents agree with an independent walk', () => {
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const make = (depth) => {
    const k = depth === 0 ? int(3, 5) : depth > 3 ? int(0, 2) : int(0, 5); // the root is always an array or object
    if (k <= 2) return [int(0, 9), 'str', null, true][int(0, 3)];
    if (k <= 4) return Array.from({ length: int(0, 4) }, () => make(depth + 1));
    return Object.fromEntries(Array.from({ length: int(0, 4) }, () => [['a', 'b', 'c', 'd'][int(0, 3)], make(depth + 1)]));
  };
  const named = (v, key) => {
    const out = [];
    const walk = (x) => {
      const kids = Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).map((k) => x[k]) : [];
      if (x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, key)) out.push(x[key]);
      kids.forEach(walk);
    };
    walk(v);
    return out;
  };
  let total = 0;
  for (let t = 0; t < 300; t++) {
    const doc = make(0);
    assert.deepEqual(values(doc, '$..*'), [...below(doc)], `trial ${t}`);
    assert.deepEqual(values(doc, '$..a'), named(doc, 'a'), `trial ${t}`);
    const kids = Array.isArray(doc) ? doc : doc && typeof doc === 'object' ? Object.values(doc) : [];
    assert.deepEqual(values(doc, '$[*]'), kids, `trial ${t}`);
    // every path that is returned finds exactly its own value when run again
    for (const m of query(doc, '$..*')) {
      const again = query(doc, m.pathText);
      assert.equal(again.length, 1, `${m.pathText}`);
      assert.equal(again[0].value, m.value, `${m.pathText}`);
    }
    total += values(doc, '$..*').length;
  }
  assert.ok(total > 2000, `the random documents should be rich enough to mean something (${total} nodes)`);
});

test('speed: a large document is searched quickly', () => {
  const big = { items: Array.from({ length: 50_000 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'], price: i % 100 })) };
  const t0 = performance.now();
  const expected = big.items.filter((i) => i.price === 7 && i.name.includes('9')).length;
  assert.ok(expected > 50 && expected < 500, `${expected} expected matches`);
  assert.equal(query(big, '$.items[?@.price == 7 && search(@.name, "9")].id').length, expected);
  assert.equal(query(big, '$..id').length, 50_000);
  assert.ok(performance.now() - t0 < 3000, `took ${Math.round(performance.now() - t0)} ms`);
});
