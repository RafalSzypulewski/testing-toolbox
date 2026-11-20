import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, stringifyYaml, resolvePlain, YamlError } from '../js/lib/yaml.js';
import { python, pythonHas } from './helpers-python.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const one = (text) => {
  const { documents } = parseYaml(text);
  assert.equal(documents.length, 1, `expected one document in ${JSON.stringify(text)}`);
  return documents[0];
};
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const hasPyYaml = pythonHas('yaml');
const REFERENCE = `
import sys, json, yaml
cases = json.load(sys.stdin)
out = []
for t in cases:
    try: out.append({'ok': True, 'docs': list(yaml.safe_load_all(t))})
    except Exception as e: out.append({'ok': False, 'error': str(e)[:200]})
print(json.dumps(out, default=str))`;

// [yaml text, expected single document]. Every snippet here means the same in YAML 1.1 and 1.2,
// so PyYAML is used as a referee for the expectations themselves.
const SNIPPETS = [
  ['a: 1', { a: 1 }],
  ['a: 1\nb: two\nc: [1, 2]\nd: {e: f}', { a: 1, b: 'two', c: [1, 2], d: { e: 'f' } }],
  ['# top\na: 1 # inline\n# between\nb: 2\n', { a: 1, b: 2 }],
  ['a:\n  b:\n    c: 1\n  d: 2\ne: 3', { a: { b: { c: 1 }, d: 2 }, e: 3 }],
  ['list:\n- a\n- b\nother: 1', { list: ['a', 'b'], other: 1 }],
  ['list:\n  - a\n  - b\nother: 1', { list: ['a', 'b'], other: 1 }],
  ['- a\n- - b\n  - c\n- d: 1\n  e: 2\n-\n  - f', ['a', ['b', 'c'], { d: 1, e: 2 }, ['f']]],
  ['- - - deep', [[['deep']]]],
  ['- key: value\n  other: [1, 2]\n- key: second', [{ key: 'value', other: [1, 2] }, { key: 'second' }]],
  ['-\n-\n- x', [null, null, 'x']],
  ['a:\nb:\nc: ~\nd: null\ne: ""', { a: null, b: null, c: null, d: null, e: '' }],
  ['a: Null\nb: NULL\nc: True\nd: FALSE\ne: true', { a: null, b: null, c: true, d: false, e: true }],
  ['a: 12\nb: -7\nc: +3\nd: 3.25\ne: -0.5\nf: .5\ng: 6.02e+23\nh: 0x1F', { a: 12, b: -7, c: 3, d: 3.25, e: -0.5, f: 0.5, g: 6.02e23, h: 31 }],
  ['url: http://x.y/z?a=b\nt: a:b\nq: "quoted: yes"\ns: \'single\'\nsp: it\'s fine', { url: 'http://x.y/z?a=b', t: 'a:b', q: 'quoted: yes', s: 'single', sp: "it's fine" }],
  ['"quoted key": 1\n\'single key\': 2\n3: three\ntrue: x', { 'quoted key': 1, 'single key': 2, 3: 'three', true: 'x' }],
  ['k: "tab\\there\\nnew\\u00e9 \\x41 \\" \\\\"', { k: 'tab\there\nnewé A " \\' }],
  ["k: 'it''s'", { k: "it's" }],
  ['text: this is a\n  long plain\n  scalar\nnext: 1', { text: 'this is a long plain scalar', next: 1 }],
  ['text: first\n\n  second\nnext: 1', { text: 'first\nsecond', next: 1 }],
  ['q: "folded\n  over lines"\nnext: 1', { q: 'folded over lines', next: 1 }],
  ['q: "blank\n\n  line"', { q: 'blank\nline' }],
  ['q: "join\\\n  ed"', { q: 'joined' }],
  ["q: 'a\n  b'", { q: 'a b' }],
  ['a: |\n  line1\n  line2\nb: 1', { a: 'line1\nline2\n', b: 1 }],
  ['a: |-\n  line1\n  line2\nb: 1', { a: 'line1\nline2', b: 1 }],
  ['a: |+\n  line1\n\nb: 1', { a: 'line1\n\n', b: 1 }],
  ['a: |\n  line1\n\n  line3\n', { a: 'line1\n\nline3\n' }],
  ['a: |\n    indented\n      more\n    back\nb: 1', { a: 'indented\n  more\nback\n', b: 1 }],
  ['a: >\n  folded\n  text\n\n  para\nb: 1', { a: 'folded text\npara\n', b: 1 }],
  ['a: >-\n  folded\n  text', { a: 'folded text' }],
  ['a: >\n  keep\n    indented\n  lines\nb: 1', { a: 'keep\n  indented\nlines\n', b: 1 }],
  ['a: >+\n  x\n\nb: 1', { a: 'x\n\n', b: 1 }],
  ['a: |2\n    two extra\n  base\nb: 1', { a: '  two extra\nbase\n', b: 1 }],
  ['- |\n  one\n- >-\n  two\n  three\n- last', ['one\n', 'two three', 'last']],
  ['a: |\n  # not a comment\n  b: not a key\nc: 1', { a: '# not a comment\nb: not a key\n', c: 1 }],
  ['a: |\nb: 1', { a: '', b: 1 }],
  ['base: &b\n  x: 1\n  y: 2\nuse: *b\nlist: [*b, 3]', { base: { x: 1, y: 2 }, use: { x: 1, y: 2 }, list: [{ x: 1, y: 2 }, 3] }],
  ['s: &s hello\nt: *s', { s: 'hello', t: 'hello' }],
  ['a: &a {p: 1}\nb: &b {q: 2}\nm:\n  <<: [*a, *b]\n  r: 3', { a: { p: 1 }, b: { q: 2 }, m: { p: 1, q: 2, r: 3 } }],
  ['base: &b {x: 1, y: 2}\nd:\n  <<: *b\n  y: 20', { base: { x: 1, y: 2 }, d: { x: 1, y: 20 } }],
  ['[1, [2, 3], {a: b, c: [d]}]', [1, [2, 3], { a: 'b', c: ['d'] }]],
  ['{a: 1, b: [x, y], "c d": \'e, f\', }', { a: 1, b: ['x', 'y'], 'c d': 'e, f' }],
  ['{a, b: 1}', { a: null, b: 1 }],
  ['[a, b, ]', ['a', 'b']],
  ['[a: 1, b]', [{ a: 1 }, 'b']],
  ['k: [\n  1,\n  2, # c\n  3\n]\nz: {\n  a: 1\n}', { k: [1, 2, 3], z: { a: 1 } }],
  ['[]', []],
  ['{}', {}],
  ['e: []\nf: {}', { e: [], f: {} }],
  ['just a string', 'just a string'],
  ['42', 42],
  ['"quoted top"', 'quoted top'],
  ['- a\n- b # c\n', ['a', 'b']],
  ['--- \na: 1', { a: 1 }],
  ['---\n- x\n...', ['x']],
  ['a: 1\r\nb: 2\r\n', { a: 1, b: 2 }],
  ['\ufeffa: 1', { a: 1 }],
  ['a: "# not a comment"\nb: x#y', { a: '# not a comment', b: 'x#y' }],
  ['a: b: c'.replace('b: c', 'b:c'), { a: 'b:c' }],
  ['? complex\n: value', { complex: 'value' }],
  ['a:    spaced    \nb:   1', { a: 'spaced', b: 1 }],
  ['empty: ""\nspace: " "\nlong: >-\n  a\n  b', { empty: '', space: ' ', long: 'a b' }],
];

