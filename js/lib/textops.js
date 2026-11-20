// Text transformations (case, lines, clean-up, extraction). Each operation declares its
// parameters so the UI can be generated from this list. No DOM access.

const LINE_BREAK = /\r\n|\r|\n/;

/** Runs `fn` on the lines of `text` (an array in, an array out), keeping a final line break. */
function withLines(text, fn) {
  const trailing = /(\r\n|\r|\n)$/.test(text);
  const body = trailing ? text.replace(/(\r\n|\r|\n)$/, '') : text;
  const out = fn(text === '' ? [] : body.split(LINE_BREAK));
  return out.join('\n') + (trailing && out.length ? '\n' : '');
}

const perLine = (fn) => (text) => withLines(text, (lines) => lines.map(fn));

const unescapeSeparator = (s) => s.replace(/\\(t|n|r|\\)/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[c]);
const capitalize = (word) => {
  const [first = '', ...rest] = Array.from(word);
  return first.toUpperCase() + rest.join('').toLowerCase();
};

// Words inside identifiers and phrases: HTTPServer -> HTTP, Server; get2Items -> get, 2, Items
const WORD = /\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{Lo}+/gu;
const words = (line) => line.match(WORD) ?? [];

const FOLD = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', ø: 'o', Ø: 'O', ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', þ: 'th', Þ: 'Th', ı: 'i' };

const keyOf = (line, ignoreCase, trim = false) => {
  let k = trim ? line.trim() : line;
  if (ignoreCase) k = k.toLowerCase();
  return k;
};

