import { h, field, outputPanel, statusLine } from '../util.js';
import {
  base64Encode, base64Decode, urlEncode, urlDecode, htmlEscape, htmlUnescape, unicodeEscape, unicodeUnescape,
} from '../lib/text.js';

const MODES = {
  base64: ['Base64', (t) => base64Encode(t), base64Decode],
  base64url: ['Base64URL', (t) => base64Encode(t, { url: true }), base64Decode],
  url: ['URL (percent-encoding)', urlEncode, urlDecode],
  html: ['HTML entities', htmlEscape, htmlUnescape],
  unicode: ['Unicode escapes (\\uXXXX)', unicodeEscape, unicodeUnescape],
};

export default {
  id: 'encoder',
  name: 'Encode / decode',
  category: 'Convert',
  description: 'Base64, Base64URL, URL encoding, HTML entities and Unicode escapes.',
  keywords: ['base64', 'url', 'percent', 'html', 'entities', 'escape', 'unescape', 'unicode'],
  render(root) {
    const mode = h('select', {}, Object.entries(MODES).map(([k, [label]]) => h('option', { value: k }, label)));
    const input = h('textarea', { rows: 6, spellcheck: false });
    const status = statusLine();
    const out = outputPanel({ label: 'Result', filename: 'result.txt', rows: 6 });

    const run = (direction) => {
      const [, encode, decode] = MODES[mode.value];
      try {
        out.set(direction === 'encode' ? encode(input.value) : decode(input.value));
        status.ok(direction === 'encode' ? 'Encoded.' : 'Decoded.');
      } catch (err) {
        out.set('');
        status.error(err.message);
      }
    };

    root.append(
      h('div', { class: 'form-row' }, field('Format', mode)),
      field('Input', input),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' },
        h('button', { class: 'primary', onclick: () => run('encode') }, 'Encode'),
        h('button', { class: 'primary', onclick: () => run('decode') }, 'Decode'),
        h('button', { onclick: () => out.get() && ((input.value = out.get()), out.set(''), status.clear()) }, '↑ Use result as input')),
      status.el,
      out.el,
    );
  },
};