test('YAML features: every snippet parses to the expected value, and PyYAML agrees with the expectation', { skip: !hasPyYaml && 'PyYAML is not installed' }, () => {
  const reference = python(REFERENCE, SNIPPETS.map(([text]) => text));
  SNIPPETS.forEach(([text, expected], i) => {
    assert.deepEqual(canon(one(text)), canon(expected), `my parser: ${JSON.stringify(text)}`);
    const ref = reference[i];
    assert.ok(ref.ok, `PyYAML rejects my snippet ${JSON.stringify(text)}: ${ref.error}`);
    assert.deepEqual(canon(ref.docs[0]), canon(expected), `PyYAML disagrees with my expectation for ${JSON.stringify(text)}`);
  });
});

test('YAML features: the same snippets without the referee', () => {
  for (const [text, expected] of SNIPPETS) assert.deepEqual(canon(one(text)), canon(expected), JSON.stringify(text));
});

test('several documents in one text', { skip: !hasPyYaml && 'PyYAML is not installed' }, () => {
  const texts = ['a: 1\n---\nb: 2\n---\n- c\n', '---\na: 1\n...\n---\nb: 2\n...\n', '# only a comment\n---\nx\n---\n', '---\n---\nz: 1'];
  const reference = python(REFERENCE, texts);
  texts.forEach((text, i) => assert.deepEqual(canon(parseYaml(text).documents), canon(reference[i].docs), JSON.stringify(text)));
  assert.equal(parseYaml('a: 1\n---\nb: 2').documents.length, 2);
  assert.deepEqual(parseYaml('').documents, [null]);
  assert.deepEqual(parseYaml('---\n---\nz: 1').documents, [null, { z: 1 }], 'an explicit empty document counts');
  assert.deepEqual(parseYaml('# comment before the first marker\n---\nx').documents, ['x'], 'comments before the first --- are not a document');
  assert.deepEqual(parseYaml('# nothing\n\n').documents, [null]);
  assert.deepEqual(parseYaml('%YAML 1.2\n---\na: 1').documents, [{ a: 1 }]);
});

