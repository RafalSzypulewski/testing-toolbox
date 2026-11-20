import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS, GROUPS, getOperation, defaultsFor, runOperation as run } from '../js/lib/textops.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('case: upper, lower, title, sentence, swap', () => {
  assert.equal(run('upper', 'zażółć gęślą jaźń'), 'ZAŻÓŁĆ GĘŚLĄ JAŹŃ');
  assert.equal(run('upper', 'straße'), 'STRASSE');
  assert.equal(run('lower', 'ZAŻÓŁĆ Gęślą'), 'zażółć gęślą');
  assert.equal(run('title', "hello wORLD, it's o'brien ZAŻÓŁĆ"), "Hello World, It's O'brien Zażółć");
  assert.equal(run('sentence', 'hELLO world. this is TEST! ok? yes\nnew line'), 'Hello world. This is test! Ok? Yes\nNew line');
  assert.equal(run('swap', 'Hello Łódź 123'), 'hELLO łÓDŹ 123');
});

test('case: programming identifiers, per line, with acronyms, digits and Polish letters', () => {
  const input = 'HTTPServer\nhello_world-foo bar\ngetHTTPResponse2Code\nzażółć gęślą\n\nXMLHttpRequest';
  assert.equal(run('camel', input), 'httpServer\nhelloWorldFooBar\ngetHttpResponse2Code\nzażółćGęślą\n\nxmlHttpRequest');
  assert.equal(run('pascal', input), 'HttpServer\nHelloWorldFooBar\nGetHttpResponse2Code\nZażółćGęślą\n\nXmlHttpRequest');
  assert.equal(run('snake', input), 'http_server\nhello_world_foo_bar\nget_http_response_2_code\nzażółć_gęślą\n\nxml_http_request');
  assert.equal(run('kebab', input), 'http-server\nhello-world-foo-bar\nget-http-response-2-code\nzażółć-gęślą\n\nxml-http-request');
  assert.equal(run('constant', input), 'HTTP_SERVER\nHELLO_WORLD_FOO_BAR\nGET_HTTP_RESPONSE_2_CODE\nZAŻÓŁĆ_GĘŚLĄ\n\nXML_HTTP_REQUEST');
  assert.equal(run('snake', '漢字 test'), '漢字_test');
});

test('sort: natural, case, direction, Polish letters, trailing line break', () => {
  const items = 'item 10\nItem 2\nitem 1\nbanana\nApple';
  assert.equal(run('sort', items), 'Apple\nbanana\nitem 1\nItem 2\nitem 10');
  assert.equal(run('sort', items, { order: 'desc' }), 'item 10\nItem 2\nitem 1\nbanana\nApple');
  assert.equal(run('sort', 'item 10\nItem 2\nitem 1', { natural: false }), 'item 1\nitem 10\nItem 2');
  assert.equal(run('sort', 'b\nA\na\nB', { ignoreCase: false }), 'a\nA\nb\nB');
  assert.equal(run('sort', 'ż\nz\nł\nl\na', { locale: 'en' }), 'a\nl\nł\nz\nż');
  assert.equal(run('sort', 'b\na\n'), 'a\nb\n');
});

test('sort follows the chosen language: Polish treats ż as its own letter after z', () => {
  const words = 'żaba\nZażółć\nzebra\nłódka\nlampa\nŹle\nźle\nzupa';
  const polish = run('sort', words, { locale: 'pl' }).split('\n');
  assert.deepEqual(polish.filter((w) => !/^[Źź]le$/.test(w)), ['lampa', 'łódka', 'Zażółć', 'zebra', 'zupa', 'żaba']);
  assert.ok(polish.indexOf('zupa') < polish.indexOf('źle') && polish.indexOf('Źle') < polish.indexOf('żaba'), 'ź is between z and ż');
  // English collation files ż under z, so the words interleave differently
  const english = run('sort', words, { locale: 'en' }).split('\n');
  assert.ok(english.indexOf('żaba') < english.indexOf('Zażółć'), 'English: żaba sorts as "zaba", before "zazolc"');
  assert.notDeepEqual(polish, english);
  assert.equal(run('sort', 'b\nä\na', { locale: 'de' }), 'a\nä\nb');
  assert.equal(run('sort', 'z\nä\na', { locale: 'sv' }), 'a\nz\nä', 'Swedish puts ä after z');
});

