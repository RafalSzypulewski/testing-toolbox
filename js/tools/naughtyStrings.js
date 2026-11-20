import { h, copyText, downloadFile } from '../util.js';
import { NAUGHTY, CATEGORIES } from '../lib/naughty.js';
import { visualize } from '../lib/text.js';

export default {
  id: 'naughty-strings',
  name: 'Naughty strings',
  category: 'Generate',
  description: 'Click-to-copy strings that often break things: unicode, injection, huge numbers, long text.',
  keywords: ['sql', 'xss', 'injection', 'emoji', 'unicode', 'rtl', 'edge', 'boundary', 'security'],
  render(root) {
    const search = h('input', { type: 'search', placeholder: 'Filter…', 'aria-label': 'Filter strings' });
    const category = h('select', {}, h('option', { value: '' }, 'All categories'), CATEGORIES.map((c) => h('option', { value: c }, c)));
    const list = h('div', { class: 'list-box' });
    const count = h('span', { class: 'muted' });
    let shown = NAUGHTY;

    const draw = () => {
      const q = search.value.trim().toLowerCase();
      shown = NAUGHTY.filter(
        (n) => (!category.value || n.category === category.value) && (!q || `${n.label} ${n.value}`.toLowerCase().includes(q)),
      );
      count.textContent = `${shown.length} of ${NAUGHTY.length}`;
      list.replaceChildren(
        ...(shown.length
          ? shown.map((n) => {
              const preview = visualize(n.value).replace(/\n/g, '');
              return h(
                'div',
                { class: 'list-row', role: 'button', tabindex: 0, title: 'Click to copy', onclick: () => copyText(n.value, `Copied: ${n.label}`) },
                h('span', { class: 'label' }, n.label),
                h('span', { class: 'value' }, preview.length > 160 ? `${preview.slice(0, 160)}…` : preview || '(empty)'),
                h('span', { class: 'muted' }, `${Array.from(n.value).length} ch`),
              );
            })
          : [h('div', { class: 'list-row' }, 'Nothing matches.')]),
      );
      for (const row of list.querySelectorAll('.list-row[role=button]')) {
        row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), row.click()));
      }
    };
    search.addEventListener('input', draw);
    category.addEventListener('change', draw);

    root.append(
      h('div', { class: 'form-row' }, search, category, count, h('span', { class: 'spacer' }),
        h('button', { onclick: () => copyText(shown.map((n) => n.value).join('\n'), `Copied ${shown.length} strings`) }, 'Copy all shown'),
        h('button', { onclick: () => downloadFile('naughty-strings.txt', shown.map((n) => n.value).join('\n')) }, 'Download')),
      list,
      h('p', { class: 'note' }, 'Control and invisible characters are shown as \\u{…} escapes in the preview; the copied value is the real string. Use only against systems you are allowed to test. Some clipboards normalise or strip special characters (for example null bytes).'),
    );
    draw();
  },
};