test('YAML 1.2 differences from older readers are deliberate: yes/no/on/off are text, 0o and 1e3 are numbers', () => {
  assert.deepEqual(one('a: yes\nb: no\nc: on\nd: off\ne: y\nf: n'), { a: 'yes', b: 'no', c: 'on', d: 'off', e: 'y', f: 'n' });
  assert.deepEqual(one('a: 0o17\nb: 1e3\nc: 0123\nd: 1_000\ne: 12:30'), { a: 15, b: 1000, c: 123, d: '1_000', e: '12:30' });
  assert.deepEqual(one('a: 2020-01-01'), { a: '2020-01-01' }, 'dates stay text');
  assert.equal(resolvePlain('007'), 7);
  assert.ok(Object.is(resolvePlain('-0'), 0), '"-0" is the integer 0');
  assert.equal(resolvePlain('.5'), 0.5);
  assert.equal(resolvePlain('1.'), 1);
  assert.equal(resolvePlain('1.5.2'), '1.5.2');
});

test('very large integers are kept as text, with a warning, so no digits are lost', () => {
  const { documents, warnings } = parseYaml('id: 12345678901234567890\nok: 9007199254740991');
  assert.deepEqual(documents[0], { id: '12345678901234567890', ok: 9007199254740991 });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /12345678901234567890 is too large/);
});

test('tags: only the simple ones are supported', () => {
  assert.deepEqual(one('a: !!str 123\nb: !!int "42"\nc: !!float 1\nd: !!bool "true"\ne: !!null x'), { a: '123', b: 42, c: 1, d: true, e: null });
  assert.throws(() => parseYaml('a: !custom x'), /the tag !custom is not supported/);
  assert.throws(() => parseYaml('a: !!int x'), /"x" is not an integer/);
});

