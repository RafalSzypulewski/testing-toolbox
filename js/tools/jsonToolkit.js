import { h, field, checkbox, statusLine, outputPanel, copyText, tabsWidget } from '../util.js';
import { formatJson } from '../lib/json.js';
import { query, JsonPathError } from '../lib/jsonpath.js';
import { jsonToCsv, csvToJson, DELIMITERS, CsvError } from '../lib/csv.js';
import { parseYaml, stringifyYaml, YamlError } from '../lib/yaml.js';
import { diffJson, ARRAY_MODES, DiffError } from '../lib/jsondiff.js';

const SAMPLE = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "price": 8.99 }
    ],
    "bicycle": { "color": "red", "price": 399 }
  }
}`;

const SAMPLE_RIGHT = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 9.95 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "price": 8.99 }
    ],
    "bicycle": { "color": "blue", "price": 399 }
  }
}`;

const DIRECTIONS = [
  ['json-csv', 'JSON to CSV'],
  ['csv-json', 'CSV to JSON'],
  ['json-yaml', 'JSON to YAML'],
  ['yaml-json', 'YAML to JSON'],
];

const EXTENSION = { 'json-csv': 'csv', 'csv-json': 'json', 'json-yaml': 'yaml', 'yaml-json': 'json' };
const CONVERT_SAMPLES = {
  'json-csv': '[\n  {"name": "Anna", "city": {"name": "Gdańsk"}, "tags": ["qa", "dev"]},\n  {"name": "Piotr", "city": {"name": "Łódź"}, "tags": []}\n]',
  'csv-json': 'name,city.name,age\nAnna,Gdańsk,31\nPiotr,Łódź,',
  'json-yaml': '{"name": "Anna", "tags": ["qa", "dev"], "address": {"city": "Gdańsk"}}',
  'yaml-json': 'name: Anna\ntags:\n  - qa\n  - dev\naddress:\n  city: Gdańsk\n',
};

/** Reads JSON, returning a message with line and column when it is invalid. */
function readJson(text, name) {
  const result = formatJson(text);
  if (!result.ok) {
    const where = result.line ? ` (line ${result.line}, column ${result.column})` : '';
    return { error: `${name}: ${result.error}${where}` };
  }
  return { value: JSON.parse(text) };
}

const shown = (v) => (v === undefined ? '' : JSON.stringify(v));
const KIND = {
  added: ['+', 'Added', 'only in the right side'],
  removed: ['−', 'Removed', 'only in the left side'],
  changed: ['~', 'Changed', 'different value'],
  type: ['≠', 'Type changed', 'different type'],
};

