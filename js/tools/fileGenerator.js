import { h, field, checkbox, statusLine, chips, downloadBlob } from '../util.js';
import { FORMATS, UNITS, PNG_DIMENSIONS, MAX_SIZE, parseSize, fileName, generateFile, minimumSize } from '../lib/filegen.js';

const fmt = (n) => n.toLocaleString('en-US');
const PRESETS = [['1', 'KiB'], ['100', 'KiB'], ['1', 'MiB'], ['5', 'MiB'], ['10', 'MiB'], ['25', 'MiB'], ['100', 'MiB']];

export default {
  id: 'file-generator',
  name: 'File generator',
  category: 'Generate',
  description: 'Download test files of an exact size (txt, csv, json, png, pdf, binary) for upload and limit testing.',
  keywords: ['upload', 'file', 'size', 'bytes', 'dummy', 'mb', 'limit', 'png', 'pdf', 'csv', 'json', 'binary', 'attachment'],
  render(root) {
    const size = h('input', { type: 'number', min: 1, step: 'any', value: 5 });
    const unit = h('select', {}, Object.keys(UNITS).map((u) => h('option', { value: u, selected: u === 'MiB' }, u === 'B' ? 'bytes' : u)));
    const format = h('select', {}, Object.entries(FORMATS).map(([k, v]) => h('option', { value: k }, v.label)));
    const dims = h('select', {}, Object.keys(PNG_DIMENSIONS).map((k) => h('option', { value: k }, k.replace('x', ' × ') + ' px')));
    const dimsField = field('Image dimensions', dims);
    const around = checkbox('Also create the files 1 byte smaller and 1 byte larger (upload limit boundary)', false);
    const exact = h('p', { class: 'muted' });
    const minNote = h('p', { class: 'muted' });
    const status = statusLine();
    const bar = h('progress', { max: 1, value: 0 });
    bar.hidden = true;
    const results = h('div');
    const go = h('button', { class: 'primary' }, 'Create file');

    const bytes = () => parseSize(size.value, unit.value);

    const refresh = async () => {
      dimsField.hidden = format.value !== 'png';
      try {
        exact.textContent = `= ${fmt(bytes())} bytes`;
      } catch (err) {
        exact.textContent = err.message;
      }
      try {
        const min = await minimumSize(format.value, { png: dims.value });
        minNote.textContent = min > 1 ? `Smallest possible ${FORMATS[format.value].label.split(' (')[0]}: ${fmt(min)} bytes.` : '';
      } catch (err) {
        minNote.textContent = err.message;
      }
    };

    const run = async () => {
      results.replaceChildren();
      let base;
      try {
        base = bytes();
      } catch (err) {
        return status.error(err.message);
      }
      const sizes = around.input.checked ? [base - 1, base, base + 1] : [base];
      go.disabled = true;
      bar.hidden = false;
      status.info('Creating…');
      const rows = [];
      for (const [i, s] of sizes.entries()) {
        const name = fileName(format.value, Math.max(s, 1));
        try {
          if (s < 1) throw new RangeError('Size must be at least 1 byte.');
          bar.value = 0;
          status.info(`Creating ${name} (${i + 1} of ${sizes.length})…`);
          const blob = await generateFile({ format: format.value, size: s, png: dims.value, onProgress: (f) => (bar.value = f) });
          rows.push(h('tr', {}, h('td', { class: 'mono' }, name), h('td', {}, fmt(s)), h('td', {}, h('button', { class: 'primary', 'aria-label': `Download ${name}`, onclick: () => downloadBlob(name, blob) }, 'Download'))));
        } catch (err) {
          rows.push(h('tr', {}, h('td', { class: 'mono' }, name), h('td', {}, fmt(Math.max(s, 0))), h('td', { class: 'status error' }, err.message)));
        }
      }
      bar.hidden = true;
      go.disabled = false;
      const failed = rows.filter((r) => r.querySelector('.error')).length;
      if (failed === rows.length) status.error('Could not create the file.');
      else status[failed ? 'error' : 'ok'](failed ? `${rows.length - failed} of ${rows.length} files created.` : `${rows.length} file${rows.length === 1 ? '' : 's'} ready. Press Download.`);
      results.append(h('div', { class: 'table-wrap' }, h('table', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Bytes'), h('th', {}, h('span', { class: 'sr-only' }, 'Download'))), rows)));
    };

    go.addEventListener('click', run);
    for (const el of [size, unit, format, dims]) el.addEventListener('input', refresh);

    root.append(
      h('div', { class: 'form-row' }, field('Size', size), field('Unit', unit), field('Format', format), dimsField),
      chips(PRESETS, ([v, u]) => ((size.value = v), (unit.value = u), refresh()), ([v, u]) => `${v} ${u}`),
      exact,
      minNote,
      h('div', { class: 'form-row' }, around.el),
      h('div', { class: 'form-row' }, go, bar),
      status.el,
      results,
      h('p', { class: 'note' }, `Files are built in your browser and never uploaded; up to ${fmt(MAX_SIZE)} bytes (100 MiB). KB and MB are 1,000-based, KiB and MiB are 1,024-based, so check which one your limit uses. Text, CSV and JSON are valid documents with generated rows; PNG and PDF are valid files padded with legal filler, so they open normally. Padded or repetitive files compress extremely well: for upload speed tests use "random bytes", which cannot be compressed. Use "1 byte smaller / larger" to test whether a limit is inclusive.`),
    );
    refresh();
  },
};