test('errors say what is wrong and on which line', () => {
  const bad = (text, pattern, line) => assert.throws(() => parseYaml(text), (e) => {
    assert.ok(e instanceof YamlError, `${JSON.stringify(text)}: ${e}`);
    assert.match(e.message, pattern, JSON.stringify(text));
    if (line !== undefined) assert.equal(e.line, line, `${JSON.stringify(text)}: line`);
    return true;
  });
  bad('a: 1\na: 2', /the key "a" appears twice/, 2);
  bad('a:\n\tb: 1', /tabs cannot be used for indentation/, 2);
  bad('a: 1\n  b: 2', /a mapping entry cannot start here/, 2);
  bad('a:\n  b: 1\n c: 2', /unexpected content|expected "key: value"|indented/);
  bad('- [a]\n  - b', /this item is indented more/, 2);
  bad('a: "open', /never closed/, 1);
  bad("a: 'open", /never closed/, 1);
  bad('a: [1, 2', /never closed/, 1);
  bad('a: {x: 1', /never closed/, 1);
  bad('a: "x" y', /unexpected "y" after the closing quote/, 1);
  bad('a: *missing', /alias \*missing refers to an anchor/, 1);
  bad('a: .inf', /cannot be written in JSON/);
  bad('a: .NaN', /cannot be written in JSON/);
  bad('a: "bad \\q"', /unknown escape sequence/);
  bad('a: "bad \\u12"', /\\u must be followed by 4 hexadecimal/);
  bad('? [a, b]\n: v', /collections\) are not supported|only a single scalar/);
  bad('&a key: v', /anchors, tags and aliases on keys/);
  bad('a: b\nc', /expected "key: value"/, 2);
  bad('a: &\nb: 1', /needs a name/);
  bad('<<: 5', /merge key/, 1);
  bad('a: |bad\n  x', /could not read the block scalar header/);
  bad('{a: 1, a: 2}', /appears twice/);
  bad('- a\nb: 1', /expected|unexpected|list item/);
  bad('[a, b] x', /unexpected "x" after the end of the flow collection/);
  bad('a: 1 # ok\nb: "x\ny', /never closed/);
});

test('stringifyYaml: layout', () => {
  const doc = { name: 'Ann', tags: ['a', 'b'], nested: { empty: [], none: {}, deep: { x: 1 } }, list: [{ a: 1, b: 2 }, [1, 2], 'text'], flag: true, nothing: null, pi: 3.14 };
  assert.equal(stringifyYaml(doc), `name: Ann
tags:
  - a
  - b
nested:
  empty: []
  none: {}
  deep:
    x: 1
list:
  - a: 1
    b: 2
  - - 1
    - 2
  - text
flag: true
nothing: null
pi: 3.14
`);
  assert.equal(stringifyYaml({ a: { b: 1 } }, { indent: 4 }), 'a:\n    b: 1\n');
  assert.equal(stringifyYaml([1, [2, [3]]]), '- 1\n- - 2\n  - - 3\n');
  assert.equal(stringifyYaml('text'), 'text\n');
  assert.equal(stringifyYaml('a: b'), '"a: b"\n');
  assert.equal(stringifyYaml(5), '5\n');
  assert.equal(stringifyYaml(null), 'null\n');
  assert.equal(stringifyYaml([]), '[]\n');
  assert.equal(stringifyYaml({}), '{}\n');
  assert.equal(stringifyYaml({ a: 'multi\nline\n', b: 'no newline\nat end', c: 'keep\n\n' }), 'a: |\n  multi\n  line\nb: |-\n  no newline\n  at end\nc: |+\n  keep\n\n');
  assert.equal(stringifyYaml({ a: 'multi\nline' }, { literalBlocks: false }), 'a: "multi\\nline"\n');
  assert.equal(stringifyYaml(['x\ny']), '- |-\n  x\n  y\n');
  assert.throws(() => stringifyYaml({ a: Infinity }), /Infinity and NaN/);
  assert.throws(() => stringifyYaml(NaN), YamlError);
  assert.throws(() => stringifyYaml({ a: 1 }, { indent: 0 }), /indentation/);
});

