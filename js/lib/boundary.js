// Boundary-value generators for text length, numbers and dates. No DOM access.
import { counterString, parseLength } from './strings.js';

// ---- text length ---------------------------------------------------------------

export const FILLS = {
  a: 'Letter "a"',
  alnum: 'Letters and digits',
  digits: 'Digits',
  polish: 'Polish letters (2 bytes each in UTF-8)',
  emoji: 'Emoji (2 UTF-16 units, 4 UTF-8 bytes each)',
  counter: 'Counter string (shows where it was cut)',
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const POLISH = Array.from('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ');

/** A string of exactly `length` characters (code points) of the chosen kind. */
export function makeString(length, fill = 'a') {
  if (length === 0) return '';
  switch (fill) {
    case 'a':
      return 'a'.repeat(length);
    case 'digits':
      return Array.from({ length }, (_, i) => (i + 1) % 10).join('');
    case 'alnum':
      return Array.from({ length }, (_, i) => ALNUM[i % ALNUM.length]).join('');
    case 'polish':
      return Array.from({ length }, (_, i) => POLISH[i % POLISH.length]).join('');
    case 'emoji':
      return '😀'.repeat(length);
    case 'counter':
      return counterString(length);
    default:
      throw new RangeError(`Unknown fill: ${fill}`);
  }
}

/**
 * Strings just below, at and just above the allowed length limits.
 * @returns {{label: string, length: number, value: string, valid: boolean}[]}
 */
export function lengthCases({ min = 0, max, fill = 'a' }) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isInteger(lo) || lo < 0) throw new RangeError('Minimum length must be a whole number of 0 or more.');
  parseLength(hi); // validates max: whole number, 1..1,000,000
  if (lo > hi) throw new RangeError('Minimum length cannot be greater than the maximum.');
  if (hi + 1 > 1_000_000) throw new RangeError('Maximum length must be below 1,000,000 so that "max + 1" can be generated.');

  const wanted = [
    ['empty', 0],
    ['min − 1', lo - 1],
    ['min', lo],
    ['min + 1', lo + 1],
    ['max − 1', hi - 1],
    ['max', hi],
    ['max + 1', hi + 1],
  ];
  const seen = new Map();
  for (const [label, length] of wanted) {
    if (length < 0) continue;
    if (seen.has(length)) {
      // e.g. min = max, or min = 0: keep one case and name every role it plays
      const existing = seen.get(length);
      if (!existing.label.split(' / ').includes(label)) existing.label += ` / ${label}`;
      continue;
    }
    seen.set(length, { label, length, valid: length >= lo && length <= hi });
  }
  return [...seen.values()].map((c) => ({ ...c, value: makeString(c.length, fill) }));
}

// ---- numbers -------------------------------------------------------------------

export const INT_TYPES = {
  int8: ['int8 (signed 8-bit)', '-128', '127'],
  uint8: ['uint8 / byte', '0', '255'],
  int16: ['int16 (signed 16-bit)', '-32768', '32767'],
  uint16: ['uint16', '0', '65535'],
  int32: ['int32 (signed 32-bit)', '-2147483648', '2147483647'],
  uint32: ['uint32', '0', '4294967295'],
  int64: ['int64 / long', '-9223372036854775808', '9223372036854775807'],
  uint64: ['uint64', '0', '18446744073709551615'],
  safe: ['JavaScript safe integer', '-9007199254740991', '9007199254740991'],
};

const decimalsOf = (s) => (s.includes('.') ? s.split('.')[1].length : 0);

function parseScaled(text, decimals, what) {
  const s = String(text).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`${what} must be a plain number such as 10, -5 or 0.01.`);
  const negative = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const scaled = BigInt(whole + frac.padEnd(decimals, '0'));
  return negative ? -scaled : scaled;
}

function formatScaled(value, decimals) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const text = decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
  return negative ? `-${text}` : text;
}

/**
 * Values just below, at and just above a numeric range. Exact for any size or number of
 * decimals (uses BigInt), so 64-bit limits are not rounded.
 * @returns {{label: string, value: string, valid: boolean}[]}
 */