function leadingNumber(line) {
  const m = /^\s*([-+]?\d+(?:[.,]\d+)?)/.exec(line);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function makeRegex(text, flags) {
  try {
    return new RegExp(text, flags);
  } catch (err) {
    throw new Error(err.message);
  }
}

const SORT_ORDER = { key: 'order', label: 'Order', type: 'select', default: 'asc', options: [['asc', 'A → Z (ascending)'], ['desc', 'Z → A (descending)']] };
// Alphabets differ: in Polish "ż" is a letter after "z", in English it is just a "z" with a dot.
const SORT_LANGUAGES = [['', 'Automatic (your browser)'], ['pl', 'Polish'], ['en', 'English'], ['de', 'German'], ['cs', 'Czech'], ['fr', 'French'], ['es', 'Spanish'], ['uk', 'Ukrainian'], ['ru', 'Russian']];
const check = (key, label, def) => ({ key, label, type: 'checkbox', default: def });

export const OPERATIONS = [
  // ---- case -----------------------------------------------------------------------
  { id: 'upper', group: 'Case', label: 'UPPERCASE', params: [], run: (t) => t.toUpperCase() },
  { id: 'lower', group: 'Case', label: 'lowercase', params: [], run: (t) => t.toLowerCase() },
  {
    id: 'title', group: 'Case', label: 'Title Case', params: [],
    run: (t) => t.replace(/\p{L}[\p{L}\p{N}'’]*/gu, capitalize),
  },
  {
    id: 'sentence', group: 'Case', label: 'Sentence case', params: [],
    run: (t) => t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gmu, (_, pre, ch) => pre + ch.toUpperCase()),
  },
  {
    id: 'swap', group: 'Case', label: 'sWAP cASE', params: [],
    run: (t) => Array.from(t, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  },
  { id: 'camel', group: 'Case', label: 'camelCase (per line)', params: [], run: perLine((l) => words(l).map((w, i) => (i ? capitalize(w) : w.toLowerCase())).join('')) },
  { id: 'pascal', group: 'Case', label: 'PascalCase (per line)', params: [], run: perLine((l) => words(l).map(capitalize).join('')) },
  { id: 'snake', group: 'Case', label: 'snake_case (per line)', params: [], run: perLine((l) => words(l).map((w) => w.toLowerCase()).join('_')) },
  { id: 'kebab', group: 'Case', label: 'kebab-case (per line)', params: [], run: perLine((l) => words(l).map((w) => w.toLowerCase()).join('-')) },
  { id: 'constant', group: 'Case', label: 'CONSTANT_CASE (per line)', params: [], run: perLine((l) => words(l).map((w) => w.toUpperCase()).join('_')) },

  // ---- lines ----------------------------------------------------------------------
  {
    id: 'sort', group: 'Lines', label: 'Sort lines alphabetically',
    params: [
      SORT_ORDER,
      { key: 'locale', label: 'Language rules', type: 'select', default: '', options: SORT_LANGUAGES },
      check('ignoreCase', 'Ignore upper/lower case', true),
      check('natural', 'Natural order (item 2 before item 10)', true),
    ],
    run: (t, p) => withLines(t, (lines) => {
      const collator = new Intl.Collator(p.locale || undefined, { numeric: p.natural, sensitivity: p.ignoreCase ? 'accent' : 'variant' });
      return [...lines].sort((a, b) => (p.order === 'desc' ? collator.compare(b, a) : collator.compare(a, b)));
    }),
  },
  {
    id: 'sortLength', group: 'Lines', label: 'Sort lines by length', params: [{ ...SORT_ORDER, options: [['asc', 'Shortest first'], ['desc', 'Longest first']] }],
    run: (t, p) => withLines(t, (lines) => [...lines].sort((a, b) => (p.order === 'desc' ? Array.from(b).length - Array.from(a).length : Array.from(a).length - Array.from(b).length))),
  },
  {
    id: 'sortNumber', group: 'Lines', label: 'Sort lines by leading number', params: [{ ...SORT_ORDER, options: [['asc', 'Smallest first'], ['desc', 'Largest first']] }],
    run: (t, p) => withLines(t, (lines) => [...lines].sort((a, b) => {
      const x = leadingNumber(a);
      const y = leadingNumber(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; // lines without a number go last
      return p.order === 'desc' ? y - x : x - y;
    })),
  },
  { id: 'reverse', group: 'Lines', label: 'Reverse the order of lines', params: [], run: (t) => withLines(t, (lines) => [...lines].reverse()) },
  {
    id: 'shuffle', group: 'Lines', label: 'Shuffle lines randomly', params: [],
    run: (t, _p, rng = Math.random) => withLines(t, (lines) => {
      const a = [...lines];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }),
  },
  {
    id: 'dedupe', group: 'Lines', label: 'Remove duplicate lines (keep first)',
    params: [check('ignoreCase', 'Ignore upper/lower case', false), check('trim', 'Ignore spaces at the ends', false)],
    run: (t, p) => withLines(t, (lines) => {
      const seen = new Set();
      return lines.filter((l) => {
        const k = keyOf(l, p.ignoreCase, p.trim);
        return seen.has(k) ? false : (seen.add(k), true);
      });
    }),
  },
  {
    id: 'onlyDuplicates', group: 'Lines', label: 'Keep only lines that appear more than once',
    params: [check('ignoreCase', 'Ignore upper/lower case', false)],
    run: (t, p) => withLines(t, (lines) => {
      const counts = new Map();
      for (const l of lines) counts.set(keyOf(l, p.ignoreCase), (counts.get(keyOf(l, p.ignoreCase)) ?? 0) + 1);
      const done = new Set();
      return lines.filter((l) => {
        const k = keyOf(l, p.ignoreCase);
        if (counts.get(k) < 2 || done.has(k)) return false;
        done.add(k);
        return true;
      });
    }),
  },
  {
    id: 'count', group: 'Lines', label: 'Count how often each line appears',
    params: [check('ignoreCase', 'Ignore upper/lower case', false), check('skipEmpty', 'Skip empty lines', true)],
    run: (t, p) => withLines(t, (lines) => {
      const counts = new Map();
      for (const l of lines) {
        if (p.skipEmpty && l.trim() === '') continue;
        const k = keyOf(l, p.ignoreCase);
        const entry = counts.get(k) ?? { line: l, n: 0 };
        entry.n++;
        counts.set(k, entry);
      }
      return [...counts.values()].sort((a, b) => b.n - a.n).map((e) => `${e.n}\t${e.line}`);
    }),
  },
  {
    id: 'removeEmpty', group: 'Lines', label: 'Remove empty lines', params: [check('whitespace', 'Also lines with only spaces', true)],
    run: (t, p) => withLines(t, (lines) => lines.filter((l) => (p.whitespace ? l.trim() !== '' : l !== ''))),
  },
  {
    id: 'filter', group: 'Lines', label: 'Keep or remove lines containing text',
    params: [
      { key: 'text', label: 'Text to look for', type: 'text', default: '' },
      { key: 'mode', label: 'Action', type: 'select', default: 'keep', options: [['keep', 'Keep matching lines'], ['remove', 'Remove matching lines']] },
      check('ignoreCase', 'Ignore upper/lower case', true),
      check('regex', 'Text is a regular expression', false),
    ],
    run: (t, p) => {
      if (p.text === '') return t;
      const re = p.regex ? makeRegex(p.text, p.ignoreCase ? 'i' : '') : null;
      const needle = p.ignoreCase ? p.text.toLowerCase() : p.text;
      const has = (l) => (re ? re.test(l) : (p.ignoreCase ? l.toLowerCase() : l).includes(needle));
      return withLines(t, (lines) => lines.filter((l) => has(l) === (p.mode === 'keep')));
    },
  },
  {
    id: 'number', group: 'Lines', label: 'Add line numbers',
    params: [{ key: 'start', label: 'Start at', type: 'number', default: 1 }, { key: 'separator', label: 'After the number', type: 'text', default: '. ' }, check('pad', 'Pad with zeros', false)],
    run: (t, p) => withLines(t, (lines) => {
      const start = Number(p.start);
      if (!Number.isInteger(start)) throw new RangeError('Start must be a whole number.');
      const width = String(start + lines.length - 1).length;
      return lines.map((l, i) => `${p.pad ? String(start + i).padStart(width, '0') : start + i}${unescapeSeparator(p.separator)}${l}`);
    }),
  },
  {
    id: 'unnumber', group: 'Lines', label: 'Remove line numbers (1. 2) 3: 4 - or a tab)', params: [],
    run: (t) => withLines(t, (lines) => lines.map((l) => l.replace(/^\s*\d+(?:\s*[.):\-–]\s*|\t)/, ''))),
  },
  {
    id: 'affix', group: 'Lines', label: 'Add text before and after every line',
    params: [{ key: 'prefix', label: 'Before', type: 'text', default: '' }, { key: 'suffix', label: 'After', type: 'text', default: '' }, check('skipEmpty', 'Skip empty lines', true)],
    run: (t, p) => withLines(t, (lines) => lines.map((l) => (p.skipEmpty && l === '' ? l : unescapeSeparator(p.prefix) + l + unescapeSeparator(p.suffix)))),
  },
  {
    id: 'join', group: 'Lines', label: 'Join lines into one line',
    params: [
      { key: 'separator', label: 'Separator', type: 'text', default: ', ' },
      { key: 'quote', label: 'Wrap each line in', type: 'select', default: '', options: [['', 'nothing'], ["'", "single quotes 'a'"], ['"', 'double quotes "a"'], ['`', 'backticks `a`']] },
      check('skipEmpty', 'Skip empty lines', true),
    ],
    run: (t, p) => {
      let lines = t === '' ? [] : t.replace(/(\r\n|\r|\n)$/, '').split(LINE_BREAK);
      if (p.skipEmpty) lines = lines.filter((l) => l.trim() !== '');
      return lines.map((l) => p.quote + l + p.quote).join(unescapeSeparator(p.separator));
    },
  },
  {
    id: 'split', group: 'Lines', label: 'Split text into lines at a separator',
    params: [{ key: 'separator', label: 'Separator (\\t = tab)', type: 'text', default: ',' }, check('trim', 'Trim spaces around each part', true), check('skipEmpty', 'Skip empty parts', true)],
    run: (t, p) => {
      if (p.separator === '') throw new RangeError('Enter a separator.');
      let parts = t.split(unescapeSeparator(p.separator));
      if (p.trim) parts = parts.map((x) => x.trim());
      if (p.skipEmpty) parts = parts.filter((x) => x !== '');
      return parts.join('\n');
    },
  },

  // ---- clean-up -------------------------------------------------------------------
  {
    id: 'trim', group: 'Clean-up', label: 'Trim spaces from every line',
    params: [{ key: 'mode', label: 'Where', type: 'select', default: 'both', options: [['both', 'Both ends'], ['start', 'Start only'], ['end', 'End only']] }],
    run: (t, p) => perLine((l) => (p.mode === 'start' ? l.trimStart() : p.mode === 'end' ? l.trimEnd() : l.trim()))(t),
  },
  { id: 'collapse', group: 'Clean-up', label: 'Collapse repeated spaces and tabs into one space', params: [], run: (t) => t.replace(/[^\S\r\n]+/g, ' ') },
  {
    id: 'removeWhitespace', group: 'Clean-up', label: 'Remove all whitespace', params: [check('keepBreaks', 'Keep line breaks', false)],
    run: (t, p) => (p.keepBreaks ? t.replace(/[^\S\r\n]+/g, '') : t.replace(/\s+/g, '')),
  },
  {
    id: 'removeBreaks', group: 'Clean-up', label: 'Remove line breaks', params: [{ key: 'replacement', label: 'Replace each with', type: 'text', default: ' ' }],
    run: (t, p) => t.replace(/(\r\n|\r|\n)$/, '').replace(/\r\n|\r|\n/g, unescapeSeparator(p.replacement)),
  },
  {
    id: 'diacritics', group: 'Clean-up', label: 'Remove diacritics (ą → a, ł → l, é → e)', params: [],
    run: (t) => t.normalize('NFD').replace(/\p{M}/gu, '').replace(/[łŁđĐðÐøØßæÆœŒþÞı]/g, (c) => FOLD[c]).normalize('NFC'),
  },
  {
    id: 'tabsToSpaces', group: 'Clean-up', label: 'Tabs to spaces', params: [{ key: 'width', label: 'Tab width', type: 'number', default: 4 }],
    run: (t, p) => {
      const w = Number(p.width);
      if (!Number.isInteger(w) || w < 1 || w > 16) throw new RangeError('Tab width must be a whole number from 1 to 16.');
      return perLine((line) => {
        let out = '';
        for (const ch of line) out += ch === '\t' ? ' '.repeat(w - (Array.from(out).length % w)) : ch;
        return out;
      })(t);
    },
  },
  {
    id: 'spacesToTabs', group: 'Clean-up', label: 'Leading spaces to tabs', params: [{ key: 'width', label: 'Spaces per tab', type: 'number', default: 4 }],
    run: (t, p) => {
      const w = Number(p.width);
      if (!Number.isInteger(w) || w < 1 || w > 16) throw new RangeError('Spaces per tab must be a whole number from 1 to 16.');
      return perLine((l) => l.replace(/^ +/, (sp) => '\t'.repeat(Math.floor(sp.length / w)) + ' '.repeat(sp.length % w)))(t);
    },
  },
  {
    id: 'lineEndings', group: 'Clean-up', label: 'Convert line endings',
    params: [{ key: 'target', label: 'To', type: 'select', default: 'crlf', options: [['lf', 'LF (Linux, macOS)'], ['crlf', 'CRLF (Windows)'], ['cr', 'CR (old Mac)']] }],
    run: (t, p) => t.replace(/\r\n|\r|\n/g, { lf: '\n', crlf: '\r\n', cr: '\r' }[p.target]),
  },
  { id: 'reverseChars', group: 'Clean-up', label: 'Reverse the characters of every line', params: [], run: perLine((l) => Array.from(l).reverse().join('')) },

  // ---- extract --------------------------------------------------------------------
  ...[
    ['emails', 'Extract email addresses', /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu],
    ['urls', 'Extract web addresses (URLs)', /https?:\/\/[^\s<>"')]+/gi, (u) => u.replace(/[.,;:!?]+$/, '')],
    ['numbers', 'Extract numbers', /[-+]?\d+(?:[.,]\d+)?/g],
  ].map(([id, label, re, clean = (x) => x]) => ({
    id, group: 'Extract', label, params: [check('unique', 'Only unique values', true)],
    run: (t, p) => {
      const found = (t.match(re) ?? []).map(clean);
      return (p.unique ? [...new Set(found)] : found).join('\n');
    },
  })),
];

export const GROUPS = [...new Set(OPERATIONS.map((o) => o.group))];

export const getOperation = (id) => {
  const op = OPERATIONS.find((o) => o.id === id);
  if (!op) throw new RangeError(`Unknown operation: ${id}`);
  return op;
};

export const defaultsFor = (op) => Object.fromEntries(op.params.map((p) => [p.key, p.default]));

/** Applies an operation. Missing parameters take their defaults. */
export function runOperation(id, text, params = {}, rng = Math.random) {
  const op = getOperation(id);
  return op.run(text, { ...defaultsFor(op), ...params }, rng);
}