test('sort by length and by leading number', () => {
  assert.equal(run('sortLength', 'ccc\na\nbb\n'), 'a\nbb\nccc\n');
  assert.equal(run('sortLength', 'ccc\na\nbb'), 'a\nbb\nccc');
  assert.equal(run('sortLength', 'ccc\na\nbb', { order: 'desc' }), 'ccc\nbb\na');
  assert.equal(run('sortLength', 'ab\n😀😀😀\nabcd'), 'ab\n😀😀😀\nabcd', 'emoji count as one character each');
  const nums = '10 apples\n2 pears\nno number\n-5 cold\n3.5 x\n1,5 y';
  assert.equal(run('sortNumber', nums), '-5 cold\n1,5 y\n2 pears\n3.5 x\n10 apples\nno number');
  assert.equal(run('sortNumber', nums, { order: 'desc' }), '10 apples\n3.5 x\n2 pears\n1,5 y\n-5 cold\nno number');
});

test('reverse and shuffle keep every line', () => {
  assert.equal(run('reverse', 'a\nb\nc\n'), 'c\nb\na\n');
  const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
  const a = run('shuffle', text, {}, seeded(5));
  assert.deepEqual(a.split('\n').sort(), text.split('\n').sort());
  assert.notEqual(a, text);
  assert.equal(a, run('shuffle', text, {}, seeded(5)), 'same seed, same result');
  assert.notEqual(a, run('shuffle', text, {}, seeded(6)));
  assert.equal(run('shuffle', 'only', {}), 'only');
});

test('duplicates: remove, keep only duplicated, count', () => {
  assert.equal(run('dedupe', 'a\nB\na\nb\nA\n a'), 'a\nB\nb\nA\n a');
  assert.equal(run('dedupe', 'a\nB\na\nb\nA\n a', { ignoreCase: true }), 'a\nB\n a');
  assert.equal(run('dedupe', 'a\nB\na\nb\nA\n a', { ignoreCase: true, trim: true }), 'a\nB');
  assert.equal(run('onlyDuplicates', 'x\ny\nx\nz\ny\nx'), 'x\ny');
  assert.equal(run('onlyDuplicates', 'a\nA\nb', { ignoreCase: true }), 'a');
  assert.equal(run('count', 'b\na\nb\n\nc\nb\na'), '3\tb\n2\ta\n1\tc');
  assert.equal(run('count', 'a\n\na', { skipEmpty: false }), '2\ta\n1\t');
  assert.equal(run('count', 'A\na', { ignoreCase: true }), '2\tA');
});

test('remove empty lines and filter lines', () => {
  assert.equal(run('removeEmpty', 'a\n\n  \nb'), 'a\nb');
  assert.equal(run('removeEmpty', 'a\n\n  \nb', { whitespace: false }), 'a\n  \nb');
  const fruit = 'Apple pie\nbanana\napple tart';
  assert.equal(run('filter', fruit, { text: 'apple' }), 'Apple pie\napple tart');
  assert.equal(run('filter', fruit, { text: 'apple', ignoreCase: false }), 'apple tart');
  assert.equal(run('filter', fruit, { text: 'apple', mode: 'remove' }), 'banana');
  assert.equal(run('filter', fruit, { text: '^a.*t$', regex: true }), 'apple tart');
  assert.equal(run('filter', fruit, { text: '' }), fruit);
  assert.throws(() => run('filter', fruit, { text: '(', regex: true }), /Invalid regular expression/);
});

