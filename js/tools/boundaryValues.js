import { h, field, checkbox, statusLine, copyText } from '../util.js';
import { utf8Bytes } from '../lib/text.js';
import {
  FILLS, lengthCases, numberCases, INT_TYPES, NUMBER_SPECIALS, dateCases, SPECIAL_DATES, SPECIAL_TIMESTAMPS, dstCases,
} from '../lib/boundary.js';

const PREVIEW = 48;

const preview = (value) => {
  if (value === '') return '(empty)';
  const chars = Array.from(value);
  return chars.length > PREVIEW ? `${chars.slice(0, PREVIEW).join('')}… (+${(chars.length - PREVIEW).toLocaleString('en-US')} more)` : value;
};

const verdict = (valid, yes = 'Accept', no = 'Reject') =>
  h('span', { class: valid ? 'verdict ok' : 'verdict bad' }, valid ? `✓ ${yes}` : `✗ ${no}`);

// Wide tables scroll inside their own box instead of stretching the page on phones.
function table(headers, rows) {
  return h('div', { class: 'table-wrap' }, h('table', {}, h('tr', {}, headers.map((x) => h('th', {}, x))), rows));
}

const copyCell = (value, label) => h('td', {}, h('button', { onclick: () => copyText(value, label ?? 'Copied') }, 'Copy'));

