import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeString, lengthCases, numberCases, INT_TYPES, NUMBER_SPECIALS, isValidDate, dateCases,
  SPECIAL_DATES, SPECIAL_TIMESTAMPS, dstCases, FILLS,
} from '../js/lib/boundary.js';
import { counterString } from '../js/lib/strings.js';

test('makeString has the exact length for every fill', () => {
  for (const fill of Object.keys(FILLS)) {
    for (const n of [0, 1, 2, 10, 255, 1000]) {
      assert.equal(Array.from(makeString(n, fill)).length, n, `${fill} ${n}`);
    }
  }
  assert.match(makeString(30, 'digits'), /^\d{30}$/);
  assert.equal(makeString(12, 'digits'), '123456789012');
  assert.equal(makeString(10, 'counter'), counterString(10));
  assert.equal(makeString(3, 'emoji').length, 6); // 2 UTF-16 units each
  assert.equal(new TextEncoder().encode(makeString(3, 'polish')).length, 6); // 2 bytes each
  assert.throws(() => makeString(5, 'nope'), RangeError);
});

test('lengthCases lists the six boundaries plus empty, with expected validity', () => {
  const cases = lengthCases({ min: 3, max: 10 });
  assert.deepEqual(cases.map((c) => c.length), [0, 2, 3, 4, 9, 10, 11]);
  assert.deepEqual(cases.map((c) => c.valid), [false, false, true, true, true, true, false]);
  assert.ok(cases.every((c) => Array.from(c.value).length === c.length));
  assert.equal(cases.find((c) => c.length === 11).label, 'max + 1');
});

test('lengthCases merges cases that coincide and never goes negative', () => {
  const same = lengthCases({ min: 5, max: 5 });
  assert.deepEqual(same.map((c) => c.length), [0, 4, 5, 6]);
  assert.equal(same.find((c) => c.length === 5).label, 'min / max');
  const zero = lengthCases({ min: 0, max: 3 });
  assert.deepEqual(zero.map((c) => c.length), [0, 1, 2, 3, 4]);
  assert.ok(zero[0].label.includes('empty') && zero[0].label.includes('min'));
  assert.ok(zero[0].valid);
  const one = lengthCases({ min: 1, max: 1 });
  assert.deepEqual(one.map((c) => c.length), [0, 1, 2]);
  assert.deepEqual(lengthCases({ min: 0, max: 1 }).map((c) => c.length), [0, 1, 2]);
});

test('lengthCases validates input', () => {
  assert.throws(() => lengthCases({ min: -1, max: 5 }), /Minimum length/);
  assert.throws(() => lengthCases({ min: 6, max: 5 }), /cannot be greater/);
  assert.throws(() => lengthCases({ min: 0, max: 0 }), RangeError);
  assert.throws(() => lengthCases({ min: 0, max: 'abc' }), RangeError);
  assert.throws(() => lengthCases({ min: 0, max: 1_000_000 }), /below 1,000,000/);
});

test('numberCases for integers', () => {
  const c = numberCases({ min: '1', max: '100' });
  assert.deepEqual(c.map((x) => x.value), ['-1', '0', '1', '2', '99', '100', '101']);
  assert.deepEqual(c.map((x) => x.valid), [false, false, true, true, true, true, false]);
  assert.deepEqual(numberCases({ min: '1', max: '100', extras: false }).map((x) => x.value), ['0', '1', '2', '99', '100', '101']);
  assert.deepEqual(numberCases({ min: '-5', max: '5', extras: false }).map((x) => x.value), ['-6', '-5', '-4', '4', '5', '6']);
});

test('numberCases for decimals keeps precision and decimal places', () => {
  const c = numberCases({ min: '0.00', max: '999.99', step: '0.01', extras: false });
  assert.deepEqual(c.map((x) => x.value), ['-0.01', '0.00', '0.01', '999.98', '999.99', '1000.00']);
  assert.deepEqual(c.map((x) => x.valid), [false, true, true, true, true, false]);
  assert.deepEqual(numberCases({ min: '0', max: '1', step: '0.1', extras: false }).map((x) => x.value), ['-0.1', '0.0', '0.1', '0.9', '1.0', '1.1']);
  assert.deepEqual(numberCases({ min: '5', max: '5', extras: false }).map((x) => x.value), ['4', '5', '6']);
});

test('64-bit limits are exact, not rounded like JavaScript numbers', () => {
  const i64 = numberCases({ min: INT_TYPES.int64[1], max: INT_TYPES.int64[2], extras: false });
  assert.equal(i64[0].value, '-9223372036854775809');
  assert.equal(i64.at(-1).value, '9223372036854775808');
  assert.equal(i64.at(-2).value, '9223372036854775807');
  const u64 = numberCases({ min: INT_TYPES.uint64[1], max: INT_TYPES.uint64[2], extras: false });
  assert.equal(u64.at(-1).value, '18446744073709551616');
  assert.equal(u64[0].value, '-1');
  const safe = numberCases({ min: INT_TYPES.safe[1], max: INT_TYPES.safe[2], extras: false });
  assert.equal(safe.at(-1).value, '9007199254740992');
  for (const [, , lo, hi] of Object.entries(INT_TYPES).map(([k, v]) => [k, ...v])) assert.ok(BigInt(lo) < BigInt(hi));
});