test('stringifyYaml quotes exactly what would otherwise change meaning', () => {
  const plain = ['hello', 'hello world', 'a-b', 'x.y', 'http://x.y/z', 'email@example.com', 'a:b', 'ünï', 'tab-free', 'caf\u00e9', 'a, b', 'it\'s', 'a b c', 'under_score', 'UPPER', 'x1', 'v1.2.3', '1.2.3'.replace('1', 'x')];
  for (const s of plain) assert.equal(stringifyYaml(s), `${s}\n`, `${s} needs no quotes`);
  const quoted = ['', ' lead', 'trail ', 'yes', 'No', 'null', '~', 'true', 'False', 'on', 'OFF', 'y', 'n', '123', '-5', '1.5', '.5', '0x1F', '0o17', '1e3', '+1', '- item', '? q', ': c', 'a: b', 'a #b', '# c', '@at', '`t', '!b', '&a', '*s', '%p', '{b}', '[b]', '|p', '>g', '"q"', "'s'", ',c', '---', '...', '2020-01-01', '12:30', '1_000', '<<', '=', 'bell\x07', 'a\tb', 'x\u2028y', '.inf', '-.INF', '.NaN', '0.', '-', '?', ':', 'a\r\nb'];
  for (const s of quoted) {
    const out = stringifyYaml(s);
    assert.ok(out.startsWith('"'), `${JSON.stringify(s)} must be quoted, got ${out.trim()}`);
    assert.equal(one(out), s, `${JSON.stringify(s)} reads back`);
  }
  // (JavaScript lists integer-like keys such as "1" first)
  assert.equal(stringifyYaml({ 'a b': 1, yes: 2, 1: 3, '': 4, 'a: b': 5, 'plain-key_1': 6 }), '"1": 3\na b: 1\n"yes": 2\n"": 4\n"a: b": 5\nplain-key_1: 6\n');
  assert.equal(stringifyYaml({ num: 1e21, tiny: 1e-7, z: -0, big: 9007199254740991, f: 0.1 }), 'num: 1.0e+21\ntiny: 1.0e-7\nz: -0.0\nbig: 9007199254740991\nf: 0.1\n');
  assert.equal(stringifyYaml({ n: 1 }), '"n": 1\n', 'a bare n or y would be read as false or true by YAML 1.1 readers, so it is quoted');
});

// ---- properties and cross-checks ----------------------------------------------------------------------------------
const NASTY = ['yes', 'No', 'null', '~', 'true', '123', '-5', '1e3', '1.5', '0x1F', '0o17', '- item', 'a: b', '# hash', ' lead', 'trail ', '', 'multi\nline', 'ends\n', 'two\n\n', '\tTab', 'quote"s', "single'quote", 'ünï😀 日本', '@at', '`tick', '!bang', '&amp', '*star', '%pct', '{brace}', '[bracket]', '|pipe', '>gt', '?q', ':colon', ',comma', 'a #b', 'a:b', 'http://x.y/z?a=b', '2020-01-01', '12:30', '1_000', '+1', '.5', '5.', '0777', '=', '<<', 'y', 'n', 'back\\slash', 'bell\x07', `${'a'.repeat(30)} ${'word '.repeat(30)}`, '---', '...', '- ', 'line1\nline2\nline3', '  indented\nline', 'key: value\nother: x', 'end space \n', '\n', '\nlead nl', 'a\r\nb', 'ends  \nspaces', 'x\n \ny', '\u2028sep', '\ufeffbom', 'True', 'NO', '.inf', '-.INF', '.NaN', '0b101', '0.', '-', '?', ':', 'a\nb\n', '\n\n\n', 'x:\ny'];
function randomValue(r, depth = 0) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (l) => l[int(0, l.length - 1)];
  const k = depth === 0 ? int(3, 5) : depth > 3 ? int(0, 2) : int(0, 5);
  if (k === 0) return pick([0, 1, -7, 42, 3.14, -0.5, 1e21, 1e-7, 123456789, 0.1, true, false, null, 9007199254740991]);
  if (k <= 2) return pick(NASTY);
  if (k <= 4) return Array.from({ length: int(0, 4) }, () => randomValue(r, depth + 1));
  const keys = ['a', 'b', 'name', 'key with space', 'Ünï', 'x.y', '1', 'true', 'null', 'yes', '', 'a: b', '- dash', '#c', 'multi\nline key', '?', ':', ' lead', '0x1F', '2020-01-01', '~', '<<', '='];
  return Object.fromEntries(Array.from({ length: int(0, 4) }, () => [pick(keys), randomValue(r, depth + 1)]));
}

