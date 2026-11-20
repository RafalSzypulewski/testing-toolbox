// Timestamp conversion helpers. No DOM access.

/** Epoch values below 1e11 are treated as seconds, otherwise milliseconds. */
export function parseInstant(input) {
  const s = input.trim();
  if (s === '') throw new Error('Enter an epoch timestamp or a date such as 2026-11-20T10:00:00Z.');
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const ms = Math.abs(n) < 1e11 ? n * 1000 : n;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) throw new Error('Timestamp is out of range.');
    return { date: d, unit: Math.abs(n) < 1e11 ? 'seconds' : 'milliseconds' };
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error('Could not understand this date.');
  return { date: d, unit: 'date' };
}

export function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function relative(date, now = Date.now()) {
  const diff = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === 'second') return rtf.format(Math.round(diff / secs), unit);
  }
  return '';
}
