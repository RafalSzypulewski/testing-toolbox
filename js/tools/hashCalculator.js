import { h, field, checkbox, statusLine, copyText } from '../util.js';
import { computeAll, findMatch } from '../lib/hash.js';
import { utf8Bytes } from '../lib/text.js';

const MAX_FILE = 100 * 1024 * 1024; // the whole file is read into memory

const formatSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default {
  id: 'hash-calculator',
  name: 'Hash calculator',
  category: 'Convert',
  description: 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of text or a file, with HMAC and a checksum comparer.',
  keywords: ['md5', 'sha', 'sha256', 'checksum', 'hmac', 'digest', 'file', 'signature', 'verify'],
  render(root) {
    const input = h('textarea', { rows: 5, spellcheck: false, placeholder: 'Type or paste text to hash…' });
    const file = h('input', { type: 'file' });
    const useHmac = checkbox('HMAC with secret key', false);
    const key = h('input', { type: 'text', spellcheck: false, size: 30, placeholder: 'Secret key (UTF-8 text)', autocomplete: 'off' });
    const format = h('select', {}, h('option', { value: 'hex' }, 'Hex (lowercase)'), h('option', { value: 'HEX' }, 'Hex (UPPERCASE)'), h('option', { value: 'base64' }, 'Base64'));
    const expected = h('input', { type: 'text', spellcheck: false, size: 50, placeholder: 'Paste a checksum to compare (hex or Base64)', class: 'mono' });
    const status = statusLine();
    const compare = statusLine();
    const table = h('div');
    let source = { kind: 'text' }; // or { kind: 'file', file }
    let results = [];
    let run = 0; // ignores out-of-date async results

    const show = () => {
      table.replaceChildren();
      if (!results.length) return;
      const fmt = (r) => (format.value === 'base64' ? r.base64 : format.value === 'HEX' ? r.hex.toUpperCase() : r.hex);
      table.append(
        h('table', {}, h('tr', {}, h('th', {}, 'Algorithm'), h('th', {}, useHmac.input.checked ? 'HMAC' : 'Hash'), h('th', {}, h('span', { class: 'sr-only' }, 'Copy'))),
          results.map((r) =>
            h('tr', {}, h('td', {}, r.algo),
              h('td', { class: r.error ? 'status error' : 'mono' }, r.error ?? fmt(r)),
              h('td', {}, r.error ? '' : h('button', { 'aria-label': `Copy ${r.algo} ${useHmac.input.checked ? 'HMAC' : 'hash'}`, onclick: () => copyText(fmt(r), `${r.algo} copied`) }, 'Copy'))))),
      );
      const wanted = expected.value.trim();
      if (!wanted) return compare.clear();
      const hits = findMatch(wanted, results);
      if (hits.length) compare.ok(`Match: ${hits.join(', ')}.`);
      else compare.error('No match with any algorithm shown. Check for a different algorithm, an extra newline in the text, or a HMAC key.');
    };

    const compute = async () => {
      const mine = ++run;
      try {
        let bytes;
        if (source.kind === 'file') {
          if (source.file.size > MAX_FILE) throw new Error(`File is larger than ${formatSize(MAX_FILE)}; it is read fully into memory.`);
          bytes = new Uint8Array(await source.file.arrayBuffer());
        } else {
          bytes = utf8Bytes(input.value);
        }
        const started = performance.now();
        const out = await computeAll(bytes, { key: useHmac.input.checked ? utf8Bytes(key.value) : null });
        if (mine !== run) return;
        results = out;
        const what = source.kind === 'file' ? `${source.file.name} (${formatSize(bytes.length)})` : `${bytes.length} byte${bytes.length === 1 ? '' : 's'} of text`;
        status.ok(`Hashed ${what} in ${Math.max(1, Math.round(performance.now() - started))} ms.`);
        show();
      } catch (err) {
        if (mine !== run) return;
        results = [];
        status.error(err.message);
        show();
      }
    };

    input.addEventListener('input', () => {
      source = { kind: 'text' };
      file.value = '';
      compute();
    });
    file.addEventListener('change', () => {
      if (!file.files[0]) return;
      source = { kind: 'file', file: file.files[0] };
      compute();
    });
    useHmac.input.addEventListener('change', () => {
      key.disabled = !useHmac.input.checked;
      compute();
    });
    key.addEventListener('input', compute);
    key.disabled = true;
    format.addEventListener('change', show);
    expected.addEventListener('input', show);

    root.append(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Text'), input),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' }, field('…or a file (stays in your browser)', file), field('Show as', format)),
      h('div', { class: 'form-row' }, useHmac.el, key),
      status.el,
      table,
      h('h3', {}, 'Compare with a known checksum'),
      expected,
      compare.el,
      h('p', { class: 'note' }, 'Text is hashed as UTF-8. MD5 and SHA-1 are broken for security purposes; use them only to compare checksums. Files up to 100 MB are supported because the whole file is read into memory. The empty text hashes too, which is a handy way to get the well-known empty-input checksums.'),
    );
    compute();
  },
};
