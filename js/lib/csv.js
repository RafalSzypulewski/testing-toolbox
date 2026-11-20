// CSV reading and writing (RFC 4180) and conversion to and from JSON. No DOM access.

export class CsvError extends SyntaxError {}

export const DELIMITERS = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

/**
 * Reads CSV text into rows of strings. Handles quoted fields with doubled quotes, delimiters and
 * line breaks inside quotes, CRLF / LF / CR line ends and a leading byte-order mark.
 * Completely empty lines are skipped.
 */
export function parseCsv(text, { delimiter = ',' } = {}) {
  if (delimiter.length !== 1 || /["\r\n]/.test(delimiter)) throw new CsvError('The delimiter must be a single character other than a quote or line break.');
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let line = 1;
  let i = 0;
  const n = src.length;
  let fieldStarted = false;
  let rowHasQuoted = false; // a row that is just "" is a real row; a row with nothing at all is a blank line
  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '' && !rowHasQuoted)) rows.push(row);
    row = [];
    rowHasQuoted = false;
  };

  while (i < n) {
    const c = src[i];
    if (c === '"' && !fieldStarted) {
      // a quoted field
      const openedAt = line;
      i++;
      for (;;) {
        if (i >= n) throw new CsvError(`The quoted field that starts on line ${openedAt} is never closed (a closing " is missing).`);
        const q = src[i];
        if (q === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (q === '\n') line++;
        if (q === '\r' && src[i + 1] !== '\n') line++;
        field += q;
        i++;
      }
      const after = src[i];
      if (i < n && after !== delimiter && after !== '\n' && after !== '\r') {
        throw new CsvError(`Line ${line}: unexpected "${after}" after the closing quote of a field; a field that starts with a quote must end with one before the next delimiter.`);
      }
      fieldStarted = true;
      rowHasQuoted = true;
      continue;
    }
    if (c === delimiter) {
      endField();
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      i++;
      continue;
    }
    field += c;
    fieldStarted = true;
    i++;
  }
  if (fieldStarted || field !== '' || row.length) endRow();
  return rows;
}

/** Writes rows of strings as CSV. A field is quoted only when it has to be. */
export function toCsv(rows, { delimiter = ',', eol = '\n' } = {}) {
  if (delimiter.length !== 1 || /["\r\n]/.test(delimiter)) throw new CsvError('The delimiter must be a single character other than a quote or line break.');
  const special = new RegExp(`["\\r\\n${delimiter.replace(/[\\\]^-]/g, '\\$&')}]`);
  const cell = (s) => (special.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // a row holding one empty cell is written as "" so that it is not mistaken for a blank line
  return rows.map((r) => (r.length === 1 && r[0] === '' ? '""' : r.map(cell).join(delimiter))).join(eol);
}

// ---- JSON <-> CSV ----------------------------------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function flatten(value, prefix, out, arrays) {
  if (isPlainObject(value) && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out, arrays);
  } else if (Array.isArray(value) && arrays === 'index' && value.length) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out, arrays));
  } else {
    out[prefix] = value;
  }
}

const cellText = (v, nullAs) => {
  if (v === undefined) return '';
  if (v === null) return nullAs;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * Turns JSON (an array of objects, or one object) into CSV text.
 * @param {{delimiter?: string, flatten?: boolean, arrays?: 'json'|'index', nullAs?: string, eol?: string}} options
 *   flatten: write nested objects as dotted columns (address.city); arrays: keep arrays as JSON text
 *   in one cell ('json') or spread them into columns (tags[0], tags[1])
 */
export function jsonToCsv(value, { delimiter = ',', flatten: doFlatten = true, arrays = 'json', nullAs = '', eol = '\n' } = {}) {
  const rowsIn = Array.isArray(value) ? value : [value];
  if (value === null || typeof value !== 'object') throw new CsvError('CSV needs an array of objects, or one object, not a single value.');
  if (rowsIn.length === 0) return '';

  if (rowsIn.every(Array.isArray)) {
    return toCsv(rowsIn.map((r) => r.map((c) => cellText(c, nullAs))), { delimiter, eol });
  }
  const flat = rowsIn.map((row, index) => {
    if (isPlainObject(row)) {
      if (!doFlatten) return row;
      const out = {};
      for (const [key, v] of Object.entries(row)) flatten(v, key, out, arrays); // a row with no keys adds no column
      return out;
    }
    if (row !== null && typeof row === 'object') throw new CsvError(`Item ${index + 1} is an array; mixing objects and arrays cannot become one table.`);
    return { value: row }; // a list of plain values becomes one column
  });
  const header = [];
  const seen = new Set();
  for (const row of flat) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }
  const lines = [header, ...flat.map((row) => header.map((k) => cellText(row[k], nullAs)))];
  return toCsv(lines, { delimiter, eol });
}

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function infer(text) {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (NUMBER.test(text)) {
    const n = Number(text);
    // keep long digit strings (ids, phone numbers) as text so no digits are lost
    if (Number.isFinite(n) && (!/^-?\d+$/.test(text) || Number.isSafeInteger(n))) return n;
  }
  return text;
}

function assign(target, path, value, column) {
  let node = target;
  path.forEach((step, i) => {
    const last = i === path.length - 1;
    if (last) {
      if (step in node && node[step] !== undefined) throw new CsvError(`Column "${column}" clashes with another column that uses the same name.`);
      node[step] = value;
      return;
    }
    if (node[step] === undefined) node[step] = typeof path[i + 1] === 'number' ? [] : {};
    else if (typeof node[step] !== 'object' || node[step] === null) throw new CsvError(`Column "${column}" clashes with a column that holds a plain value at "${path.slice(0, i + 1).join('.')}".`);
    node = node[step];
  });
}

const pathOf = (header) => header.split(/\.|(?=\[)/).filter(Boolean).map((p) => (/^\[\d+\]$/.test(p) ? Number(p.slice(1, -1)) : p));

/**
 * Reads CSV text into JSON.
 * @param {{delimiter?: string, header?: boolean, infer?: boolean, emptyAs?: 'string'|'null', unflatten?: boolean}} options
 */
export function csvToJson(text, { delimiter = ',', header = true, infer: doInfer = true, emptyAs = 'string', unflatten = false } = {}) {
  const rows = parseCsv(text, { delimiter });
  const convert = (cell) => (cell === '' ? (emptyAs === 'null' ? null : '') : doInfer ? infer(cell) : cell);
  if (!header) return rows.map((r) => r.map(convert));
  if (rows.length === 0) return [];
  const names = rows[0];
  const dupe = names.find((name, i) => names.indexOf(name) !== i);
  if (dupe !== undefined) throw new CsvError(`The header row has the column "${dupe}" more than once.`);
  if (names.some((name) => name === '')) throw new CsvError('The header row has an empty column name.');
  return rows.slice(1).map((row, index) => {
    if (row.length > names.length) throw new CsvError(`Row ${index + 2} has ${row.length} cells but the header has only ${names.length} columns.`);
    const out = {};
    names.forEach((name, i) => {
      const cell = i < row.length ? convert(row[i]) : emptyAs === 'null' ? null : '';
      if (unflatten) assign(out, pathOf(name), cell, name);
      else out[name] = cell;
    });
    return out;
  });
}
