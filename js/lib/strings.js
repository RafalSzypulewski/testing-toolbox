// Pure string generators (no DOM access) so they can be unit-tested in Node.

export const MAX_LENGTH = 1_000_000;

export function parseLength(value, max = MAX_LENGTH) {
  const n = Number(value);
  if (value === '' || !Number.isInteger(n) || n < 1 || n > max) {
    throw new RangeError(`Length must be a whole number between 1 and ${max.toLocaleString('en-US')}.`);
  }
  return n;
}

/**
 * Counter string: every marker character sits at the position given by the
 * number in front of it, e.g. length 10 -> "*3*5*7*10*".
 * Handy for finding exactly where an input field truncates text.
 */
export function counterString(length, marker = '*') {
  const n = parseLength(length);
  if (typeof marker !== 'string' || marker.length !== 1) {
    throw new RangeError('Marker must be exactly one character (emoji are not supported).');
  }
  if (/\d/.test(marker)) {
    throw new RangeError('Marker must not be a digit.');
  }
  // Built from the end: the marker at position `remaining` is preceded by its number.
  const parts = [];
  let total = 0;
  while (total < n) {
    const remaining = n - total;
    if (remaining === 1) {
      parts.push(marker);
      break;
    }
    const piece = String(remaining) + marker;
    parts.push(piece);
    total += piece.length;
  }
  return parts.reverse().join('');
}

function pickBetween(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

function checkRange(name, range) {
  const { min, max } = range;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new RangeError(`${name}: "from" must be a whole number >= 1 and not greater than "to".`);
  }
}

/**
 * Random string of `length` characters (code points) drawn from `charset`.
 * Optionally inserts spaces / line breaks at random intervals within [min, max].
 * Spaces and line breaks are never placed first or last, and never next to
 * each other, so the output always starts and ends with a charset character.
 */
export function randomString({
  length,
  charset,
  spaces = null, // { min, max } | null
  newlines = null, // { min, max } | null
  newline = '\n',
  rng = Math.random,
}) {
  const n = parseLength(length);
  const chars = Array.from(charset ?? '');
  if (chars.length === 0) throw new RangeError('Character set must not be empty.');
  if (spaces) checkRange('Spaces', spaces);
  if (newlines) checkRange('Line breaks', newlines);

  const out = [];
  let sinceSpace = 0;
  let sinceBreak = 0;
  let nextSpace = spaces ? pickBetween(spaces.min, spaces.max, rng) : Infinity;
  let nextBreak = newlines ? pickBetween(newlines.min, newlines.max, rng) : Infinity;
  let lastWasChar = false;
  let count = 0; // characters emitted so far (a CRLF break counts as 2)

  while (count < n) {
    const remaining = n - count;
    if (sinceBreak >= nextBreak && lastWasChar && remaining > newline.length) {
      out.push(newline);
      count += newline.length;
      sinceBreak = 0;
      sinceSpace = 0;
      nextBreak = pickBetween(newlines.min, newlines.max, rng);
      lastWasChar = false;
      continue;
    }
    if (sinceSpace >= nextSpace && lastWasChar && remaining > 1) {
      out.push(' ');
      count += 1;
      sinceSpace = 0;
      sinceBreak += 1;
      nextSpace = pickBetween(spaces.min, spaces.max, rng);
      lastWasChar = false;
      continue;
    }
    out.push(chars[Math.floor(rng() * chars.length)]);
    count += 1;
    sinceSpace += 1;
    sinceBreak += 1;
    lastWasChar = true;
  }
  return out.join('');
}

export const CHARSETS = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  hex: '0123456789abcdef',
  polish: 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻabcdefghijklmnopqrstuvwxyz',
  ascii: Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join(''),
};
