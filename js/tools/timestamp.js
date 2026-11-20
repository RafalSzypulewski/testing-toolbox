import { h, field, statusLine, copyText } from '../util.js';
import { parseInstant, formatInZone, relative, isValidTimeZone } from '../lib/time.js';

const ZONES = ['UTC', 'Europe/Warsaw', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default {
  id: 'timestamp',
  name: 'Timestamp converter',
  category: 'Convert',
  description: 'Convert Unix epoch (seconds or milliseconds) and dates to time zones, and back.',
  keywords: ['epoch', 'unix', 'date', 'time', 'timezone', 'iso', 'utc', 'now'],
  render(root) {
    const input = h('input', { type: 'text', size: 34, spellcheck: false, placeholder: '1700000000 or 2026-11-20T10:00:00Z' });
    const custom = h('input', { type: 'text', size: 22, spellcheck: false, placeholder: 'e.g. Australia/Sydney' });
    const status = statusLine();
    const table = h('div');
    const clock = h('p', { class: 'mono' });

    const row = (label, value) =>
      h('tr', {}, h('td', {}, label), h('td', { class: 'mono' }, value), h('td', {}, h('button', { onclick: () => copyText(value) }, 'Copy')));

    const update = () => {
      table.replaceChildren();
      if (!input.value.trim()) return status.clear();
      try {
        const { date, unit } = parseInstant(input.value);
        const zones = [...new Set([LOCAL, ...ZONES])];
        const extra = custom.value.trim();
        if (extra) {
          if (isValidTimeZone(extra)) zones.push(extra);
          else return status.error(`Unknown time zone "${extra}". Use an IANA name such as Europe/Warsaw.`);
        }
        status.ok(unit === 'date' ? 'Parsed as a date.' : `Interpreted as ${unit} since 1970-01-01 UTC.`);
        table.append(
          h('table', {}, h('tr', {}, h('th', {}, 'Format'), h('th', {}, 'Value'), h('th', {})),
            row('ISO 8601 (UTC)', date.toISOString()),
            row('Epoch seconds', String(Math.floor(date.getTime() / 1000))),
            row('Epoch milliseconds', String(date.getTime())),
            row('Relative to now', relative(date)),
            zones.map((z) => row(z === LOCAL ? `${z} (your local zone)` : z, formatInZone(date, z)))),
        );
      } catch (err) {
        status.error(err.message);
      }
    };

    const now = () => {
      input.value = String(Math.floor(Date.now() / 1000));
      update();
    };
    input.addEventListener('input', update);
    custom.addEventListener('input', update);

    const tick = () => (clock.textContent = `Now: ${Math.floor(Date.now() / 1000)} s · ${Date.now()} ms · ${new Date().toISOString()}`);
    tick();
    const timer = setInterval(tick, 1000);

    root.append(
      clock,
      h('div', { class: 'form-row' },
        field('Epoch or date', input, 'Values below 100 billion are read as seconds, larger ones as milliseconds.'),
        h('button', { class: 'primary', onclick: now }, 'Use current time'),
        field('Extra time zone', custom)),
      status.el,
      table,
    );
    return () => clearInterval(timer);
  },
};
