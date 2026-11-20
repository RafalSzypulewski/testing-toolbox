import { h, field, checkbox, outputPanel, statusLine, copyText } from '../util.js';
import { FIELDS, generatePerson, formatRecords } from '../lib/testdata.js';
import { VALIDATORS, formatIban } from '../lib/polish.js';

const DEFAULT_ON = new Set(['firstName', 'lastName', 'birthDate', 'email', 'phone', 'pesel']);

export default {
  id: 'test-data',
  name: 'Test data (Poland)',
  category: 'Generate',
  description: 'Fake people with consistent Polish PESEL, NIP, REGON and IBAN, plus a checksum validator.',
  keywords: ['pesel', 'nip', 'regon', 'iban', 'name', 'email', 'phone', 'address', 'uuid', 'guid', 'csv', 'json', 'poland', 'polish'],
  render(root) {
    const count = h('input', { type: 'number', min: 1, max: 1000, value: 5 });
    const format = h('select', {}, h('option', { value: 'json' }, 'JSON'), h('option', { value: 'csv' }, 'CSV'), h('option', { value: 'tsv' }, 'TSV'));
    const boxes = FIELDS.map(([key, label]) => ({ key, ...checkbox(label, DEFAULT_ON.has(key)) }));
    const status = statusLine();
    const out = outputPanel({ label: 'Generated data', filename: 'test-data.json', rows: 14 });

    const run = () => {
      const n = Number(count.value);
      const fields = boxes.filter((b) => b.input.checked).map((b) => b.key);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return status.error('Count must be a whole number between 1 and 1,000.');
      if (fields.length === 0) return status.error('Select at least one field.');
      const records = Array.from({ length: n }, () => generatePerson());
      out.set(formatRecords(records, fields, format.value));
      status.ok(`Generated ${n} record${n === 1 ? '' : 's'}.`);
    };

    // validator
    const vType = h('select', {}, Object.keys(VALIDATORS).map((k) => h('option', { value: k }, k)));
    const vInput = h('input', { type: 'text', size: 34, placeholder: 'Paste a value to check', spellcheck: false });
    const vStatus = statusLine();
    const validate = () => {
      const value = vInput.value.trim();
      if (!value) return vStatus.clear();
      const r = VALIDATORS[vType.value](value);
      if (r.valid) vStatus.ok(`Valid ${vType.value}${r.info ? ` (${r.info})` : ''}.`);
      else vStatus.error(`Invalid ${vType.value}: ${r.reason}`);
    };
    vInput.addEventListener('input', validate);
    vType.addEventListener('change', validate);

    root.append(
      h('div', { class: 'form-row' }, field('Records', count), field('Format', format), h('button', { class: 'primary', onclick: run }, 'Generate')),
      h('div', { class: 'fields-grid' }, boxes.map((b) => b.el)),
      status.el,
      out.el,
      h('p', { class: 'note' }, 'Identifiers pass the official checksum rules but are random: they do not belong to real people, companies or bank accounts. Emails use reserved example domains so messages can never reach a real person. PESEL always matches the generated birth date and sex.'),
      h('h3', {}, 'Quick single values'),
      h('div', { class: 'form-row' }, ['PESEL', 'NIP', 'REGON', 'IBAN', 'UUID'].map((kind) =>
        h('button', {
          onclick: () => {
            const p = generatePerson();
            const value = { PESEL: p.pesel, NIP: p.nip, REGON: p.regon, IBAN: p.iban, UUID: p.uuid }[kind];
            copyText(value, `${kind} copied: ${kind === 'IBAN' ? formatIban(value) : value}`);
          },
        }, `Copy new ${kind}`))),
      h('h3', {}, 'Validate'),
      h('div', { class: 'form-row' }, field('Type', vType), field('Value', vInput)),
      vStatus.el,
    );
  },
};
