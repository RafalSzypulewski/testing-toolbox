import { h, field, checkbox, outputPanel, statusLine } from '../util.js';
import { OPERATIONS, GROUPS, getOperation, defaultsFor, runOperation } from '../lib/textops.js';

const countLines = (t) => (t === '' ? 0 : t.replace(/(\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/).length);
const fmt = (n) => n.toLocaleString('en-US');

export default {
  id: 'text-utilities',
  name: 'Text utilities',
  category: 'Convert',
  description: 'Change case, sort and clean up lines, remove duplicates, number, join, split and extract data from text.',
  keywords: ['case', 'upper', 'lower', 'camel', 'snake', 'sort', 'dedupe', 'duplicates', 'trim', 'lines', 'join', 'split', 'number', 'whitespace', 'diacritics', 'crlf', 'extract', 'emails', 'filter', 'quote', 'sql'],
  render(root) {
    const input = h('textarea', { rows: 10, spellcheck: false, placeholder: 'Paste or type text here…', 'aria-label': 'Text' });
    const select = h('select', { 'aria-label': 'Operation' },
      GROUPS.map((g) => h('optgroup', { label: g }, OPERATIONS.filter((o) => o.group === g).map((o) => h('option', { value: o.id }, o.label)))));
    const options = h('div', { class: 'form-row' });
    const status = statusLine();
    const out = outputPanel({ label: 'Result', filename: 'result.txt', rows: 10 });
    let controls = {}; // param key -> () => value

    const params = () => Object.fromEntries(Object.entries(controls).map(([k, get]) => [k, get()]));

    const update = () => {
      try {
        const result = runOperation(select.value, input.value, params());
        out.set(result);
        const [a, b] = [countLines(input.value), countLines(result)];
        status.ok(`${fmt(a)} line${a === 1 ? '' : 's'} → ${fmt(b)} line${b === 1 ? '' : 's'} · ${fmt(Array.from(input.value).length)} → ${fmt(Array.from(result).length)} characters`);
      } catch (err) {
        out.set('');
        status.error(err.message);
      }
    };

    const buildOptions = () => {
      const op = getOperation(select.value);
      const defaults = defaultsFor(op);
      controls = {};
      options.replaceChildren(
        ...op.params.map((p) => {
          if (p.type === 'checkbox') {
            const c = checkbox(p.label, defaults[p.key], update);
            controls[p.key] = () => c.input.checked;
            return c.el;
          }
          const el = p.type === 'select'
            ? h('select', { onchange: update }, p.options.map(([v, l]) => h('option', { value: v, selected: v === p.default }, l)))
            : h('input', { type: p.type, value: p.default, size: p.type === 'number' ? 6 : 14, spellcheck: false, oninput: update });
          controls[p.key] = () => el.value;
          return field(p.label, el);
        }),
      );
      update();
    };

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });
    select.addEventListener('change', buildOptions);

    root.append(
      field('Text', input),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' },
        field('What to do', select),
        h('button', { onclick: update }, '↻ Run again'),
        h('button', { onclick: () => out.get() && ((input.value = out.get()), update()) }, '↑ Use result as input'),
        h('button', { onclick: () => ((input.value = ''), update()) }, 'Clear')),
      options,
      status.el,
      out.el,
      h('p', { class: 'note' }, 'Lines are separated at LF, CRLF or CR, and a final line break counts as the end of the last line (like Unix tools). Text boxes always show line breaks as LF; Copy and Download keep the exact result, so "Convert line endings" to CRLF works through them. Sorting follows the language you choose (in Polish ż comes after z; in English it sorts like z), and \u201cAutomatic\u201d uses your browser\u2019s language. In separators and prefixes, \\t means a tab and \\n a line break. Chain steps with "Use result as input". Everything runs in your browser.'),
    );
    buildOptions();
    return () => clearTimeout(timer);
  },
};
