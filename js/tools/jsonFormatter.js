import { h, field, checkbox, outputPanel, statusLine } from '../util.js';
import { formatJson } from '../lib/json.js';

export default {
  id: 'json-formatter',
  name: 'JSON formatter',
  category: 'Convert',
  description: 'Pretty-print, minify and validate JSON, with the line and column of any error.',
  keywords: ['pretty', 'minify', 'validate', 'beautify', 'lint', 'sort'],
  render(root) {
    const input = h('textarea', { rows: 10, spellcheck: false, placeholder: '{"paste":"JSON here"}' });
    const indent = h('select', {}, h('option', { value: '2' }, '2 spaces'), h('option', { value: '4' }, '4 spaces'), h('option', { value: 'tab' }, 'Tab'));
    const sort = checkbox('Sort keys');
    const status = statusLine();
    const out = outputPanel({ label: 'Output', filename: 'output.json', rows: 14 });

    const run = (minify) => {
      const options = { indent: minify ? 0 : indent.value === 'tab' ? '\t' : Number(indent.value), sortKeys: sort.input.checked };
      const r = formatJson(input.value, options);
      if (r.ok) {
        out.set(r.output);
        status.ok(minify ? 'Minified.' : 'Valid JSON.');
      } else {
        out.set('');
        status.error(r.line ? `Line ${r.line}, column ${r.column}: ${r.error}` : r.error);
        if (r.line) {
          // move the caret to the error so it is easy to find
          const lines = input.value.split('\n');
          const offset = lines.slice(0, r.line - 1).reduce((n, l) => n + l.length + 1, 0) + (r.column - 1);
          input.focus();
          input.setSelectionRange(offset, Math.min(offset + 1, input.value.length));
        }
      }
    };

    root.append(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Input'), input),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' },
        h('button', { class: 'primary', onclick: () => run(false) }, 'Format'),
        h('button', { onclick: () => run(true) }, 'Minify'),
        field('Indent', indent),
        sort.el),
      status.el,
      out.el,
    );
  },
};