test('numberCases validates input', () => {
  assert.throws(() => numberCases({ min: 'abc', max: '5' }), /Minimum must be a plain number/);
  assert.throws(() => numberCases({ min: '1', max: '1e5' }), /Maximum must be a plain number/);
  assert.throws(() => numberCases({ min: '5', max: '1' }), /cannot be greater/);
  assert.throws(() => numberCases({ min: '1', max: '5', step: '0' }), /greater than zero/);
  assert.throws(() => numberCases({ min: '1', max: '5', step: '-1' }), RangeError);
  assert.throws(() => numberCases({ min: '1', max: '5', step: '0.' + '1'.repeat(25) }), /20 decimal/);
  assert.ok(NUMBER_SPECIALS.length >= 15);
});

test('isValidDate follows the real calendar', () => {
  for (const [d, ok] of [
    ['2024-02-29', true], ['2023-02-29', false], ['2000-02-29', true], ['1900-02-29', false], ['2100-02-29', false],
    ['2026-04-30', true], ['2026-04-31', false], ['2026-13-01', false], ['2026-00-10', false], ['2026-01-00', false],
    ['2026-1-1', false], ['abcd-ef-gh', false], ['0001-01-01', true], ['9999-12-31', true],
  ]) assert.equal(isValidDate(d), ok, d);
});

test('every special date label agrees with the calendar', () => {
  for (const s of SPECIAL_DATES) assert.equal(isValidDate(s.value), s.valid, `${s.label}: ${s.value}`);
});

test('special timestamps match their epoch seconds', () => {
  for (const [label, iso, epoch] of SPECIAL_TIMESTAMPS) {
    if (epoch === '') continue;
    assert.equal(String(Date.parse(iso) / 1000), epoch, label);
  }
  assert.equal(2 ** 31 - 1, 2147483647);
});

test('dateCases around a range, including month, year and leap boundaries', () => {
  const c = dateCases({ min: '2026-01-01', max: '2026-12-31' });
  assert.deepEqual(c.map((x) => x.value), ['2025-12-31', '2026-01-01', '2026-01-02', '2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(c.map((x) => x.valid), [false, true, true, true, true, false]);
  assert.deepEqual(dateCases({ min: '2024-02-28', max: '2024-03-01' }).map((x) => x.value), ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02']);
  assert.deepEqual(dateCases({ min: '2023-02-28', max: '2023-02-28' }).map((x) => x.value), ['2023-02-27', '2023-02-28', '2023-03-01']);
  // the extreme calendar ends
  const ends = dateCases({ min: '0001-01-01', max: '9999-12-31' });
  assert.equal(ends.at(-1).value, '10000-01-01');
  assert.equal(ends.at(-1).valid, false);
  assert.equal(ends.at(-2).valid, true);
  assert.equal(ends[0].valid, false);
});

test('dateCases validates input', () => {
  assert.throws(() => dateCases({ min: '2023-02-30', max: '2024-01-01' }), /Minimum must be a real date/);
  assert.throws(() => dateCases({ min: '2024-01-01', max: 'tomorrow' }), /Maximum must be a real date/);
  assert.throws(() => dateCases({ min: '2025-01-02', max: '2025-01-01' }), /cannot be after/);
});

test('dstCases finds the clock-change Sundays', () => {
  const d = dstCases(2026);
  assert.deepEqual(d.map((x) => x.value), ['2026-03-29T02:30:00', '2026-10-25T02:30:00', '2026-03-08T02:30:00', '2026-11-01T01:30:00']);
  assert.deepEqual(dstCases(2024).map((x) => x.value.slice(0, 10)), ['2024-03-31', '2024-10-27', '2024-03-10', '2024-11-03']);
  assert.deepEqual(dstCases(2025).map((x) => x.value.slice(0, 10)), ['2025-03-30', '2025-10-26', '2025-03-09', '2025-11-02']);
  assert.deepEqual(d.map((x) => x.kind), ['skipped', 'repeated', 'skipped', 'repeated']);
  assert.throws(() => dstCases(1800), RangeError);
});

test('dstCases agree with the real time zone database', () => {
  // UTC offset in hours at 12:00 UTC on the given day (the switch itself happens before noon UTC)
  const offset = (zone, y, m, d) =>
    Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(Date.UTC(y, m - 1, d, 12)))) - 12;
  for (const year of [2024, 2025, 2026, 2027]) {
    const [euSpring, euAutumn, usSpring, usAutumn] = dstCases(year).map((x) => Number(x.value.slice(8, 10)));
    const wa = (m, d) => offset('Europe/Warsaw', year, m, d);
    const ny = (m, d) => offset('America/New_York', year, m, d);
    assert.deepEqual([wa(3, euSpring - 2), wa(3, euSpring - 1), wa(3, euSpring)], [1, 1, 2], `Warsaw spring ${year}`);
    assert.deepEqual([wa(10, euAutumn - 2), wa(10, euAutumn - 1), wa(10, euAutumn)], [2, 2, 1], `Warsaw autumn ${year}`);
    assert.deepEqual([ny(3, usSpring - 2), ny(3, usSpring - 1), ny(3, usSpring)], [-5, -5, -4], `New York spring ${year}`);
    assert.deepEqual([ny(11, usAutumn - 2), ny(11, usAutumn - 1), ny(11, usAutumn)], [-4, -4, -5], `New York autumn ${year}`);
  }
});
