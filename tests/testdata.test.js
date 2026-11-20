import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePerson, formatRecords, FIELDS, uuid } from '../js/lib/testdata.js';
import { validatePesel, validateNip, validateRegon, validateIban } from '../js/lib/polish.js';
import { NAUGHTY, CATEGORIES } from '../js/lib/naughty.js';

test('generated people are internally consistent', () => {
  for (let i = 0; i < 300; i++) {
    const p = generatePerson();
    const pesel = validatePesel(p.pesel);
    assert.equal(pesel.valid, true);
    assert.ok(pesel.info.includes(p.birthDate), `${pesel.info} vs ${p.birthDate}`);
    assert.ok(pesel.info.includes(p.sex === 'F' ? 'female' : 'male'));
    assert.equal(validateNip(p.nip).valid, true);
    assert.equal(validateRegon(p.regon).valid, true);
    assert.equal(validateIban(p.iban).valid, true);
    assert.match(p.email, /^[a-z]+\.[a-z]+\d+@example\.(com|org|net)$/);
    assert.match(p.phone, /^\+48 \d{3} \d{3} \d{3}$/);
    assert.match(p.postalCode, /^\d{2}-\d{3}$/);
    assert.match(p.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(Object.keys(p).length, FIELDS.length);
  }
});

test('formatRecords outputs JSON, CSV and TSV with proper quoting', () => {
  const recs = [{ a: 'x', b: 'has,comma' }, { a: 'say "hi"', b: 'line\nbreak' }];
  assert.deepEqual(JSON.parse(formatRecords(recs, ['a'], 'json')), [{ a: 'x' }, { a: 'say "hi"' }]);
  assert.equal(formatRecords(recs, ['a', 'b'], 'csv'), 'a,b\nx,"has,comma"\n"say ""hi""","line\nbreak"');
  assert.equal(formatRecords(recs, ['a', 'b'], 'tsv').split('\n')[1], 'x\thas,comma');
});

test('uuid generates v4 values with and without crypto', () => {
  assert.match(uuid(), /^[0-9a-f-]{36}$/);
  assert.match(uuid(Math.random), /^[0-9a-f]{8}-[0-9a-f]{4}-4/);
});

test('naughty strings are well formed', () => {
  assert.ok(NAUGHTY.length >= 80);
  assert.ok(CATEGORIES.length >= 6);
  for (const n of NAUGHTY) {
    assert.equal(typeof n.value, 'string');
    assert.ok(n.label && n.category);
  }
  assert.equal(new Set(NAUGHTY.map((n) => `${n.category}/${n.label}`)).size, NAUGHTY.length, 'unique labels');
});
