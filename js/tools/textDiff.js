import { h, field, checkbox, statusLine, copyText } from '../util.js';
import { lineDiff, textDiff, collapse, toUnified } from '../lib/diff.js';

const EXAMPLE_A = '{\n  "name": "Anna",\n  "age": 30,\n  "city": "Kraków",\n  "active": true\n}';
const EXAMPLE_B = '{\n  "name": "Anna",\n  "age": 31,\n  "city": "Warszawa",\n  "active": true,\n  "role": "tester"\n}';

const SIGN = { change: '~', delete: '−', insert: '+' };

function parts(list) {
  return list.map((p) => (p.changed ? h('mark', {}, p.text) : p.text));
}

export default {
  id: 'text-diff',
  name: 'Text diff',
  category: 'Inspect',
  description: 'Compare two texts by line, word or character, with inline highlights and a copyable unified diff.',
  keywords: ['compare', 'difference', 'changes', 'patch', 'unified', 'git', 'merge', 'json', 'config'],
  render(root) {
    const a = h('textarea', { rows: 12, spellcheck: false, placeholder: 'Original text…', 'aria-label': 'Text A (original)' });
    const b = h('textarea', { rows: 12, spellcheck: false, placeholder: 'Changed text…', 'aria-label': 'Text B (changed)' });
    const mode = h('select', {}, h('option', { value: 'lines' }, 'By line'), h('option', { value: 'words' }, 'By word'), h('option', { value: 'chars' }, 'By character'));
    const ws = checkbox('Ignore whitespace');
    const cs = checkbox('Ignore case');
    const only = checkbox('Show only changes (with 3 lines of context)', false);
    const status = statusLine();
    const notes = h('div');
    const out = h('div');
    let unified = '';
    // Browsers turn every line break typed or pasted into a text box into LF. Text loaded
    // from a file is kept as-is here so CRLF/LF differences can still be reported.
    const raw = { a: null, b: null };
    const value = (side, box) => raw[side] ?? box.value;
    const fileA = h('input', { type: 'file', 'aria-label': 'Load text A from a file' });
    const fileB = h('input', { type: 'file', 'aria-label': 'Load text B from a file' });
    const copyBtn = h('button', { onclick: () => unified && copyText(unified, 'Unified diff copied') }, 'Copy unified diff');
    copyBtn.hidden = true;

    const update = () => {
      out.replaceChildren();
      notes.replaceChildren();
      unified = '';
      copyBtn.hidden = true;
      only.el.hidden = mode.value !== 'lines';
      if (value('a', a) === '' && value('b', b) === '') return status.info('Paste two texts to compare them.');
      const opts = { ignoreWhitespace: ws.input.checked, ignoreCase: cs.input.checked };
      try {
        if (mode.value === 'lines') {
          const d = lineDiff(value('a', a), value('b', b), opts);
          const { added, removed, changed, unchanged } = d.stats;
          if (d.identical) status.ok(`No differences${opts.ignoreWhitespace || opts.ignoreCase ? ' (with the chosen ignore options)' : ''}.`);
          else status.error(`${changed} changed, ${added} added, ${removed} removed line${changed + added + removed === 1 ? '' : 's'} · ${unchanged} unchanged`);
          for (const n of d.notes) notes.append(h('p', { class: 'note' }, n));
          if (d.identical) return;

          unified = toUnified(d.rows, { nameA: 'text A', nameB: 'text B' });
          copyBtn.hidden = false;
          const rows = only.input.checked ? collapse(d.rows, 3) : d.rows;
          out.append(
            h('table', { class: 'diff' },
              h('tr', {}, h('th', { class: 'ln' }, 'A'), h('th', {}, 'Text A'), h('th', { class: 'ln' }, 'B'), h('th', {}, 'Text B')),
              rows.map((r) =>
                r.type === 'skip'
                  ? h('tr', { class: 'd-skip' }, h('td', { colspan: 4 }, `… ${r.count} unchanged line${r.count === 1 ? '' : 's'} …`))
                  : h('tr', { class: `d-${r.type}` },
                      h('td', { class: 'ln' }, r.aLine ?? ''),
                      h('td', { class: 'code a', 'data-sign': r.type === 'change' || r.type === 'delete' ? SIGN[r.type] : '' }, r.inline ? parts(r.inline.aParts) : (r.a ?? '')),
                      h('td', { class: 'ln' }, r.bLine ?? ''),
                      h('td', { class: 'code b', 'data-sign': r.type === 'change' || r.type === 'insert' ? (r.type === 'insert' ? '+' : '~') : '' }, r.inline ? parts(r.inline.bParts) : (r.b ?? '')))),
            ),
          );
        } else {
          const d = textDiff(value('a', a), value('b', b), { mode: mode.value, ...opts });
          const unit = mode.value === 'chars' ? 'character' : 'word';
          if (d.identical) return status.ok(`No differences${opts.ignoreWhitespace || opts.ignoreCase ? ' (with the chosen ignore options)' : ''}.`);
          status.error(mode.value === 'chars' ? `${d.stats.removed} characters removed, ${d.stats.added} added` : `Differences found (compared by ${unit})`);
          out.append(
            h('pre', { class: 'visual diff-inline' },
              d.parts.map((p) => (p.type === 'delete' ? h('del', {}, p.text) : p.type === 'insert' ? h('ins', {}, p.text) : p.text))),
          );
        }
      } catch (err) {
        status.error(err.message);
      }
    };

    let timer;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    };
    for (const [side, el] of [['a', a], ['b', b]]) {
      el.addEventListener('input', () => {
        raw[side] = null; // edited by hand: the text box content is the truth again
        later();
      });
    }
    for (const [side, box, input] of [['a', a, fileA], ['b', b, fileB]]) {
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        raw[side] = await f.text();
        box.value = raw[side];
        update();
      });
    }
    for (const el of [mode, ws.input, cs.input, only.input]) el.addEventListener('change', update);

    root.append(
      h('div', { class: 'two-col' }, field('Text A (original)', a), field('Text B (changed)', b)),
      h('div', { class: 'two-col' }, field('…or load A from a file', fileA), field('…or load B from a file', fileB)),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' },
        field('Compare', mode),
        ws.el, cs.el, only.el,
        h('button', { onclick: () => ([a.value, b.value] = [b.value, a.value], [raw.a, raw.b] = [raw.b, raw.a], update()) }, '⇄ Swap'),
        h('button', { onclick: () => ((a.value = EXAMPLE_A), (b.value = EXAMPLE_B), (raw.a = raw.b = null), update()) }, 'Load example'),
        h('button', { onclick: () => ((a.value = ''), (b.value = ''), (raw.a = raw.b = null), (fileA.value = ''), (fileB.value = ''), update()) }, 'Clear'),
        copyBtn),
      status.el,
      notes,
      out,
      h('p', { class: 'note' }, 'Line mode compares lines without their line endings. Text boxes always turn line breaks into LF, so to find CRLF vs LF differences load the texts from files; the tool then tells you when line endings or the final line break differ. Word and character modes show removed text struck through and added text underlined. Large inputs: up to 20,000 lines or 50,000 words/characters per side.'),
    );
    update();
    return () => clearTimeout(timer);
  },
};
