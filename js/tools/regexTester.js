import { h, field, checkbox, statusLine, copyText } from '../util.js';
import { runRegex, segments, PRESETS } from '../lib/regex.js';

const FLAGS = [
  ['g', 'global'],
  ['i', 'ignore case'],
  ['m', 'multiline'],
  ['s', 'dot matches newline'],
  ['u', 'unicode'],
  ['y', 'sticky'],
];
const MAX_ROWS = 200;

export default {
  id: 'regex-tester',
  name: 'Regex tester',
  category: 'Inspect',
  description: 'Try JavaScript regular expressions: live matches, capture groups, replace preview and ready-made patterns.',
  keywords: ['regexp', 'pattern', 'match', 'replace', 'groups', 'validate', 'email', 'pesel'],
  render(root) {
    const pattern = h('input', { type: 'text', spellcheck: false, placeholder: 'e.g. (\\d+)-(\\w+)', class: 'mono', 'aria-label': 'Pattern' });
    pattern.style.width = '100%';
    const flagBoxes = FLAGS.map(([f, label]) => ({ f, ...checkbox(`${f} (${label})`, f === 'g') }));
    const text = h('textarea', { rows: 7, spellcheck: false, placeholder: 'Text to test against…' });
    const replacement = h('input', { type: 'text', spellcheck: false, class: 'mono', placeholder: 'e.g. $2 $1 (leave empty to skip)', size: 36 });
    const preset = h('select', {}, h('option', { value: '' }, 'Load a ready-made pattern…'), PRESETS.map((p, i) => h('option', { value: i }, p.label)));
    const status = statusLine();
    const highlight = h('pre', { class: 'visual' });
    const results = h('div');
    const replaceOut = h('div');

    const flags = () => flagBoxes.filter((b) => b.input.checked).map((b) => b.f).join('');

    const update = () => {
      results.replaceChildren();
      replaceOut.replaceChildren();
      highlight.replaceChildren();
      if (pattern.value === '') {
        status.info('Enter a pattern to start.');
        highlight.textContent = text.value;
        return;
      }
      const r = runRegex({
        pattern: pattern.value,
        flags: flags(),
        text: text.value,
        replacement: replacement.value === '' ? null : replacement.value,
      });
      if (!r.ok) {
        status.error(r.error);
        highlight.textContent = text.value;
        return;
      }
      const n = r.matches.length;
      status[n ? 'ok' : 'info'](
        n ? `${n}${r.truncated ? '+' : ''} match${n === 1 ? '' : 'es'}${r.truncated ? ' (stopped at the limit)' : ''}.` : 'No matches.',
      );

      highlight.append(...segments(text.value, r.matches).map((s) => (s.match ? h('mark', { title: `Match ${s.n + 1}` }, s.text) : s.text)));

      if (n) {
        const anyGroups = r.matches.some((m) => m.groups.length);
        const rows = r.matches.slice(0, MAX_ROWS).map((m, i) =>
          h('tr', {},
            h('td', {}, String(i + 1)),
            h('td', {}, `${m.line}:${m.column}`),
            h('td', { class: 'mono' }, m.value === '' ? '(empty)' : m.value),
            anyGroups
              ? h('td', { class: 'mono' }, m.groups.map((g, gi) => `$${gi + 1} = ${g === null ? 'undefined' : JSON.stringify(g)}`).join('\n') + (m.named ? '\n' + Object.entries(m.named).map(([k, v]) => `<${k}> = ${JSON.stringify(v)}`).join('\n') : ''))
              : null,
          ),
        );
        results.append(
          h('table', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Line:col'), h('th', {}, 'Match'), anyGroups ? h('th', {}, 'Groups') : null), rows),
        );
        if (n > MAX_ROWS) results.append(h('p', { class: 'muted' }, `Showing the first ${MAX_ROWS} of ${n} matches.`));
      }
      if (r.replaced !== null) {
        replaceOut.append(
          h('h3', {}, 'Replace result'),
          h('pre', { class: 'visual' }, r.replaced),
          h('button', { onclick: () => copyText(r.replaced) }, 'Copy result'),
        );
      }
    };

    preset.addEventListener('change', () => {
      const p = PRESETS[Number(preset.value)];
      if (!p) return;
      pattern.value = p.pattern;
      text.value = p.sample;
      for (const b of flagBoxes) b.input.checked = p.flags.includes(b.f);
      update();
    });
    for (const el of [pattern, text, replacement, ...flagBoxes.map((b) => b.input)]) el.addEventListener('input', update);

    root.append(
      h('div', { class: 'form-row' }, field('Ready-made patterns', preset)),
      field('Pattern', pattern),
      h('div', { class: 'form-row', style: 'margin:.5rem 0' }, flagBoxes.map((b) => b.el)),
      h('div', { class: 'form-row' },
        h('button', { onclick: () => pattern.value && copyText(`/${pattern.value}/${flags()}`, 'Copied as a /regex/ literal') }, 'Copy as /pattern/flags'),
        h('button', { onclick: () => pattern.value && copyText(JSON.stringify(pattern.value), 'Copied as a quoted string') }, 'Copy as quoted string')),
      field('Text', text),
      status.el,
      h('h3', {}, 'Matches highlighted'),
      highlight,
      results,
      h('h3', {}, 'Replace'),
      field('Replacement', replacement, 'Use $1, $<name> and $& for groups and the whole match.'),
      replaceOut,
      h('p', { class: 'note' }, 'Uses your browser’s JavaScript regex engine, so syntax and behaviour match JavaScript, not PCRE, .NET or Java. All matches are listed even without the g flag; the replacement follows your flags (without g only the first match is replaced). Patterns with nested repeats such as (a+)+ can freeze the tab on long text; reload the page if that happens.'),
    );
    update();
  },
};
