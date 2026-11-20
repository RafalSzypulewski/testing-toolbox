import { h, field, checkbox, outputPanel, statusLine, chips, copyText } from '../util.js';
import { randomString, CHARSETS, MAX_LENGTH } from '../lib/strings.js';

const PRESETS = {
  alphanumeric: 'Letters + digits',
  letters: 'Letters',
  lowercase: 'Lowercase letters',
  digits: 'Digits',
  hex: 'Hex',
  polish: 'Polish letters',
  ascii: 'Printable ASCII symbols',
};

export default {
  id: 'random-string',
  name: 'Random string',
  category: 'Generate',
  description: 'Random text from any character set, with optional random spaces and line breaks.',
  keywords: ['password', 'lorem', 'characters', 'words', 'lines'],
  render(root) {
    const length = h('input', { type: 'number', min: 1, max: MAX_LENGTH, value: 200 });
    const preset = h('select', {}, Object.entries(PRESETS).map(([k, v]) => h('option', { value: k }, v)), h('option', { value: '' }, 'Custom'));
    const charset = h('textarea', { rows: 2, spellcheck: false, value: CHARSETS.alphanumeric });
    preset.addEventListener('change', () => {
      if (preset.value) charset.value = CHARSETS[preset.value];
    });
    charset.addEventListener('input', () => (preset.value = ''));

    const range = (a, b) => ({ min: h('input', { type: 'number', min: 1, value: a }), max: h('input', { type: 'number', min: 1, value: b }) });
    const spaceOn = checkbox('Insert spaces', true);
    const spaceRange = range(3, 8);
    const breakOn = checkbox('Insert line breaks', false);
    const breakRange = range(40, 80);
    const breakType = h('select', {}, h('option', { value: '\n' }, 'LF (\\n)'), h('option', { value: '\r\n' }, 'CRLF (\\r\\n)'));
    const auto = checkbox('Copy to clipboard when generated', true);
    const status = statusLine();
    const out = outputPanel({ label: 'Random string', filename: 'random-string.txt', rows: 10 });

    const getRange = (r) => ({ min: Number(r.min.value), max: Number(r.max.value) });

    const run = () => {
      try {
        const text = randomString({
          length: length.value,
          charset: charset.value,
          spaces: spaceOn.input.checked ? getRange(spaceRange) : null,
          newlines: breakOn.input.checked ? getRange(breakRange) : null,
          newline: breakType.value,
        });
        out.set(text);
        status.ok(`Generated ${Array.from(text).length.toLocaleString('en-US')} characters.`);
        if (auto.input.checked) copyText(text);
      } catch (err) {
        out.set('');
        status.error(err.message);
      }
    };

    root.append(
      h('div', { class: 'form-row' }, field('Length', length), field('Character set', preset)),
      field('Characters to choose from', charset, 'Each character is equally likely; repeat characters to weight them.'),
      h(
        'div',
        { class: 'form-row', style: 'margin-top:.75rem' },
        spaceOn.el,
        field('every … characters, from', spaceRange.min),
        field('to', spaceRange.max),
      ),
      h(
        'div',
        { class: 'form-row' },
        breakOn.el,
        field('every … characters, from', breakRange.min),
        field('to', breakRange.max),
        field('Line break', breakType),
      ),
      h('div', { class: 'form-row' }, h('button', { class: 'primary', onclick: run }, 'Generate'), auto.el),
      chips([20, 100, 255, 1000, 10000], (n) => {
        length.value = n;
        run();
      }, (n) => `${n.toLocaleString('en-US')} chars`),
      status.el,
      out.el,
    );
  },
};