test('line numbers can be added and removed again', () => {
  assert.equal(run('number', 'a\nb\nc'), '1. a\n2. b\n3. c');
  assert.equal(run('number', 'a\nb', { start: 9, pad: true }), '09. a\n10. b');
  assert.equal(run('number', 'a\nb', { separator: ':\\t' }), '1:\ta\n2:\tb');
  assert.throws(() => run('number', 'a', { start: 1.5 }), /whole number/);
  assert.equal(run('unnumber', '1. a\n2) b\n3: c\n4 - d\n5\te\n2024 report\n  7. f'), 'a\nb\nc\nd\ne\n2024 report\nf');
  const text = 'first\nsecond\nthird\n';
  assert.equal(run('unnumber', run('number', text)), text);
});

test('prefix/suffix, join and split', () => {
  assert.equal(run('affix', 'a\n\nb', { prefix: '> ', suffix: ';' }), '> a;\n\n> b;');
  assert.equal(run('affix', 'a\n\nb', { prefix: '> ', suffix: ';', skipEmpty: false }), '> a;\n> ;\n> b;');
  assert.equal(run('affix', 'a', { prefix: '\\t' }), '\ta');
  assert.equal(run('join', 'a\nb\n\nc\n'), 'a, b, c');
  assert.equal(run('join', 'a\nb\nc', { separator: ',', quote: "'" }), "'a','b','c'");
  assert.equal(run('join', 'a\nb\n\nc', { skipEmpty: false }), 'a, b, , c');
  assert.equal(run('join', 'a\nb', { separator: '\\t' }), 'a\tb');
  assert.equal(run('split', 'a, b,,c ,'), 'a\nb\nc');
  assert.equal(run('split', 'a, b,,c ,', { trim: false, skipEmpty: false }), 'a\n b\n\nc \n');
  assert.equal(run('split', 'a\tb\tc', { separator: '\\t' }), 'a\nb\nc');
  assert.throws(() => run('split', 'a', { separator: '' }), /separator/);
  const lines = 'alpha\nbeta\ngamma';
  assert.equal(run('split', run('join', lines)), lines);
});

test('clean-up: whitespace and line breaks', () => {
  assert.equal(run('trim', '  a  \n\tb\t'), 'a\nb');
  assert.equal(run('trim', '  a  \n  b  ', { mode: 'start' }), 'a  \nb  ');
  assert.equal(run('trim', '  a  \n  b  ', { mode: 'end' }), '  a\n  b');
  assert.equal(run('collapse', 'a   b\t\tc\nd    e'), 'a b c\nd e');
  assert.equal(run('removeWhitespace', 'a b\tc\nd'), 'abcd');
  assert.equal(run('removeWhitespace', 'a b\tc\nd', { keepBreaks: true }), 'abc\nd');
  assert.equal(run('removeBreaks', 'a\nb\r\nc\n'), 'a b c');
  assert.equal(run('removeBreaks', 'a\nb\nc', { replacement: '' }), 'abc');
  assert.equal(run('removeBreaks', 'a\nb\nc', { replacement: '|' }), 'a|b|c');
});

test('clean-up: diacritics, tabs, line endings, reverse', () => {
  assert.equal(run('diacritics', 'zażółć gęślą jaźń ŁÓDŹ Œuvre Straße café'), 'zazolc gesla jazn LODZ OEuvre Strasse cafe');
  assert.equal(run('tabsToSpaces', 'a\tb\n\tx\nabcd\te'), 'a   b\n    x\nabcd    e');
  assert.equal(run('tabsToSpaces', 'a\tb', { width: 2 }), 'a b');
  assert.throws(() => run('tabsToSpaces', 'a', { width: 0 }), /from 1 to 16/);
  assert.equal(run('spacesToTabs', '        x\n  y\n     z'), '\t\tx\n  y\n\t z');
  assert.throws(() => run('spacesToTabs', 'a', { width: 20 }), RangeError);
  assert.equal(run('lineEndings', 'a\nb\r\nc\rd'), 'a\r\nb\r\nc\r\nd');
  assert.equal(run('lineEndings', 'a\nb\r\nc\rd', { target: 'lf' }), 'a\nb\nc\nd');
  assert.equal(run('lineEndings', 'a\nb', { target: 'cr' }), 'a\rb');
  assert.equal(run('reverseChars', 'abc\nżółw'), 'cba\nwłóż');
  assert.equal(run('reverseChars', '😀a'), 'a😀');
});