export function numberCases({ min, max, step = '1', extras = true }) {
  const decimals = Math.max(decimalsOf(String(min).trim()), decimalsOf(String(max).trim()), decimalsOf(String(step).trim()));
  if (decimals > 20) throw new RangeError('At most 20 decimal places are supported.');
  const lo = parseScaled(min, decimals, 'Minimum');
  const hi = parseScaled(max, decimals, 'Maximum');
  const st = parseScaled(step, decimals, 'Step');
  if (st <= 0n) throw new RangeError('Step must be greater than zero.');
  if (lo > hi) throw new RangeError('Minimum cannot be greater than the maximum.');

  const wanted = [
    ['min − step', lo - st],
    ['min', lo],
    ['min + step', lo + st],
    ['max − step', hi - st],
    ['max', hi],
    ['max + step', hi + st],
  ];
  if (extras) wanted.push(['zero', 0n], ['negative one step', -st], ['one step', st]);

  const seen = new Map();
  for (const [label, v] of wanted) {
    if (seen.has(v)) {
      const existing = seen.get(v);
      if (!existing.label.split(' / ').includes(label)) existing.label += ` / ${label}`;
      continue;
    }
    seen.set(v, { label, value: formatScaled(v, decimals), valid: v >= lo && v <= hi, sort: v });
  }
  return [...seen.values()].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)).map(({ sort, ...c }) => c);
}

/** Numbers that regularly break parsers, storage and arithmetic. */
export const NUMBER_SPECIALS = [
  ['JavaScript max safe integer', '9007199254740991'],
  ['Max safe integer + 1 (precision is lost beyond this)', '9007199254740992'],
  ['Float32 max', '3.4028235e38'],
  ['Float64 max', '1.7976931348623157e308'],
  ['Float64 smallest positive', '5e-324'],
  ['Float rounding: 0.1 + 0.2', '0.30000000000000004'],
  ['Negative zero', '-0'],
  ['Tiny exponent', '1e-7'],
  ['Overflows to Infinity', '1e309'],
  ['Not a number', 'NaN'],
  ['Infinity', 'Infinity'],
  ['Negative infinity', '-Infinity'],
  ['Leading zeros', '007'],
  ['Thousands separator', '1,000'],
  ['Decimal comma', '1,5'],
  ['Leading plus sign', '+5'],
  ['Hexadecimal literal', '0x1F'],
  ['Trailing dot', '5.'],
  ['Leading dot', '.5'],
];

