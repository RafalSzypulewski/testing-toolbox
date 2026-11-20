// Random Polish-flavoured test records. No DOM access.
import { generatePesel, generateNip, generateRegon, generateIban } from './polish.js';

const MALE_FIRST = ['Jan', 'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Paweł', 'Łukasz', 'Michał', 'Marcin', 'Grzegorz', 'Józef', 'Wojciech'];
const FEMALE_FIRST = ['Anna', 'Maria', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Barbara', 'Ewa', 'Żaneta', 'Zofia', 'Joanna', 'Magdalena', 'Dorota'];
// [male form, female form]
const SURNAMES = [
  ['Nowak', 'Nowak'],
  ['Kowalski', 'Kowalska'],
  ['Wiśniewski', 'Wiśniewska'],
  ['Wójcik', 'Wójcik'],
  ['Kowalczyk', 'Kowalczyk'],
  ['Kamiński', 'Kamińska'],
  ['Lewandowski', 'Lewandowska'],
  ['Zieliński', 'Zielińska'],
  ['Szymański', 'Szymańska'],
  ['Woźniak', 'Woźniak'],
  ['Dąbrowski', 'Dąbrowska'],
  ['Kozłowski', 'Kozłowska'],
];
const STREETS = ['Marszałkowska', 'Długa', 'Piękna', 'Słoneczna', 'Lipowa', 'Kwiatowa', 'Polna', 'Leśna', 'Krótka', 'Szkolna', 'Ogrodowa', 'Mickiewicza'];
const CITIES = [
  ['Warszawa', '00'],
  ['Kraków', '30'],
  ['Łódź', '90'],
  ['Wrocław', '50'],
  ['Poznań', '60'],
  ['Gdańsk', '80'],
  ['Szczecin', '70'],
  ['Lublin', '20'],
  ['Katowice', '40'],
  ['Białystok', '15'],
];
const MOBILE_PREFIXES = ['50', '51', '53', '57', '60', '66', '69', '72', '73', '78', '79', '88'];
// Reserved for documentation (RFC 2606), so mail can never reach a real person.
const DOMAINS = ['example.com', 'example.org', 'example.net'];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const int = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function uuid(rng) {
  if (!rng && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const r = rng ?? Math.random;
  const hex = (n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(r() * 4)]}${hex(3)}-${hex(12)}`;
}

export const FIELDS = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['sex', 'Sex'],
  ['birthDate', 'Birth date'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['street', 'Street'],
  ['postalCode', 'Postal code'],
  ['city', 'City'],
  ['pesel', 'PESEL'],
  ['nip', 'NIP'],
  ['regon', 'REGON'],
  ['iban', 'IBAN (PL)'],
  ['uuid', 'UUID'],
];

export function generatePerson(rng = Math.random) {
  const sex = rng() < 0.5 ? 'M' : 'F';
  const firstName = pick(sex === 'M' ? MALE_FIRST : FEMALE_FIRST, rng);
  const surname = pick(SURNAMES, rng);
  const lastName = surname[sex === 'M' ? 0 : 1];
  // 1950-01-01 .. 2005-12-31
  const start = Date.UTC(1950, 0, 1);
  const end = Date.UTC(2005, 11, 31);
  const birth = new Date(start + Math.floor(rng() * (end - start + 1)));
  const [city, postalPrefix] = pick(CITIES, rng);
  const phoneTail = String(int(0, 9999999, rng)).padStart(7, '0');
  const phone = `+48 ${pick(MOBILE_PREFIXES, rng)}${phoneTail[0]} ${phoneTail.slice(1, 4)} ${phoneTail.slice(4)}`;

  return {
    firstName,
    lastName,
    sex,
    birthDate: birth.toISOString().slice(0, 10),
    email: `${slug(firstName)}.${slug(lastName)}${int(1, 99, rng)}@${pick(DOMAINS, rng)}`,
    phone,
    street: `ul. ${pick(STREETS, rng)} ${int(1, 120, rng)}${rng() < 0.2 ? '/' + int(1, 40, rng) : ''}`,
    postalCode: `${postalPrefix}-${String(int(0, 999, rng)).padStart(3, '0')}`,
    city,
    pesel: generatePesel({ date: birth, sex, rng }),
    nip: generateNip(rng),
    regon: generateRegon(9, rng),
    iban: generateIban(rng),
    uuid: uuid(rng === Math.random ? undefined : rng),
  };
}

function csvCell(value, sep) {
  const s = String(value);
  return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {object[]} records  @param {string[]} fields  @param {'json'|'csv'|'tsv'} format */
export function formatRecords(records, fields, format) {
  const rows = records.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
  if (format === 'json') return JSON.stringify(rows, null, 2);
  const sep = format === 'tsv' ? '\t' : ',';
  const lines = [fields.join(sep), ...rows.map((r) => fields.map((f) => csvCell(r[f], sep)).join(sep))];
  return lines.join('\n');
}