function queryTab() {
  const input = h('textarea', { rows: 12, spellcheck: false, value: SAMPLE, 'aria-label': 'JSON to search' });
  const path = h('input', { type: 'text', value: '$.store.book[?@.price < 10].title', spellcheck: false, size: 50, 'aria-describedby': 'jt-query-help' });
  const status = statusLine();
  const result = h('div');
  const out = outputPanel({ label: 'Matched values', filename: 'matches.json', rows: 6 });
  let timer;
  let found = [];

  const run = () => {
    result.replaceChildren();
    found = [];
    out.set('');
    if (input.value.trim() === '') return status.info('Paste some JSON to search.');
    const doc = readJson(input.value, 'JSON');
    if (doc.error) return status.error(doc.error);
    const source = path.value.trim();
    try {
      found = query(doc.value, source);
    } catch (err) {
      if (err instanceof JsonPathError) return status.error(`Query: ${err.message}`);
      throw err;
    }
    status.ok(`${found.length} ${found.length === 1 ? 'match' : 'matches'}.`);
    out.set(JSON.stringify(found.map((m) => m.value), null, 2));
    if (found.length) {
      result.append(h('div', { class: 'table-wrap', role: 'region', tabindex: 0, 'aria-label': 'Matches, scrollable' },
        h('table', {},
          h('caption', { class: 'sr-only' }, 'Matches'),
          h('tr', {}, h('th', {}, '#'), h('th', {}, 'Path'), h('th', {}, 'Value')),
          found.slice(0, 500).map((m, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, h('code', {}, m.pathText)), h('td', {}, h('code', {}, shown(m.value))))))));
      if (found.length > 500) result.append(h('p', { class: 'muted' }, `Showing the first 500 of ${found.length}. Copy values to get all of them.`));
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  };
  input.addEventListener('input', later);
  path.addEventListener('input', later);

  const el = h('div', {},
    field('JSON', input),
    h('div', { class: 'form-row', style: 'margin-top:.75rem' },
      field('JSONPath query', path),
      h('button', { onclick: () => found.length && copyText(found.map((m) => m.pathText).join('\n'), 'Paths copied') }, 'Copy paths')),
    status.el, result, out.el,
    h('p', { class: 'note', id: 'jt-query-help' },
      'JSONPath as defined by RFC 9535. $ is the root, .name or [\'name\'] a member, [0] an item, [-1] the last, [1:3] a slice, * everything one level down, '
      + '.. searches at any depth, [?@.price < 10] filters. Functions: length, count, match, search, value. Regular expressions use the browser engine.'));
  return { el, run, stop: () => clearTimeout(timer) };
}

