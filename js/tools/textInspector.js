import { h, field, checkbox } from '../util.js';
import { inspect, visualize } from '../lib/text.js';

export default {
  id: 'text-inspector',
  name: 'Text inspector',
  category: 'Inspect',
  description: 'Count characters, bytes and lines, and reveal invisible characters in pasted text.',
  keywords: ['length', 'bytes', 'utf-8', 'utf-16', 'unicode', 'whitespace', 'hidden', 'count', 'characters'],
  render(root) {
    const input = h('textarea', { rows: 8, spellcheck: false, placeholder: 'Paste or type text here…' });
    const stats = h('div', { class: 'stats' });
    const visual = h('pre', { class: 'visual' });
    const warn = h('p', { class: 'status' });

    const update = () => {
      const r = inspect(input.value);
      const items = [
        [r.codePoints, 'Characters (code points)'],
        [r.graphemes ?? '–', 'Visible characters (graphemes)'],
        [r.utf16Units, 'UTF-16 units (JS .length)'],
        [r.utf8Bytes, 'UTF-8 bytes'],
        [r.lines, 'Lines'],
        [r.words, 'Words'],
        [r.nonAscii, 'Non-ASCII characters'],
        [r.invisible, 'Invisible / control characters'],
        [r.unique, 'Distinct characters'],
      ];
      stats.replaceChildren(...items.map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, typeof v === 'number' ? v.toLocaleString('en-US') : v), h('span', {}, l))));
      const notes = [];
      if (r.leadingTrailingSpace) notes.push('Text starts or ends with whitespace.');
      if (r.invisible) notes.push(`${r.invisible} invisible or control character(s) found.`);
      const { lf, crlf, cr } = r.lineBreaks;
      if ([lf, crlf, cr].filter(Boolean).length > 1) notes.push(`Mixed line endings (LF ${lf}, CRLF ${crlf}, CR ${cr}).`);
      warn.className = notes.length ? 'status error' : 'status';
      warn.textContent = notes.join(' ');
      visual.textContent = visualize(input.value);
    };
    input.addEventListener('input', update);

    root.append(
      field('Text', input),
      stats,
      warn,
      h('h3', {}, 'With hidden characters made visible'),
      visual,
      h('p', { class: 'note' }, 'Many systems limit "characters" differently: databases count bytes or UTF-16 units, forms count code points, people count graphemes. An emoji can be 1 grapheme, 1 code point, 2 UTF-16 units and 4 bytes.'),
    );
    update();
  },
};
