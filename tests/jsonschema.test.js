import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, SchemaError, FORMATS, deepEqual } from '../js/lib/jsonschema.js';
import { python, pythonHas } from './helpers-python.js';

const msgs = (instance, schema, options) => validate(instance, schema, options).errors.map((e) => `${e.path} ${e.keyword}`);

test('type, including integer vs number and type lists', () => {
  assert.deepEqual(msgs(1, { type: 'integer' }), []);
  assert.deepEqual(msgs(1.0, { type: 'integer' }), []); // 1.0 is the integer 1 in JSON Schema
  assert.deepEqual(msgs(1.5, { type: 'integer' }), ['$ type']);
  assert.deepEqual(msgs('1', { type: ['integer', 'string'] }), []);
  assert.deepEqual(msgs(null, { type: 'object' }), ['$ type']);
  assert.deepEqual(msgs([], { type: 'object' }), ['$ type']);
  assert.throws(() => validate(1, { type: 'int' }), SchemaError);
});

test('required, additionalProperties, and the path of each error', () => {
  const schema = { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer' }, name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, additionalProperties: false };
  const r = validate({ id: 'x', tags: ['a', 2], extra: 1 }, schema);
  assert.deepEqual(r.errors.map((e) => [e.path, e.keyword]), [['$', 'required'], ["$['id']", 'type'], ["$['tags'][1]", 'type'], ["$['extra']", 'additionalProperties']]);
  assert.match(r.errors[0].message, /name/);
  assert.equal(validate({ id: 1, name: 'a' }, schema).valid, true);
});

test('numbers, strings and arrays', () => {
  assert.deepEqual(msgs(5, { minimum: 5, maximum: 5 }), []);
  assert.deepEqual(msgs(5, { exclusiveMinimum: 5 }), ['$ exclusiveMinimum']);
  assert.deepEqual(msgs(0.3, { multipleOf: 0.1 }), []);
  assert.deepEqual(msgs(7, { multipleOf: 2 }), ['$ multipleOf']);
  assert.deepEqual(msgs('😀😀', { maxLength: 2 }), []); // counts characters, not UTF-16 units
  assert.deepEqual(msgs('abc', { minLength: 4, pattern: '^[0-9]+$' }), ['$ minLength', '$ pattern']);
  assert.deepEqual(msgs([1, 2, 1], { uniqueItems: true }), ['$ uniqueItems']);
  assert.deepEqual(msgs([{ a: 1, b: 2 }, { b: 2, a: 1 }], { uniqueItems: true }), ['$ uniqueItems']);
  assert.deepEqual(msgs([1], { minItems: 2 }), ['$ minItems']);
  assert.deepEqual(msgs([1, 'a'], { prefixItems: [{ type: 'integer' }], items: { type: 'integer' } }), ['$[1] type']);
  assert.deepEqual(msgs([1, 2, 'x'], { contains: { type: 'string' }, minContains: 1, maxContains: 1 }), []);
  assert.deepEqual(msgs([1, 2], { contains: { type: 'string' } }), ['$ contains']);
  assert.deepEqual(msgs([], { contains: { type: 'string' }, minContains: 0 }), []);
  assert.deepEqual(msgs([1, 2, 3], { items: false }), ['$[0] false', '$[1] false', '$[2] false']);
});

test('draft-07 spellings: tuple items, additionalItems, dependencies, definitions', () => {
  assert.deepEqual(msgs([1, 'a', 3], { items: [{ type: 'integer' }, { type: 'string' }], additionalItems: false }), ['$[2] false']);
  assert.deepEqual(msgs({ a: 1 }, { dependencies: { a: ['b'] } }), ['$ dependentRequired']);
  assert.deepEqual(msgs({ a: 1 }, { dependencies: { a: { required: ['b'] } } }), ['$ required']);
  assert.deepEqual(msgs(1, { definitions: { n: { type: 'string' } }, $ref: '#/definitions/n' }), ['$ type']);
});

test('combinators and if/then/else', () => {
  assert.deepEqual(msgs(5, { anyOf: [{ type: 'string' }, { minimum: 10 }] }), ['$ anyOf']);
  assert.ok(validate(5, { anyOf: [{ type: 'string' }, { minimum: 10 }] }).errors[0].causes.length === 2);
  assert.deepEqual(msgs(5, { oneOf: [{ type: 'integer' }, { minimum: 1 }] }), ['$ oneOf']);
  assert.match(validate(5, { oneOf: [{ type: 'integer' }, { minimum: 1 }] }).errors[0].message, /options 1, 2/);
  assert.deepEqual(msgs(5, { oneOf: [{ type: 'integer' }, { type: 'string' }] }), []);
  assert.deepEqual(msgs(5, { not: { type: 'integer' } }), ['$ not']);
  assert.deepEqual(msgs(5, { allOf: [{ minimum: 1 }, { maximum: 3 }] }), ['$ maximum']);
  const s = { if: { properties: { c: { const: 'PL' } }, required: ['c'] }, then: { required: ['nip'] }, else: { required: ['vat'] } };
  assert.deepEqual(msgs({ c: 'PL' }, s), ['$ required']);
  assert.deepEqual(msgs({ c: 'PL', nip: '1' }, s), []);
  assert.deepEqual(msgs({ c: 'DE' }, s), ['$ required']);
});

test('$ref: pointers, escapes, $anchor, $id, recursion, and what cannot be followed', () => {
  const tree = { $defs: { node: { type: 'object', properties: { kids: { type: 'array', items: { $ref: '#/$defs/node' } }, n: { type: 'integer' } } } }, $ref: '#/$defs/node' };
  assert.deepEqual(msgs({ kids: [{ kids: [{ n: 'x' }] }] }, tree), ["$['kids'][0]['kids'][0]['n'] type"]);
  assert.deepEqual(msgs({ a: 'x' }, { properties: { a: { $ref: '#/$defs/a~1b' } }, $defs: { 'a/b': { type: 'integer' } } }), ["$['a'] type"]);
  assert.deepEqual(msgs('x', { $defs: { s: { $anchor: 'str', type: 'integer' } }, $ref: '#str' }), ['$ type']);
  assert.deepEqual(msgs('x', { $defs: { s: { $id: 'https://e.x/s', type: 'integer' } }, $ref: 'https://e.x/s' }), ['$ type']);
  assert.throws(() => validate(1, { $ref: '#/$defs/missing' }), /does not point/);
  assert.throws(() => validate(1, { $ref: 'https://other.example/x.json' }), /outside this schema/);
  assert.throws(() => validate(1, { $defs: { a: { $ref: '#/$defs/a' } }, $ref: '#/$defs/a' }), /\$ref loop/);
});

test('enum and const compare by value, objects regardless of key order', () => {
  assert.deepEqual(msgs({ a: 1, b: [1] }, { const: { b: [1], a: 1 } }), []);
  assert.deepEqual(msgs(1, { enum: ['1', true, null] }), ['$ enum']);
  assert.deepEqual(msgs(null, { enum: ['1', true, null] }), []);
  assert.equal(deepEqual([1, { a: [] }], [1, { a: [] }]), true);
  assert.equal(deepEqual([1], { 0: 1 }), false);
});

test('boolean schemas, propertyNames, patternProperties, dependentSchemas', () => {
  assert.equal(validate(1, true).valid, true);
  assert.deepEqual(msgs(1, false), ['$ false']);
  assert.deepEqual(msgs({ ab: 1, Zed: 2 }, { propertyNames: { pattern: '^[a-z]+$' } }), ['$ pattern']);
  assert.deepEqual(msgs({ x_1: 'a', y: 2 }, { patternProperties: { '^x_': { type: 'integer' } }, additionalProperties: false }), ["$['x_1'] type", "$['y'] additionalProperties"]);
  assert.deepEqual(msgs({ card: 1 }, { dependentSchemas: { card: { required: ['billing'] } } }), ['$ required']);
  assert.deepEqual(msgs({ a: 1, b: 2 }, { maxProperties: 1 }), ['$ maxProperties']);
});

test('formats are checked by default and can be switched off', () => {
  const f = (format, value) => validate(value, { format }).valid;
  assert.equal(f('date', '2024-02-29'), true);
  assert.equal(f('date', '2023-02-29'), false);
  assert.equal(f('date-time', '2024-01-01T10:00:00Z'), true);
  assert.equal(f('date-time', '2024-01-01 10:00:00'), false);
  assert.equal(f('email', 'a@b.pl'), true);
  assert.equal(f('email', 'a@b'), false);
  assert.equal(f('uuid', '123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(f('uuid', '123e4567'), false);
  assert.equal(f('ipv4', '192.168.0.1'), true);
  assert.equal(f('ipv4', '256.1.1.1'), false);
  assert.equal(f('ipv4', '01.1.1.1'), false);
  assert.equal(f('uri', 'https://example.com/a?b=1'), true);
  assert.equal(f('uri', 'example.com'), false);
  assert.equal(f('hostname', 'a-b.example.com'), true);
  assert.equal(f('hostname', '-a.example.com'), false);
  assert.equal(f('unknown-format', 'anything'), true);
  assert.equal(validate('nope', { format: 'date' }, { formats: false }).valid, true);
  assert.equal(typeof FORMATS.regex, 'function');
});

test('unsupported keywords are reported, errors are capped, bad schemas are refused', () => {
  const r = validate({ a: 1 }, { unevaluatedProperties: false });
  assert.equal(r.valid, true);
  assert.match(r.warnings[0], /unevaluatedProperties/);
  const many = validate(Array.from({ length: 50 }, () => 'x'), { items: { type: 'integer' } }, { maxErrors: 10 });
  assert.equal(many.errors.length, 10);
  assert.equal(many.truncated, true);
  assert.throws(() => validate(1, 'string'), SchemaError);
  assert.throws(() => validate('a', { pattern: '(' }), /regular expression/);
  assert.throws(() => validate({ a: 1 }, { properties: { a: 5 } }), SchemaError);
});

test('matches Python jsonschema (Draft 2020-12) on valid/invalid for a mixed corpus', { skip: !pythonHas('jsonschema') && 'python3 jsonschema is not installed' }, () => {
  const person = { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, age: { type: 'integer', minimum: 0, maximum: 150 }, email: { type: 'string', pattern: '@' }, tags: { type: 'array', items: { type: 'string' }, uniqueItems: true, maxItems: 3 } }, additionalProperties: false };
  const cases = [];
  const schemas = {
    person,
    nums: { type: 'number', multipleOf: 0.25, exclusiveMaximum: 10 },
    anyOne: { anyOf: [{ type: 'string', maxLength: 3 }, { type: 'integer' }] },
    exactlyOne: { oneOf: [{ type: 'integer' }, { type: 'number', minimum: 2 }] },
    tuple: { prefixItems: [{ type: 'integer' }, { type: 'string' }], items: false },
    cond: { if: { properties: { k: { const: 1 } }, required: ['k'] }, then: { required: ['a'] }, else: { required: ['b'] } },
    names: { propertyNames: { pattern: '^[a-z]+$' }, minProperties: 1, maxProperties: 2, patternProperties: { '^n': { type: 'integer' } } },
    consts: { enum: [1, 'a', null, [1, 2], { x: 1 }] },
    contains: { contains: { type: 'integer', minimum: 5 }, minContains: 2, maxContains: 3 },
    deps: { dependentRequired: { a: ['b'] }, dependentSchemas: { c: { properties: { d: { type: 'string' } } } } },
    ref: { $defs: { n: { type: 'object', properties: { next: { $ref: '#/$defs/n' }, v: { type: 'integer' } } } }, $ref: '#/$defs/n' },
    negate: { not: { type: ['string', 'null'] } },
  };
  const instances = [
    null, true, 0, 1, 1.0, 1.5, 2, 2.25, 3, 5, 9.75, 10, -1, 'a', 'abcd', '', [], [1, 2], [1, 'a'], [1, 'a', 3], [5, 6, 7], [5, 6, 7, 8], [1, 1], ['a', 'b'], ['a', 'a'], [{ a: 1 }, { a: 1 }],
    {}, { a: 1 }, { a: 1, b: 2 }, { name: 'x' }, { name: '' }, { name: 'x', age: 151 }, { name: 'x', age: 1.5 }, { name: 'x', email: 'a@b', tags: ['a', 'b', 'c', 'd'] }, { name: 'x', extra: 1 },
    { k: 1 }, { k: 1, a: 1 }, { k: 2, b: 1 }, { k: 2 }, { ab: 1, cd: 2, ef: 3 }, { Ab: 1 }, { n1: 'x' }, { n1: 1 }, { c: 1 }, { c: 1, d: 1 }, { c: 1, d: 'x' }, { x: 1 }, { next: { next: { v: 'bad' } } }, { next: { v: 1 } },
  ];
  for (const [name, schema] of Object.entries(schemas)) for (const instance of instances) cases.push({ name, schema, instance });
  const expected = python(
    'import sys, json\nfrom jsonschema import Draft202012Validator as V\ncases = json.load(sys.stdin)\nprint(json.dumps([V(c["schema"]).is_valid(c["instance"]) for c in cases]))',
    cases,
  );
  const mismatches = [];
  cases.forEach((c, i) => {
    const mine = validate(c.instance, c.schema, { formats: false }).valid;
    if (mine !== expected[i]) mismatches.push(`${c.name} ${JSON.stringify(c.instance)}: mine=${mine} python=${expected[i]}`);
  });
  assert.deepEqual(mismatches, []);
  assert.ok(cases.length > 500);
});