export default {
  id: 'boundary-values',
  name: 'Boundary values',
  category: 'Generate',
  description: 'Values just below, at and just above the limits: text length, numbers, dates, clock changes.',
  keywords: ['boundary', 'limits', 'edge', 'max length', 'min', 'max', 'int', 'overflow', 'leap', 'dst', 'timezone', 'y2038', 'equivalence'],
  render(root) {
    const panels = {};
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const body = h('div');

    // ---- text length -----------------------------------------------------------------
    {
      const min = h('input', { type: 'number', min: 0, value: 1 });
      const max = h('input', { type: 'number', min: 1, value: 20 });
      const fill = h('select', {}, Object.entries(FILLS).map(([k, v]) => h('option', { value: k }, v)));
      const status = statusLine();
      const out = h('div');
      let values = [];
      const update = () => {
        out.replaceChildren();
        try {
          const cases = lengthCases({ min: min.value, max: max.value, fill: fill.value });
          values = cases.map((c) => c.value);
          status.clear();
          out.append(
            table(['Case', 'Characters', 'UTF-8 bytes', 'Expected', 'Value', ''],
              cases.map((c) => h('tr', {},
                h('td', {}, c.label),
                h('td', {}, c.length.toLocaleString('en-US')),
                h('td', {}, utf8Bytes(c.value).length.toLocaleString('en-US')),
                h('td', {}, verdict(c.valid)),
                h('td', { class: 'mono' }, preview(c.value)),
                copyCell(c.value, `Copied ${c.length}-character string`)))),
          );
        } catch (err) {
          values = [];
          status.error(err.message);
        }
      };
      for (const el of [min, max]) el.addEventListener('input', update);
      fill.addEventListener('change', update);
      panels.length = h('div', {},
        h('p', { class: 'lead' }, 'For a text field that accepts min to max characters. "Expected" is what a correct field should do.'),
        h('div', { class: 'form-row' }, field('Minimum length', min), field('Maximum length', max), field('Characters', fill),
          h('button', { onclick: () => values.length && copyText(values.join('\n'), `Copied ${values.length} strings`) }, 'Copy all (one per line)')),
        status.el, out,
        h('p', { class: 'note' }, 'Lengths are counted in characters. The same text can be longer in bytes: databases and APIs often limit bytes, so try the Polish and emoji options, where max characters can exceed a max byte limit.'));
      update();
    }

    // ---- numbers ---------------------------------------------------------------------
    {
      const type = h('select', {}, h('option', { value: '' }, 'Custom range'), Object.entries(INT_TYPES).map(([k, [label]]) => h('option', { value: k }, label)));
      const min = h('input', { type: 'text', value: '0', size: 12, spellcheck: false });
      const max = h('input', { type: 'text', value: '100', size: 12, spellcheck: false });
      const step = h('input', { type: 'text', value: '1', size: 8, spellcheck: false });
      const extras = checkbox('Also zero and one step either side of zero', true);
      const status = statusLine();
      const out = h('div');
      let values = [];
      const update = () => {
        out.replaceChildren();
        try {
          const cases = numberCases({ min: min.value, max: max.value, step: step.value, extras: extras.input.checked });
          values = cases.map((c) => c.value);
          status.clear();
          out.append(table(['Case', 'Value', 'Expected', ''], cases.map((c) => h('tr', {}, h('td', {}, c.label), h('td', { class: 'mono' }, c.value), h('td', {}, verdict(c.valid)), copyCell(c.value)))));
        } catch (err) {
          values = [];
          status.error(err.message);
        }
      };
      type.addEventListener('change', () => {
        const t = INT_TYPES[type.value];
        if (t) {
          [, min.value, max.value] = t;
          step.value = '1';
        }
        update();
      });
      for (const el of [min, max, step]) el.addEventListener('input', () => ((type.value = ''), update()));
      extras.input.addEventListener('change', update);
      panels.numbers = h('div', {},
        h('p', { class: 'lead' }, 'For a numeric field with a minimum and maximum. Use a step such as 0.01 for money. Results are exact, even for 64-bit limits.'),
        h('div', { class: 'form-row' }, field('Type', type), field('Minimum', min), field('Maximum', max), field('Step', step), extras.el,
          h('button', { onclick: () => values.length && copyText(values.join('\n'), `Copied ${values.length} values`) }, 'Copy all')),
        status.el, out,
        h('h3', {}, 'Numbers that break things'),
        table(['Case', 'Value', ''], NUMBER_SPECIALS.map(([label, value]) => h('tr', {}, h('td', {}, label), h('td', { class: 'mono' }, value), copyCell(value)))));
      update();
    }

    // ---- dates -----------------------------------------------------------------------
    {
      const year = new Date().getFullYear();
      const min = h('input', { type: 'text', value: `${year}-01-01`, size: 12, spellcheck: false, placeholder: 'YYYY-MM-DD' });
      const max = h('input', { type: 'text', value: `${year}-12-31`, size: 12, spellcheck: false, placeholder: 'YYYY-MM-DD' });
      const dstYear = h('input', { type: 'number', min: 1970, max: 2200, value: year });
      const status = statusLine();
      const out = h('div');
      const dst = h('div');
      const update = () => {
        out.replaceChildren();
        try {
          const cases = dateCases({ min: min.value.trim(), max: max.value.trim() });
          status.clear();
          out.append(table(['Case', 'Date', 'Expected', ''], cases.map((c) => h('tr', {}, h('td', {}, c.label), h('td', { class: 'mono' }, c.value), h('td', {}, verdict(c.valid)), copyCell(c.value)))));
        } catch (err) {
          status.error(err.message);
        }
      };
      const updateDst = () => {
        dst.replaceChildren();
        try {
          dst.append(table(['Region', 'Case', 'Local time', 'Effect', ''],
            dstCases(Number(dstYear.value)).map((c) => h('tr', {}, h('td', {}, c.region), h('td', {}, c.label), h('td', { class: 'mono' }, c.value),
              h('td', {}, c.kind === 'skipped' ? 'Time does not exist' : 'Time is ambiguous'), copyCell(c.value)))));
        } catch (err) {
          dst.append(h('p', { class: 'status error' }, err.message));
        }
      };
      for (const el of [min, max]) el.addEventListener('input', update);
      dstYear.addEventListener('input', updateDst);
      panels.dates = h('div', {},
        h('p', { class: 'lead' }, 'For a date field with an earliest and latest allowed date.'),
        h('div', { class: 'form-row' }, field('Earliest date', min), field('Latest date', max)),
        status.el, out,
        h('h3', {}, 'Calendar edge cases'),
        table(['Case', 'Date', 'Is it a real date?', ''], SPECIAL_DATES.map((d) => h('tr', {}, h('td', {}, d.label), h('td', { class: 'mono' }, d.value), h('td', {}, verdict(d.valid, 'Real date', 'Not a real date')), copyCell(d.value)))),
        h('h3', {}, 'Epoch limits'),
        table(['Case', 'Date and time (UTC)', 'Epoch seconds', ''], SPECIAL_TIMESTAMPS.map(([label, iso, epoch]) => h('tr', {}, h('td', {}, label), h('td', { class: 'mono' }, iso), h('td', { class: 'mono' }, epoch || '–'), copyCell(iso)))),
        h('h3', {}, 'Clock changes (daylight saving time)'),
        h('div', { class: 'form-row' }, field('Year', dstYear)),
        dst);
      update();
      updateDst();
    }

    // ---- tabs ------------------------------------------------------------------------
    const names = { length: 'Text length', numbers: 'Numbers', dates: 'Dates and times' };
    let current = 'length';
    const show = (key) => {
      current = key;
      body.replaceChildren(panels[key]);
      for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.key === current));
    };
    for (const [key, label] of Object.entries(names)) {
      tabs.append(h('button', { class: 'tab', role: 'tab', 'data-key': key, 'aria-selected': 'false', onclick: () => show(key) }, label));
    }
    root.append(tabs, body);
    show(current);
  },
};