function convertTab() {
  const direction = h('select', { 'aria-label': 'Direction' }, DIRECTIONS.map(([v, l]) => h('option', { value: v }, l)));
  const input = h('textarea', { rows: 12, spellcheck: false, value: CONVERT_SAMPLES['json-csv'], 'aria-label': 'Input' });
  const delimiter = h('select', {}, Object.entries(DELIMITERS).map(([v, l]) => h('option', { value: v }, l)));
  const flatten = checkbox('Spread nested objects into columns (city.name)', true);
  const arrays = h('select', {}, h('option', { value: 'json' }, 'Keep arrays as JSON text in one cell'), h('option', { value: 'index' }, 'Spread arrays into columns (tags[0])'));
  const nullAs = h('input', { type: 'text', value: '', size: 8 });
  const infer = checkbox('Turn numbers, true, false and null into JSON values', true);
  const emptyAs = h('select', {}, h('option', { value: 'string' }, 'Empty text'), h('option', { value: 'null' }, 'null'));
  const unflatten = checkbox('Rebuild objects from dotted columns (city.name)', false);
  const header = checkbox('First row is the header', true);
  const indent = h('select', {}, [2, 4].map((n) => h('option', { value: n }, `${n} spaces`)));
  const literal = checkbox('Use | blocks for multi-line text', true);
  const status = statusLine();
  const notes = h('div');
  const out = outputPanel({ label: 'Converted', filename: 'converted.csv', rows: 12 });
  const options = h('div');
  let timer;
  let last = direction.value;

  const drawOptions = () => {
    const d = direction.value;
    options.replaceChildren(h('div', { class: 'form-row' },
      ...(d === 'json-csv' ? [field('Delimiter', delimiter), flatten.el, field('Arrays', arrays), field('null becomes', nullAs)] : []),
      ...(d === 'csv-json' ? [field('Delimiter', delimiter), header.el, infer.el, field('Empty cell becomes', emptyAs), unflatten.el] : []),
      ...(d === 'json-yaml' ? [field('Indent', indent), literal.el] : [])));
  };

  const run = () => {
    notes.replaceChildren();
    out.set('');
    const d = direction.value;
    out.setFilename(`converted.${EXTENSION[d]}`);
    if (input.value.trim() === '') return status.info('Paste something to convert.');
    try {
      let text;
      const warnings = [];
      if (d === 'json-csv' || d === 'json-yaml') {
        const doc = readJson(input.value, 'JSON');
        if (doc.error) return status.error(doc.error);
        text = d === 'json-csv'
          ? jsonToCsv(doc.value, { delimiter: delimiter.value, flatten: flatten.input.checked, arrays: arrays.value, nullAs: nullAs.value })
          : stringifyYaml(doc.value, { indent: Number(indent.value), literalBlocks: literal.input.checked });
      } else if (d === 'csv-json') {
        text = JSON.stringify(csvToJson(input.value, {
          delimiter: delimiter.value, header: header.input.checked, infer: infer.input.checked, emptyAs: emptyAs.value, unflatten: unflatten.input.checked && header.input.checked,
        }), null, 2);
      } else {
        const { documents, warnings: w } = parseYaml(input.value);
        warnings.push(...w);
        if (documents.length > 1) warnings.push(`The text holds ${documents.length} YAML documents, so the result is an array of them.`);
        text = JSON.stringify(documents.length === 1 ? documents[0] : documents, null, 2);
      }
      out.set(text);
      status.ok('Converted.');
      for (const w of warnings) notes.append(h('p', { class: 'note' }, w));
    } catch (err) {
      if (err instanceof CsvError || err instanceof YamlError) return status.error(err.message);
      throw err;
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  };
  direction.addEventListener('change', () => {
    // swap in a matching sample only if the person has not changed the previous one
    if (input.value === CONVERT_SAMPLES[last]) input.value = CONVERT_SAMPLES[direction.value];
    last = direction.value;
    drawOptions();
    run();
  });
  for (const control of [input, nullAs]) control.addEventListener('input', later);
  for (const control of [delimiter, arrays, emptyAs, indent, flatten.input, infer.input, unflatten.input, header.input, literal.input]) control.addEventListener('change', run);
  drawOptions();

  const el = h('div', {}, h('div', { class: 'form-row' }, field('Direction', direction)), field('Input', input), options, status.el, notes, out.el,
    h('p', { class: 'note' }, 'CSV follows RFC 4180. YAML covers the everyday subset (maps, lists, quoted and block text, anchors, aliases, merge keys) in YAML 1.2 core rules, so yes, no and on stay text. '
      + 'Whole numbers beyond 9,007,199,254,740,991 are kept as text so no digits are lost.'));
  return { el, run, stop: () => clearTimeout(timer) };
}

function compareTab() {
  const left = h('textarea', { rows: 14, spellcheck: false, value: SAMPLE, 'aria-label': 'Left JSON' });
  const right = h('textarea', { rows: 14, spellcheck: false, value: SAMPLE_RIGHT, 'aria-label': 'Right JSON' });
  const mode = h('select', {}, Object.entries(ARRAY_MODES).map(([v, l]) => h('option', { value: v }, l)));
  const key = h('input', { type: 'text', value: 'id', size: 10 });
  const ignore = h('textarea', { rows: 2, spellcheck: false, placeholder: '$..updatedAt', 'aria-describedby': 'jt-compare-help' });
  const tolerance = h('input', { type: 'number', min: 0, step: 'any', value: 0, size: 6 });
  const ignoreCase = checkbox('Ignore upper and lower case in text', false);
  const trim = checkbox('Ignore spaces around text', false);
  const nullMissing = checkbox('Treat null and a missing field as the same', false);
  const status = statusLine();
  const notes = h('div');
  const result = h('div');
  const keyField = field('Identifying field', key);
  let timer;

  const run = () => {
    result.replaceChildren();
    notes.replaceChildren();
    keyField.hidden = mode.value !== 'key';
    if (left.value.trim() === '' && right.value.trim() === '') return status.info('Paste JSON on both sides to compare.');
    const a = readJson(left.value, 'Left JSON');
    if (a.error) return status.error(a.error);
    const b = readJson(right.value, 'Right JSON');
    if (b.error) return status.error(b.error);
    let diff;
    try {
      diff = diffJson(a.value, b.value, {
        arrays: mode.value, arrayKey: key.value.trim(), ignore: ignore.value.split('\n').map((s) => s.trim()).filter(Boolean),
        numberTolerance: Number(tolerance.value) || 0, ignoreCase: ignoreCase.input.checked, trimStrings: trim.input.checked, nullEqualsMissing: nullMissing.input.checked,
      });
    } catch (err) {
      if (err instanceof DiffError || err instanceof JsonPathError) return status.error(err.message);
      throw err;
    }
    const { stats } = diff;
    if (!stats.total) status.ok('No differences: the two documents are the same.');
    else status.info(`${stats.total} ${stats.total === 1 ? 'difference' : 'differences'}: ${stats.added} added, ${stats.removed} removed, ${stats.changed} changed, ${stats.type} changed type.`);
    for (const w of diff.warnings) notes.append(h('p', { class: 'note' }, w));
    if (!stats.total) return;
    result.append(h('div', { class: 'table-wrap', role: 'region', tabindex: 0, 'aria-label': 'Differences, scrollable' },
      h('table', {},
        h('caption', { class: 'sr-only' }, 'Differences'),
        h('tr', {}, h('th', {}, 'Kind'), h('th', {}, 'Path'), h('th', {}, 'Left'), h('th', {}, 'Right')),
        diff.differences.slice(0, 1000).map((d) => {
          const [mark, label] = KIND[d.kind];
          return h('tr', {},
            h('td', {}, h('span', { 'aria-hidden': 'true' }, `${mark} `), label),
            h('td', {}, h('code', {}, d.path)),
            h('td', {}, d.kind === 'added' ? '' : h('code', {}, shown(d.left))),
            h('td', {}, d.kind === 'removed' ? '' : h('code', {}, shown(d.right))));
        }))));
    if (diff.differences.length > 1000) result.append(h('p', { class: 'muted' }, `Showing the first 1,000 of ${diff.differences.length} differences.`));
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  };
  for (const c of [left, right, ignore, key, tolerance]) c.addEventListener('input', later);
  for (const c of [mode, ignoreCase.input, trim.input, nullMissing.input]) c.addEventListener('change', run);

  const el = h('div', {},
    h('div', { class: 'two-col' }, field('Left (before)', left), field('Right (after)', right)),
    h('div', { class: 'form-row', style: 'margin-top:.75rem' }, field('Arrays', mode), keyField, field('Number tolerance', tolerance, 'Numbers closer than this count as equal.')),
    h('div', { class: 'form-row' }, ignoreCase.el, trim.el, nullMissing.el),
    field('Ignore these paths (one JSONPath per line, optional)', ignore),
    status.el, notes, result,
    h('p', { class: 'note', id: 'jt-compare-help' }, 'The order of fields never matters. Differences are listed in document order, with the path of each one. Ignored paths are removed from both sides before comparing, e.g. $..updatedAt.'));
  return { el, run, stop: () => clearTimeout(timer) };
}

export default {
  id: 'json-toolkit',
  name: 'JSON toolkit',
  category: 'Convert',
  description: 'Search JSON with JSONPath, convert between JSON, CSV and YAML, and compare two JSON documents by meaning.',
  keywords: ['json', 'jsonpath', 'query', 'csv', 'yaml', 'convert', 'compare', 'diff', 'semantic', 'api', 'response', 'filter', 'jq'],
  render(root) {
    const q = queryTab();
    const c = convertTab();
    const d = compareTab();
    const wrap = (el) => h('div', {}, el);
    const tabs = tabsWidget({
      label: 'JSON tools',
      prefix: 'jt',
      items: [
        { key: 'query', label: 'Query', panel: wrap(q.el) },
        { key: 'convert', label: 'Convert', panel: wrap(c.el) },
        { key: 'compare', label: 'Compare', panel: wrap(d.el) },
      ],
    });
    root.append(tabs.el);
    q.run();
    c.run();
    d.run();
    return () => [q, c, d].forEach((t) => t.stop());
  },
};
