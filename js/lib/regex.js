// Regular-expression testing helpers using the browser's own JavaScript regex
// engine. No DOM access.

const ALLOWED_FLAGS = 'dgimsuvy';
export const DEFAULT_LIMIT = 1000;

export function compile(pattern, flags = '') {
  const bad = [...flags].find((f) => !ALLOWED_FLAGS.includes(f));
  if (bad) throw new Error(`Unknown flag "${bad}". Allowed flags: ${[...ALLOWED_FLAGS].join(', ')}.`);
  if (new Set(flags).size !== flags.length) throw new Error('Each flag can only be used once.');
  return new RegExp(pattern, flags);
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function locate(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: index - starts[lo] + 1 };
}

// After an empty match the engine does not move on by itself.
function advance(text, index, unicode) {
  const code = text.charCodeAt(index);
  return unicode && code >= 0xd800 && code <= 0xdbff ? index + 2 : index + 1;
}

/**
 * @returns {{ok: false, error: string} | {ok: true, matches: object[], truncated: boolean, replaced: string|null}}
 * Each match: { index, end, value, groups: (string|null)[], named: object|null, line, column }
 */
export function runRegex({ pattern, flags = '', text, replacement = null, limit = DEFAULT_LIMIT }) {
  let re;
  try {
    re = compile(pattern, flags.includes('g') ? flags : `${flags}g`);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const unicode = re.unicode || re.unicodeSets;
  const starts = lineStarts(text);
  const matches = [];
  let truncated = false;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    const value = m[0];
    matches.push({
      index: m.index,
      end: m.index + value.length,
      value,
      groups: m.slice(1).map((g) => (g === undefined ? null : g)),
      named: m.groups ? { ...m.groups } : null,
      ...locate(starts, m.index),
    });
    if (value === '') re.lastIndex = advance(text, re.lastIndex, unicode);
  }

  let replaced = null;
  if (replacement !== null) {
    // Honour the user's own flags: without "g" only the first match is replaced.
    replaced = text.replace(compile(pattern, flags), replacement);
  }
  return { ok: true, matches, truncated, replaced };
}

/** Splits text into plain and matched pieces (zero-width matches have no visible range). */
export function segments(text, matches) {
  const out = [];
  let pos = 0;
  matches.forEach((m, n) => {
    if (m.value === '') return;
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: false });
    out.push({ text: m.value, match: true, n });
    pos = m.end;
  });
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out;
}

export const PRESETS = [
  { label: 'Email address', pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'g', sample: 'Write to anna.kowalska@example.com or jan+test@mail.example.org today.' },
  { label: 'URL', pattern: 'https?:\\/\\/[^\\s/$.?#][^\\s]*', flags: 'gi', sample: 'See https://example.com/path?x=1 and http://test.example.org.' },
  { label: 'ISO date with named groups', pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', flags: 'g', sample: 'From 2026-11-20 to 2027-01-05.' },
  { label: 'IPv4 address', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', sample: 'Hosts 192.168.0.1, 10.0.0.255 and 999.1.1.1.' },
  { label: 'UUID', pattern: '\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b', flags: 'gi', sample: 'id=123e4567-e89b-12d3-a456-426614174000' },
  { label: 'PESEL (11 digits)', pattern: '\\b\\d{11}\\b', flags: 'g', sample: 'PESEL: 44051401359, not 1234.' },
  { label: 'NIP (with optional dashes)', pattern: '\\b\\d{3}-?\\d{3}-?\\d{2}-?\\d{2}\\b', flags: 'g', sample: 'NIP 123-456-32-18 or 1234563218.' },
  { label: 'Polish postal code', pattern: '\\b\\d{2}-\\d{3}\\b', flags: 'g', sample: 'ul. Długa 5, 00-950 Warszawa; 30-001 Kraków.' },
  { label: 'Hex colour', pattern: '#(?:[0-9a-f]{3}){1,2}\\b', flags: 'gi', sample: 'color: #FFF; background: #1a2b3c;' },
  { label: 'Whitespace at line ends', pattern: '[ \\t]+$', flags: 'gm', sample: 'trailing   \nclean\ntabs\t\t' },
];