test('extract emails, URLs and numbers', () => {
  const mail = 'Mail anna.k@example.com, bob@test.example.org; anna.k@example.com. Not-an-email@ here';
  assert.equal(run('emails', mail), 'anna.k@example.com\nbob@test.example.org');
  assert.equal(run('emails', mail, { unique: false }).split('\n').length, 3);
  assert.equal(run('urls', 'see https://example.com/a?b=1, and (http://x.org/y). Done!'), 'https://example.com/a?b=1\nhttp://x.org/y');
  assert.equal(run('numbers', 'a 12, -3.5 and 1,5 and 12'), '12\n-3.5\n1,5');
  assert.equal(run('numbers', 'a 12 b 12', { unique: false }), '12\n12');
  assert.equal(run('emails', 'nothing here'), '');
});

test('every operation is described and safe on empty input', () => {
  assert.deepEqual(GROUPS, ['Case', 'Lines', 'Clean-up', 'Extract']);
  assert.equal(new Set(OPERATIONS.map((o) => o.id)).size, OPERATIONS.length, 'unique ids');
  assert.equal(OPERATIONS.length, 37);
  for (const op of OPERATIONS) {
    assert.ok(op.label && op.group && Array.isArray(op.params), op.id);
    for (const p of op.params) assert.ok(['text', 'number', 'checkbox', 'select'].includes(p.type) && p.key && p.label && 'default' in p, `${op.id}.${p.key}`);
    assert.equal(run(op.id, ''), '', `${op.id} on empty text`);
    assert.equal(typeof run(op.id, 'Some Text\nsecond line\n'), 'string', op.id);
  }
  assert.throws(() => getOperation('nope'), /Unknown operation/);
  assert.deepEqual(defaultsFor(getOperation('number')), { start: 1, separator: '. ', pad: false });
});

test('properties on random lines: idempotence and no lost or invented lines', () => {
  const r = seeded(99);
  const alphabet = ['a', 'B', 'ł', 'Z', '1', ' ', '10', 'é'];
  for (let t = 0; t < 200; t++) {
    const lines = Array.from({ length: Math.floor(r() * 12) }, () => Array.from({ length: Math.floor(r() * 4) }, () => alphabet[Math.floor(r() * alphabet.length)]).join(''));
    const text = lines.join('\n') + (r() < 0.5 && lines.length ? '\n' : '');
    for (const id of ['sort', 'sortLength', 'reverse', 'shuffle']) {
      const out = run(id, text, {}, seeded(t + 1));
      assert.deepEqual(out.split('\n').sort(), text.split('\n').sort(), `${id} keeps the same lines`);
      if (text.endsWith('\n')) assert.ok(out.endsWith('\n'), `${id} keeps the final line break`);
    }
    for (const id of ['sort', 'dedupe', 'trim', 'upper', 'lower', 'diacritics', 'collapse', 'removeEmpty', 'sortLength']) {
      const once = run(id, text);
      assert.equal(run(id, once), once, `${id} is idempotent`);
    }
    const unique = run('dedupe', text).replace(/\n$/, '').split('\n');
    assert.equal(new Set(unique).size, unique.length, 'no duplicates left');
    // A final line break ends the last line (like `tac`), so "\nB" -> "B\n" cannot be undone;
    // every other shape round-trips exactly.
    if (text.endsWith('\n') || !text.startsWith('\n')) assert.equal(run('reverse', run('reverse', text)), text, JSON.stringify(text));
  }
});
