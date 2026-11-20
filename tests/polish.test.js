import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePesel, validatePesel, generateNip, validateNip, generateRegon, validateRegon,
  generateIban, validateIban, formatIban,
} from '../js/lib/polish.js';

test('known-valid identifiers pass validation', () => {
  assert.equal(validatePesel('44051401359').valid, true);
  assert.equal(validateNip('1234563218').valid, true);
  assert.equal(validateNip('123-456-32-18').valid, true);
  assert.equal(validateRegon('123456785').valid, true);
  assert.equal(validateRegon('12345678512347').valid, true);
  assert.equal(validateIban('PL61109010140000071219812874').valid, true);
  assert.equal(validateIban(formatIban('PL61109010140000071219812874')).valid, true);
});

test('corrupted identifiers fail validation', () => {
  assert.equal(validatePesel('44051401358').valid, false);
  assert.equal(validatePesel('4405140135').valid, false);
  assert.equal(validatePesel('44133201359').valid, false); // month 13 invalid
  assert.equal(validateNip('1234563219').valid, false);
  assert.equal(validateRegon('123456786').valid, false);
  assert.equal(validateIban('PL61109010140000071219812875').valid, false);
  assert.equal(validateIban('PL6110901014000007121981287').valid, false);
});

test('PESEL encodes birth date and sex across centuries', () => {
  const cases = [
    ['1899-05-04', 'F'], ['1944-05-14', 'M'], ['2001-02-28', 'F'], ['2024-12-31', 'M'], ['2150-01-01', 'F'],
  ];
  for (const [iso, sex] of cases) {
    const p = generatePesel({ date: new Date(iso), sex });
    const v = validatePesel(p);
    assert.equal(v.valid, true, `${iso} ${p}`);
    assert.ok(v.info.includes(iso), v.info);
    assert.ok(v.info.includes(sex === 'F' ? 'female' : 'male'), v.info);
  }
  assert.throws(() => generatePesel({ date: new Date('1700-01-01'), sex: 'M' }), RangeError);
});

test('generated NIP, REGON and IBAN are always valid', () => {
  for (let i = 0; i < 500; i++) {
    assert.equal(validateNip(generateNip()).valid, true);
    assert.equal(validateRegon(generateRegon(9)).valid, true);
    assert.equal(validateRegon(generateRegon(14)).valid, true);
    const iban = generateIban();
    assert.equal(iban.length, 28);
    assert.equal(validateIban(iban).valid, true, iban);
  }
});
