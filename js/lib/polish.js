// Polish identifiers: PESEL, NIP, REGON and IBAN (PL). Generated values pass the
// official checksum rules but are random, so they do not belong to real people,
// companies or bank accounts. No DOM access.

const digit = (rng) => Math.floor(rng() * 10);
const digits = (n, rng) => Array.from({ length: n }, () => digit(rng));
const weighted = (ds, weights) => ds.reduce((sum, d, i) => sum + d * weights[i], 0);
const toDigits = (s) => Array.from(s, Number);

// ---- PESEL -----------------------------------------------------------------

const PESEL_W = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
const MONTH_OFFSET = { 18: 80, 19: 0, 20: 20, 21: 40, 22: 60 };

export function peselCheckDigit(first10) {
  return (10 - (weighted(toDigits(first10), PESEL_W) % 10)) % 10;
}

/** @param {Date} date birth date (UTC fields, 1800-2299)  @param {'M'|'F'} sex */
export function generatePesel({ date, sex, rng = Math.random }) {
  const year = date.getUTCFullYear();
  const offset = MONTH_OFFSET[Math.floor(year / 100)];
  if (offset === undefined) throw new RangeError('PESEL supports birth years 1800-2299.');
  const pad = (n) => String(n).padStart(2, '0');
  const sexDigit = sex === 'F' ? 2 * Math.floor(rng() * 5) : 2 * Math.floor(rng() * 5) + 1;
  const first10 =
    pad(year % 100) + pad(date.getUTCMonth() + 1 + offset) + pad(date.getUTCDate()) + digits(3, rng).join('') + sexDigit;
  return first10 + peselCheckDigit(first10);
}

export function validatePesel(value) {
  if (!/^\d{11}$/.test(value)) return { valid: false, reason: 'PESEL must be exactly 11 digits.' };
  if (peselCheckDigit(value.slice(0, 10)) !== Number(value[10])) {
    return { valid: false, reason: 'Check digit does not match.' };
  }
  const yy = Number(value.slice(0, 2));
  let mm = Number(value.slice(2, 4));
  const dd = Number(value.slice(4, 6));
  const century = Object.entries(MONTH_OFFSET).find(([, off]) => mm - off >= 1 && mm - off <= 12);
  if (!century) return { valid: false, reason: 'Month field is invalid.' };
  mm -= century[1];
  const year = Number(century[0]) * 100 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return { valid: false, reason: 'Birth date does not exist.' };
  const sex = Number(value[9]) % 2 === 0 ? 'F' : 'M';
  return { valid: true, info: `born ${d.toISOString().slice(0, 10)}, ${sex === 'F' ? 'female' : 'male'}` };
}

// ---- NIP -------------------------------------------------------------------

const NIP_W = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export function generateNip(rng = Math.random) {
  for (;;) {
    const first9 = [1 + Math.floor(rng() * 9), ...digits(8, rng)];
    const check = weighted(first9, NIP_W) % 11;
    if (check !== 10) return first9.join('') + check;
  }
}

export function validateNip(value) {
  const v = value.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(v)) return { valid: false, reason: 'NIP must be exactly 10 digits.' };
  const check = weighted(toDigits(v.slice(0, 9)), NIP_W) % 11;
  return check === Number(v[9]) ? { valid: true } : { valid: false, reason: 'Check digit does not match.' };
}

// ---- REGON -----------------------------------------------------------------

const REGON9_W = [8, 9, 2, 3, 4, 5, 6, 7];
const REGON14_W = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];

const regonCheck = (ds, w) => weighted(ds, w) % 11 % 10;

export function generateRegon(length = 9, rng = Math.random) {
  const base = digits(8, rng);
  const regon9 = base.join('') + regonCheck(base, REGON9_W);
  if (length === 9) return regon9;
  const local = toDigits(regon9).concat(digits(4, rng));
  return local.join('') + regonCheck(local, REGON14_W);
}

export function validateRegon(value) {
  if (!/^(\d{9}|\d{14})$/.test(value)) return { valid: false, reason: 'REGON must be 9 or 14 digits.' };
  const ds = toDigits(value);
  const ok9 = regonCheck(ds.slice(0, 8), REGON9_W) === ds[8];
  if (!ok9) return { valid: false, reason: 'Check digit does not match.' };
  if (value.length === 14 && regonCheck(ds.slice(0, 13), REGON14_W) !== ds[13]) {
    return { valid: false, reason: '14-digit check digit does not match.' };
  }
  return { valid: true };
}

// ---- IBAN (PL) -------------------------------------------------------------

const ROUTING_W = [3, 9, 7, 1, 3, 9, 7];

function mod97(numeric) {
  let rest = 0;
  for (const ch of numeric) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

const letterToNumber = (s) => s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

export function ibanCheckDigits(country, bban) {
  return String(98 - mod97(letterToNumber(`${bban}${country}00`))).padStart(2, '0');
}

export function generateIban(rng = Math.random) {
  const bank = digits(7, rng);
  const routing = bank.join('') + ((10 - (weighted(bank, ROUTING_W) % 10)) % 10);
  const bban = routing + digits(16, rng).join('');
  return `PL${ibanCheckDigits('PL', bban)}${bban}`;
}

export function validateIban(value) {
  const v = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return { valid: false, reason: 'Unexpected IBAN format.' };
  if (v.startsWith('PL') && v.length !== 28) return { valid: false, reason: 'Polish IBAN must be 28 characters.' };
  const rearranged = v.slice(4) + v.slice(0, 4);
  return mod97(letterToNumber(rearranged)) === 1 ? { valid: true } : { valid: false, reason: 'Check digits do not match.' };
}

export function formatIban(iban) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

export const VALIDATORS = {
  PESEL: validatePesel,
  NIP: validateNip,
  REGON: validateRegon,
  IBAN: validateIban,
};