// ---- dates ---------------------------------------------------------------------

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(2000, mo - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Days since 1970-01-01 for a YYYY-MM-DD (or longer-year) date; used instead of string comparison. */
function dayIndex(text) {
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  return Math.round(date.getTime() / 86_400_000);
}

function shiftDate(text, days) {
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  date.setUTCDate(date.getUTCDate() + days);
  // toISOString writes years outside 0000-9999 as +010000 / -000001: normalise to at least 4 digits
  const [, sign, year, month, day] = /^([+-]?)(\d+)-(\d{2})-(\d{2})T/.exec(date.toISOString());
  return `${sign === '-' ? '-' : ''}${String(Number(year)).padStart(4, '0')}-${month}-${day}`;
}

/** Dates (YYYY-MM-DD) one day below, at and one day above a range. */
export function dateCases({ min, max }) {
  for (const [what, v] of [['Minimum', min], ['Maximum', max]]) {
    if (!isValidDate(v)) throw new RangeError(`${what} must be a real date written as YYYY-MM-DD.`);
  }
  if (dayIndex(min) > dayIndex(max)) throw new RangeError('Minimum date cannot be after the maximum date.');
  const wanted = [
    ['min − 1 day', shiftDate(min, -1)],
    ['min', min],
    ['min + 1 day', shiftDate(min, 1)],
    ['max − 1 day', shiftDate(max, -1)],
    ['max', max],
    ['max + 1 day', shiftDate(max, 1)],
  ];
  const seen = new Map();
  for (const [label, value] of wanted) {
    if (seen.has(value)) {
      const existing = seen.get(value);
      if (!existing.label.split(' / ').includes(label)) existing.label += ` / ${label}`;
      continue;
    }
    seen.set(value, { label, value, valid: dayIndex(value) >= dayIndex(min) && dayIndex(value) <= dayIndex(max) });
  }
  return [...seen.values()].sort((a, b) => dayIndex(a.value) - dayIndex(b.value));
}

/** Calendar edge cases. `valid` says whether the date exists on the calendar. */
export const SPECIAL_DATES = [
  { label: 'Leap day (divisible by 4)', value: '2024-02-29', valid: true },
  { label: 'Leap day (century divisible by 400)', value: '2000-02-29', valid: true },
  { label: 'Feb 29 in a non-leap year', value: '2023-02-29', valid: false },
  { label: 'Feb 29 in a century that is not a leap year', value: '2100-02-29', valid: false },
  { label: 'Feb 29 in 1900 (Excel wrongly accepts it)', value: '1900-02-29', valid: false },
  { label: 'Feb 30', value: '2024-02-30', valid: false },
  { label: 'April 31', value: '2026-04-31', valid: false },
  { label: 'Month 13', value: '2026-13-01', valid: false },
  { label: 'Day 00', value: '2026-01-00', valid: false },
  { label: 'Last day of the year', value: '2026-12-31', valid: true },
  { label: 'First day of the year', value: '2026-01-01', valid: true },
  { label: 'Unix epoch', value: '1970-01-01', valid: true },
  { label: 'Day before the Unix epoch', value: '1969-12-31', valid: true },
  { label: 'Y2K', value: '2000-01-01', valid: true },
  { label: 'Excel date origin (1900 system)', value: '1900-01-01', valid: true },
  { label: 'Year 2038 (32-bit time_t overflows on this day)', value: '2038-01-19', valid: true },
  { label: 'Earliest 4-digit date', value: '0001-01-01', valid: true },
  { label: 'Latest 4-digit date', value: '9999-12-31', valid: true },
];

/** Date-times around the 32-bit epoch limit, with their epoch seconds. */
export const SPECIAL_TIMESTAMPS = [
  ['Last second before 32-bit signed overflow', '2038-01-19T03:14:07Z', '2147483647'],
  ['First second that overflows 32-bit signed time', '2038-01-19T03:14:08Z', '2147483648'],
  ['32-bit unsigned limit', '2106-02-07T06:28:15Z', '4294967295'],
  ['Unix epoch', '1970-01-01T00:00:00Z', '0'],
  ['One second before the epoch', '1969-12-31T23:59:59Z', '-1'],
  ['Leap second candidate (end of 2016)', '2016-12-31T23:59:60Z', ''],
];

function nthWeekday(year, month, weekday, n) {
  // n >= 1: nth such weekday of the month; n = -1: last one
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}

const pad = (n) => String(n).padStart(2, '0');

/** Local times that are skipped or repeated when clocks change (Europe and USA rules). */
export function dstCases(year) {
  if (!Number.isInteger(year) || year < 1970 || year > 2200) throw new RangeError('Year must be between 1970 and 2200.');
  const euSpring = nthWeekday(year, 2, 0, -1);
  const euAutumn = nthWeekday(year, 9, 0, -1);
  const usSpring = nthWeekday(year, 2, 0, 2);
  const usAutumn = nthWeekday(year, 10, 0, 1);
  return [
    { region: 'Europe (e.g. Warsaw)', label: 'Clocks go forward: 02:30 does not exist', value: `${year}-03-${pad(euSpring)}T02:30:00`, kind: 'skipped' },
    { region: 'Europe (e.g. Warsaw)', label: 'Clocks go back: 02:30 happens twice', value: `${year}-10-${pad(euAutumn)}T02:30:00`, kind: 'repeated' },
    { region: 'USA (e.g. New York)', label: 'Clocks go forward: 02:30 does not exist', value: `${year}-03-${pad(usSpring)}T02:30:00`, kind: 'skipped' },
    { region: 'USA (e.g. New York)', label: 'Clocks go back: 01:30 happens twice', value: `${year}-11-${pad(usAutumn)}T01:30:00`, kind: 'repeated' },
  ];
}