test('property: whatever stringifyYaml writes, parseYaml reads back unchanged', () => {
  const r = seeded(4711);
  for (let i = 0; i < 400; i++) {
    const value = randomValue(r);
    const text = stringifyYaml(value);
    assert.ok(text.endsWith('\n'));
    assert.deepEqual(canon(one(text)), canon(value), `value ${i}:\n${text}`);
    const noBlocks = stringifyYaml(value, { literalBlocks: false, indent: 4 });
    assert.deepEqual(canon(one(noBlocks)), canon(value), `value ${i} without literal blocks:\n${noBlocks}`);
  }
});

test('cross-check: PyYAML reads what stringifyYaml writes (400 random documents)', { skip: !hasPyYaml && 'PyYAML is not installed' }, () => {
  const r = seeded(99);
  const values = Array.from({ length: 400 }, () => randomValue(r));
  const texts = values.map((v) => stringifyYaml(v));
  const reference = python(REFERENCE, texts);
  values.forEach((value, i) => {
    assert.ok(reference[i].ok, `PyYAML rejects document ${i}: ${reference[i].error}\n${texts[i]}`);
    assert.deepEqual(canon(reference[i].docs[0]), canon(value), `document ${i}:\n${texts[i]}`);
  });
});

test('cross-check: parseYaml reads what PyYAML writes, in eight output styles (200 random documents)', { skip: !hasPyYaml && 'PyYAML is not installed' }, () => {
  const r = seeded(321);
  // YAML 1.1 (PyYAML) and 1.2 disagree about a few things, which are covered by the tests above and avoided here:
  // the plain words 0o17 and 1e3, and U+2028 / U+2029 / U+0085, which 1.1 treats as line breaks (PyYAML cannot even
  // read its own output back for those characters)
  const values = Array.from({ length: 200 }, () => randomValue(r)).map((v) => JSON.parse(JSON.stringify(v, (k, x) => (x === '0o17' || x === '1e3' || (typeof x === 'string' && /[\u2028\u2029\u0085]/.test(x)) ? 'plain' : x))));
  const DUMP = `
import sys, json, yaml
docs = json.load(sys.stdin)
styles = [dict(default_flow_style=False), dict(default_flow_style=True), dict(default_flow_style=False, allow_unicode=True, width=40), dict(default_flow_style=False, allow_unicode=True, width=2000), dict(default_flow_style=False, explicit_start=True, indent=4), dict(default_flow_style=None), dict(default_flow_style=False, default_style='"'), dict(default_flow_style=False, default_style="'")]
print(json.dumps([[yaml.safe_dump(d, **s) for s in styles] for d in docs]))`;
  const dumps = python(DUMP, values);
  values.forEach((value, i) => dumps[i].forEach((text, style) => {
    assert.deepEqual(canon(one(text)), canon(value), `document ${i}, PyYAML style ${style}:\n${text}`);
  }));
});

test('speed: a large document parses quickly', () => {
  const big = { items: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'], nested: { x: i, y: [1, 2, 3] } })) };
  const text = stringifyYaml(big);
  const t0 = performance.now();
  assert.deepEqual(one(text), big);
  assert.ok(performance.now() - t0 < 3000, `parsing ${text.length} characters took ${Math.round(performance.now() - t0)} ms`);
});
