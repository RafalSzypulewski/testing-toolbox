// YAML <-> JSON for the part of YAML that configuration files and API descriptions use:
// block and flow collections, plain / single-quoted / double-quoted scalars, literal and folded
// block scalars (| and >), comments, anchors (&), aliases (*), merge keys (<<) and several
// documents in one text. Scalars follow the YAML 1.2 core schema (so "yes" and "on" are text).
//
// Not supported, and reported with a clear message instead of being guessed: tags other than
// !!str !!int !!float !!bool !!null, complex keys (?), directives with meaning, and the values
// .inf and .nan (JSON cannot hold them). Integers beyond 9,007,199,254,740,991 are kept as text
// so no digits are lost. No DOM access.

export class YamlError extends SyntaxError {
  constructor(message, line = null) {
    super(line === null ? message : `Line ${line}: ${message}`);
    this.line = line;
  }
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

// ---- plain scalars -----------------------------------------------------------------------------------------

const INT = /^[-+]?[0-9]+$/;
const FLOAT = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;

/** Decides what a plain (unquoted) scalar means, following the YAML 1.2 core schema. */
export function resolvePlain(text, warn = () => {}) {
  if (text === '' || text === '~' || /^(null|Null|NULL)$/.test(text)) return null;
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (INT.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) return n === 0 ? 0 : n; // "-0" is the integer 0
    warn(`The integer ${text} is too large for JSON numbers to hold exactly, so it is kept as text.`);
    return text;
  }
  if (/^0o[0-7]+$/.test(text)) return parseInt(text.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(2), 16);
  if (FLOAT.test(text)) return Number(text);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(text) || /^\.(nan|NaN|NAN)$/.test(text)) {
    throw new YamlError(`"${text}" cannot be written in JSON (JSON has no infinity or NaN).`);
  }
  return text;
}

// ---- double-quoted escapes -----------------------------------------------------------------------------------

const SIMPLE_ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029' };

// ---- the parser -------------------------------------------------------------------------------------------------

class Parser {
  constructor(text) {
    this.warnings = [];
    this.anchors = new Map();
    const parts = text.split(/\r\n|\r|\n/);
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop(); // the text after the final line break is not a line
    this.lines = parts.map((raw, i) => {
      const trimmed = raw.replace(/^ */, '');
      return { n: i + 1, raw, indent: raw.length - trimmed.length, text: trimmed };
    });
    this.pos = 0;
  }

  fail(message, line = this.lines[this.pos]?.n ?? null) {
    throw new YamlError(message, line);
  }

  warn(message) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  isBlank(line) {
    return line.text === '' || line.text.startsWith('#');
  }

  skipBlank() {
    while (this.pos < this.lines.length && this.isBlank(this.lines[this.pos])) this.pos++;
    const line = this.lines[this.pos];
    // indentation must be spaces; (tabs are fine inside quoted text and block scalars, which do not come through here)
    if (line && /^ *\t/.test(line.raw)) this.fail('tabs cannot be used for indentation', line.n);
  }

  // ---- documents ----
  parseAll() {
    const docs = [];
    let current = null; // lines of the document being collected; null between "..." and the next "---"
    let explicit = false; // was it started by "---"? (an explicit empty document counts, an implicit one does not)
    const hasContent = (lines) => lines.some((l) => !this.isBlank(l));
    const finish = () => {
      if (current !== null && (explicit || hasContent(current))) docs.push(current);
    };
    for (const line of this.lines) {
      if (current === null && line.raw.startsWith('%')) continue; // directives such as %YAML 1.2
      if (/^---(\s|$)/.test(line.raw)) {
        finish();
        current = [];
        explicit = true;
        const rest = line.raw.slice(3).trim();
        if (rest !== '' && !rest.startsWith('#')) current.push({ n: line.n, raw: rest, indent: 0, text: rest }); // content after "---"
        continue;
      }
      if (/^\.\.\.(\s|$)/.test(line.raw)) {
        finish();
        current = null;
        explicit = false;
        continue;
      }
      if (current === null) current = [];
      current.push(line);
    }
    finish();
    if (docs.length === 0) docs.push([]); // an empty text is one empty document

    const values = [];
    for (const lines of docs) {
      this.lines = lines;
      this.pos = 0;
      this.anchors = new Map();
      this.skipBlank();
      values.push(this.pos >= this.lines.length ? null : this.parseNode(-1));
      this.skipBlank();
      if (this.pos < this.lines.length) this.fail(`unexpected content "${this.lines[this.pos].text.slice(0, 30)}": check the indentation`);
    }
    return values;
  }

  // ---- nodes ----
  /** Parses the node that starts at the next non-blank line, which must be indented more than parentIndent. */
  parseNode(parentIndent) {
    this.skipBlank();
    if (this.pos >= this.lines.length) return null;
    const line = this.lines[this.pos];
    if (line.indent <= parentIndent) return null;
    if (this.isSeqEntry(line.text)) return this.parseSequence(line.indent);
    if (/^\?(\s|$)/.test(line.text) || this.splitKey(line.text)) return this.parseMapping(line.indent);
    return this.parseInline(line.text, parentIndent, line.indent);
  }

  isSeqEntry(text) {
    return text === '-' || text.startsWith('- ') || text.startsWith('-\t');
  }

  parseSequence(indent) {
    const out = [];
    for (;;) {
      this.skipBlank();
      if (this.pos >= this.lines.length) break;
      const line = this.lines[this.pos];
      if (line.indent < indent) break;
      if (line.indent > indent) this.fail('this item is indented more than the other items in the list');
      if (!this.isSeqEntry(line.text)) break;
      const rest = line.text.slice(1);
      const content = rest.replace(/^[ \t]*/, '');
      if (content === '' || content.startsWith('#')) {
        this.pos++;
        this.skipBlank();
        const next = this.lines[this.pos];
        out.push(next && next.indent > indent ? this.parseNode(indent) : null);
      } else {
        // the item starts on this line: treat the rest of the line as a line of its own
        const offset = line.text.length - content.length;
        this.lines[this.pos] = { ...line, indent: line.indent + offset, text: content };
        out.push(this.parseNode(indent));
      }
    }
    return out;
  }

  /** Finds "key: rest" at the start of a line, or null if the line is not a mapping entry. */
  splitKey(text) {
    if (/^\?(\s|$)/.test(text)) return null; // an explicit key, handled by parseMapping
    let i = 0;
    let key;
    if (text[0] === '"' || text[0] === "'") {
      const q = this.readQuotedFrom(text, 0);
      if (q.needsMore) return null;
      key = { value: q.value, quoted: true };
      i = q.end;
      while (text[i] === ' ' || text[i] === '\t') i++;
      if (text[i] !== ':' || !(i + 1 === text.length || /[ \t]/.test(text[i + 1]))) return null;
    } else {
      if (/^[[{\]}&*!|>%@`,]/.test(text) && !/^[&!*]/.test(text)) return null;
      let j = 0;
      for (; j < text.length; j++) {
        if (text[j] === ':' && (j + 1 === text.length || /[ \t]/.test(text[j + 1]))) break;
        if (text[j] === '#' && j > 0 && /[ \t]/.test(text[j - 1])) return null;
      }
      if (j >= text.length) return null;
      key = { value: text.slice(0, j).trimEnd(), quoted: false };
      i = j;
    }
    if (!key.quoted && /^[&!*]/.test(key.value)) this.fail('anchors, tags and aliases on keys are not supported');
    return { key, rest: text.slice(i + 1).replace(/^[ \t]*/, '') };
  }

  /**
   * An explicit key: "? key" (the key may be a multi-line or block scalar) followed by ": value".
   * Only scalar keys are supported. Returns where the value comes from.
   */
  explicitKey(line, indent) {
    const text = line.text.slice(1).replace(/^[ \t]*/, '');
    let node;
    if (text === '' || text.startsWith('#')) {
      this.pos++;
      this.skipBlank();
      const next = this.lines[this.pos];
      node = next && next.indent > indent ? this.parseNode(indent) : null;
    } else {
      this.lines[this.pos] = { ...line, indent: line.indent + (line.text.length - text.length), text };
      node = this.parseNode(indent);
    }
    if (node !== null && typeof node === 'object') this.fail('complex mapping keys (collections) are not supported', line.n);
    const key = { value: node === null ? 'null' : String(node), quoted: true };
    this.skipBlank();
    const next = this.lines[this.pos];
    if (next && next.indent === indent && /^:(\s|$)/.test(next.text)) {
      return { key, rest: next.text.slice(1).trim(), viaColonLine: true };
    }
    return { key, rest: '', noValueLine: true }; // the key has no ":" line, so it maps to null
  }

  parseMapping(indent) {
    const out = {};
    const merges = [];
    for (;;) {
      this.skipBlank();
      if (this.pos >= this.lines.length) break;
      const line = this.lines[this.pos];
      if (line.indent < indent) break;
      if (line.indent > indent) this.fail('this entry is indented more than the other entries of its mapping');
      if (this.isSeqEntry(line.text)) this.fail('a list item "-" is not allowed here; indent it under a key');
      const explicit = /^\?(\s|$)/.test(line.text);
      const entry = explicit ? this.explicitKey(line, indent) : this.splitKey(line.text);
      if (!entry) this.fail(`expected "key: value" but found "${line.text.slice(0, 30)}"`);
      const { key, rest } = entry;
      const keyText = key.quoted ? key.value : String(resolvePlain(key.value, (m) => this.warn(m)) ?? 'null');
      const isMerge = !key.quoted && key.value === '<<';
      if (!isMerge && hasOwn(out, keyText)) this.fail(`the key "${keyText}" appears twice in the same mapping`);
      const lineNo = line.n;
      let value;
      if (entry.noValueLine) {
        value = null; // nothing to consume: explicitKey already moved past the key
      } else if (entry.viaColonLine && rest !== '' && (this.isSeqEntry(rest) || /^\?(\s|$)/.test(rest) || this.splitKey(rest))) {
        // ": key: value" or ": - item": the value is a collection that starts right after the colon
        const colonLine = this.lines[this.pos];
        const offset = colonLine.text.length - rest.length;
        this.lines[this.pos] = { ...colonLine, indent: colonLine.indent + offset, text: rest };
        value = this.parseNode(indent);
      } else {
        this.pos++;
        value = this.parseValue(rest, indent, lineNo);
      }
      if (isMerge) merges.push({ value, line: lineNo });
      else out[keyText] = value;
    }
    for (const { value, line } of merges) {
      for (const source of Array.isArray(value) ? value : [value]) {
        if (!isMap(source)) this.fail('the value of a merge key (<<) must be a mapping, an alias to one, or a list of them', line);
        for (const [k, v] of Object.entries(source)) if (!hasOwn(out, k)) out[k] = clone(v);
      }
    }
    return out;
  }

  /** The value after "key:" (rest is what follows on the same line; the line has been consumed). */
  parseValue(rest, indent, lineNo) {
    const clean = this.withoutComment(rest);
    if (clean === '') {
      this.skipBlank();
      const next = this.lines[this.pos];
      if (next && next.indent > indent) return this.parseNode(indent);
      if (next && next.indent === indent && this.isSeqEntry(next.text)) return this.parseSequence(indent); // a list may sit at the key's own indent
      return null;
    }
    // put the value back as a line of its own and parse it as a node
    this.pos--;
    const line = this.lines[this.pos];
    this.lines[this.pos] = { ...line, indent: indent + 1, text: rest, n: lineNo, inline: true };
    return this.parseInline(rest, indent, indent + 1);
  }

  withoutComment(text) {
    if (text.startsWith('#')) return '';
    return text;
  }

  // ---- inline values: properties, scalars, flow collections, block scalars ----
  parseInline(text, parentIndent, indent) {
    let anchor = null;
    let tag = null;
    let rest = text;
    const startLine = this.pos;
    // properties (&anchor and !tag) in front of the value
    for (;;) {
      const m = /^([&!])(\S*)[ \t]*/.exec(rest);
      if (!m) break;
      if (m[1] === '&') {
        if (m[2] === '') this.fail('an anchor needs a name, for example &base');
        anchor = m[2];
      } else {
        tag = m[2];
        if (!['!str', '!int', '!float', '!bool', '!null', '!seq', '!map'].includes(tag)) {
          this.fail(`the tag !${tag} is not supported (only !!str, !!int, !!float, !!bool and !!null are)`);
        }
      }
      rest = rest.slice(m[0].length);
    }
    let value;
    if (rest === '' || rest.startsWith('#')) {
      // properties on their own line apply to the node on the following lines
      this.pos = startLine + 1;
      this.skipBlank();
      const next = this.lines[this.pos];
      value = next && next.indent > parentIndent ? this.parseNode(parentIndent) : null;
    } else if (rest[0] === '*') {
      const m = /^\*(\S+)[ \t]*(#.*)?$/.exec(rest);
      if (!m) this.fail(`could not read the alias "${rest.slice(0, 30)}"`);
      if (!this.anchors.has(m[1])) this.fail(`the alias *${m[1]} refers to an anchor (&${m[1]}) that has not been defined above it`);
      value = clone(this.anchors.get(m[1]));
      this.pos = startLine + 1;
    } else if (rest[0] === '|' || rest[0] === '>') {
      value = this.blockScalar(rest, parentIndent);
    } else if (rest[0] === '[' || rest[0] === '{') {
      value = this.flowFromLines(rest, startLine);
    } else if (rest[0] === '"' || rest[0] === "'") {
      value = this.quotedFromLines(rest, startLine);
    } else {
      value = this.plainFromLines(rest, startLine, parentIndent);
    }
    if (anchor) this.anchors.set(anchor, clone(value));
    return this.applyTag(tag, value);
  }

  applyTag(tag, value) {
    if (tag === null) return value;
    const text = typeof value === 'string' ? value : value === null ? '' : String(value);
    switch (tag) {
      case '!str': return value === null ? '' : String(value);
      case '!int': {
        if (!/^[-+]?\d+$/.test(text)) this.fail(`"${text}" is not an integer`);
        return Number(text);
      }
      case '!float': {
        const n = Number(text);
        if (text.trim() === '' || Number.isNaN(n)) this.fail(`"${text}" is not a number`);
        return n;
      }
      case '!bool':
        if (!/^(true|false)$/i.test(text)) this.fail(`"${text}" is not true or false`);
        return text.toLowerCase() === 'true';
      case '!null': return null;
      default: return value;
    }
  }

  // ---- plain scalars (may continue on following, more indented lines) ----
  plainFromLines(first, startLine, parentIndent) {
    let text = this.cutComment(first);
    let breaks = 0;
    let p = startLine + 1;
    while (p < this.lines.length) {
      const line = this.lines[p];
      if (line.text === '') {
        breaks++;
        p++;
        continue;
      }
      if (line.text.startsWith('#')) break; // a comment ends a plain scalar
      if (line.indent <= parentIndent) break;
      if (this.splitKey(line.text)) this.fail('a mapping entry cannot start here (a value on the previous line may be missing its quotes)', line.n);
      const piece = this.cutComment(line.text);
      text += breaks ? '\n'.repeat(breaks) : ' ';
      text += piece;
      breaks = 0;
      p++;
      if (piece !== line.text) break; // a trailing comment ends the scalar
    }
    this.pos = p;
    return resolvePlain(text, (m) => this.warn(m));
  }

  cutComment(text) {
    const m = / #/.exec(text);
    return (m ? text.slice(0, m.index) : text).trimEnd();
  }

  // ---- quoted scalars (may span lines) ----
  /**
   * Reads a quoted scalar that starts at text[at] (text may contain line breaks).
   * Returns {value, end}, or {needsMore: true} if the closing quote has not been reached.
   * Line breaks fold as YAML says: one break becomes a space, blank lines become line breaks,
   * whitespace around a break is dropped, and a backslash at the end of a line joins the lines.
   */
  readQuotedFrom(text, at) {
    const quote = text[at];
    const n = text.length;
    let i = at + 1;
    let out = '';
    let keep = 0; // characters of `out` that came from escapes and must not be trimmed
    while (i < n) {
      const c = text[i];
      if (c === '\n') {
        let end = out.length;
        while (end > keep && (out[end - 1] === ' ' || out[end - 1] === '\t')) end--;
        out = out.slice(0, end);
        let breaks = 0;
        while (i < n && (text[i] === '\n' || text[i] === ' ' || text[i] === '\t')) {
          if (text[i] === '\n') breaks++;
          i++;
        }
        out += breaks > 1 ? '\n'.repeat(breaks - 1) : ' ';
        continue;
      }
      if (quote === "'") {
        if (c === "'") {
          if (text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          return { value: out, end: i + 1 };
        }
        out += c;
        i++;
        continue;
      }
      if (c === '"') return { value: out, end: i + 1 };
      if (c === '\\') {
        const e = text[i + 1];
        if (e === undefined) return { needsMore: true };
        if (e === '\n') {
          i += 2;
          while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
          continue;
        }
        if (e === 'x' || e === 'u' || e === 'U') {
          const len = e === 'x' ? 2 : e === 'u' ? 4 : 8;
          const digits = text.slice(i + 2, i + 2 + len);
          if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(digits)) this.fail(`\\${e} must be followed by ${len} hexadecimal digits`);
          out += String.fromCodePoint(parseInt(digits, 16));
          i += 2 + len;
          keep = out.length;
          continue;
        }
        if (!hasOwn(SIMPLE_ESCAPES, e)) this.fail(`unknown escape sequence "\\${e}" in a double-quoted string`);
        out += SIMPLE_ESCAPES[e];
        i += 2;
        keep = out.length;
        continue;
      }
      out += c;
      i++;
    }
    return { needsMore: true };
  }

  quotedFromLines(first, startLine) {
    let text = first;
    let p = startLine;
    for (;;) {
      const r = this.readQuotedFrom(text, 0);
      if (!r.needsMore) {
        const after = text.slice(r.end).trim();
        if (after !== '' && !after.startsWith('#')) this.fail(`unexpected "${after.slice(0, 20)}" after the closing quote`, this.lines[p].n);
        this.pos = p + 1;
        return r.value;
      }
      p++;
      if (p >= this.lines.length) this.fail(`the ${first[0] === '"' ? 'double' : 'single'}-quoted string that starts here is never closed`, this.lines[startLine].n);
      text += `\n${this.lines[p].text}`;
    }
  }

  // ---- flow collections ----
  flowFromLines(first, startLine) {
    // gather lines until the brackets balance
    let text = first;
    let p = startLine;
    const balance = (s) => {
      let depth = 0;
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '"' || c === "'") {
          const before = s[i - 1];
          if (i === 0 || /[\s,[\]{}:]/.test(before)) {
            const r = this.readQuotedFrom(s, i);
            if (r.needsMore) return { depth: depth + 1000, open: true }; // quote still open: need another line
            i = r.end;
            continue;
          }
        } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
          const nl = s.indexOf('\n', i);
          i = nl < 0 ? s.length : nl;
          continue;
        } else if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') depth--;
        i++;
      }
      return { depth, open: false };
    };
    for (;;) {
      const b = balance(text);
      if (b.depth <= 0 && !b.open) break;
      p++;
      if (p >= this.lines.length) this.fail('the [ or { that starts here is never closed', this.lines[startLine].n);
      text += `\n${this.lines[p].text}`;
    }
    this.pos = p + 1;
    const flow = new FlowParser(text, this, this.lines[startLine].n);
    const value = flow.parseDocumentValue();
    return value;
  }

  // ---- block scalars ----
  blockScalar(header, parentIndent) {
    const m = /^([|>])([-+]?)([1-9]?)([-+]?)[ \t]*(#.*)?$/.exec(header);
    if (!m) this.fail(`could not read the block scalar header "${header.slice(0, 20)}"`);
    const folded = m[1] === '>';
    const chomp = m[2] || m[4] || 'clip';
    const explicit = m[3] ? Number(m[3]) : null;
    const startLine = this.pos;
    let p = startLine + 1;
    const contentLines = [];
    let contentIndent = explicit === null ? null : Math.max(parentIndent, 0) + explicit;
    if (explicit !== null && parentIndent < 0) contentIndent = explicit;
    while (p < this.lines.length) {
      const line = this.lines[p];
      const isBlank = line.raw.trim() === '';
      if (isBlank) {
        contentLines.push({ blank: true, raw: line.raw });
        p++;
        continue;
      }
      if (contentIndent === null) {
        if (line.indent <= parentIndent) break;
        contentIndent = line.indent;
      }
      if (line.indent < contentIndent) break;
      contentLines.push({ blank: false, raw: line.raw.slice(contentIndent) });
      p++;
    }
    // trailing blank lines belong to the chomping rule, and must not swallow lines that follow
    let trailing = 0;
    while (contentLines.length && contentLines[contentLines.length - 1].blank) {
      contentLines.pop();
      trailing++;
    }
    this.pos = p;
    const lines = contentLines.map((l) => (l.blank ? l.raw.slice(Math.min(contentIndent ?? 0, l.raw.length)) : l.raw));
    let body;
    if (!folded) body = lines.join('\n');
    else {
      const isMore = (s) => /^[ \t]/.test(s);
      let out = '';
      let prev = null;
      let pending = 0;
      for (const l of lines) {
        if (l === '') {
          pending++;
          continue;
        }
        if (prev === null) out = '\n'.repeat(pending) + l;
        else {
          const special = isMore(prev) || isMore(l);
          out += pending === 0 ? (special ? '\n' : ' ') : '\n'.repeat(pending + (special ? 1 : 0));
          out += l;
        }
        pending = 0;
        prev = l;
      }
      body = out;
    }
    if (chomp === 'clip') return body === '' ? '' : `${body}\n`;
    if (chomp === '-') return body;
    return body === '' && lines.length === 0 ? '\n'.repeat(trailing) : `${body}${'\n'.repeat(1 + trailing)}`;
  }
}

// ---- flow-style text: [a, b, {c: d}] ------------------------------------------------------------------------

class FlowParser {
  constructor(text, owner, line) {
    this.s = text;
    this.i = 0;
    this.owner = owner;
    this.line = line;
  }

  fail(message) {
    throw new YamlError(message, this.line);
  }

  ws() {
    for (;;) {
      while (/\s/.test(this.s[this.i] ?? 'x')) this.i++;
      if (this.s[this.i] === '#' && (this.i === 0 || /\s/.test(this.s[this.i - 1]))) {
        const nl = this.s.indexOf('\n', this.i);
        this.i = nl < 0 ? this.s.length : nl;
        continue;
      }
      break;
    }
  }

  parseDocumentValue() {
    this.ws();
    const v = this.value();
    this.ws();
    if (this.i < this.s.length) this.fail(`unexpected "${this.s.slice(this.i, this.i + 20)}" after the end of the flow collection`);
    return v;
  }

  value() {
    this.ws();
    let anchor = null;
    let m;
    while ((m = /^&(\S+?)(?=[\s,\]}]|$)\s*/.exec(this.s.slice(this.i)))) {
      anchor = m[1];
      this.i += m[0].length;
    }
    const c = this.s[this.i];
    let v;
    if (c === '[') v = this.seq();
    else if (c === '{') v = this.map();
    else if (c === '"' || c === "'") v = this.quoted();
    else if (c === '*') {
      const a = /^\*([^\s,\]}]+)/.exec(this.s.slice(this.i));
      if (!a) this.fail('could not read the alias');
      if (!this.owner.anchors.has(a[1])) this.fail(`the alias *${a[1]} refers to an anchor (&${a[1]}) that has not been defined above it`);
      this.i += a[0].length;
      v = clone(this.owner.anchors.get(a[1]));
    } else if (c === '!') this.fail('tags inside [ ] and { } are not supported');
    else v = this.plain();
    if (anchor) this.owner.anchors.set(anchor, clone(v));
    return v;
  }

  quoted() {
    const r = this.owner.readQuotedFrom(this.s, this.i);
    if (r.needsMore) this.fail('a quoted string inside [ ] or { } is never closed');
    this.i = r.end;
    return r.value;
  }

  plain() {
    const start = this.i;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === ',' || c === ']' || c === '}' || c === '[' || c === '{') break;
      if (c === ':' && (this.i + 1 >= this.s.length || /[\s,\]}]/.test(this.s[this.i + 1]))) break;
      if (c === '#' && /\s/.test(this.s[this.i - 1] ?? ' ')) break;
      this.i++;
    }
    const text = this.s.slice(start, this.i).replace(/\s+/g, ' ').trim();
    return resolvePlain(text, (m) => this.owner.warn(m));
  }

  seq() {
    this.i++; // [
    const out = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') {
        this.i++;
        return out;
      }
      if (this.i >= this.s.length) this.fail('the [ is never closed');
      const first = this.value();
      this.ws();
      if (this.s[this.i] === ':') {
        this.i++;
        const second = this.keyedValue();
        out.push({ [String(first)]: second });
      } else out.push(first);
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== ']') this.fail(`expected "," or "]" but found "${this.s.slice(this.i, this.i + 10)}"`);
    }
  }

  keyedValue() {
    this.ws();
    if ([',', ']', '}'].includes(this.s[this.i])) return null;
    return this.value();
  }

  map() {
    this.i++; // {
    const out = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') {
        this.i++;
        return out;
      }
      if (this.i >= this.s.length) this.fail('the { is never closed');
      if (this.s[this.i] === '?' && /\s/.test(this.s[this.i + 1] ?? ' ')) {
        this.i++; // an explicit key marker: "{? key : value}"
        this.ws();
      }
      const key = this.value();
      this.ws();
      let val = null;
      if (this.s[this.i] === ':') {
        this.i++;
        val = this.keyedValue();
      }
      const name = String(key ?? 'null');
      if (hasOwn(out, name)) this.fail(`the key "${name}" appears twice in the same mapping`);
      out[name] = val;
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== '}') this.fail(`expected "," or "}" but found "${this.s.slice(this.i, this.i + 10)}"`);
    }
  }
}

/**
 * Reads YAML text.
 * @returns {{documents: any[], warnings: string[]}} one entry in `documents` per YAML document
 */
export function parseYaml(text) {
  const parser = new Parser(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const documents = parser.parseAll();
  return { documents, warnings: parser.warnings };
}

// ---- writing YAML -----------------------------------------------------------------------------------------------

const YAML11_WORDS = /^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF|true|True|TRUE|false|False|FALSE|null|Null|NULL|~|<<|=)$/;

/** True if the text can be written without quotes and will still read back as the same string by YAML 1.1 and 1.2 readers. */
function plainSafe(s) {
  if (s === '' || s !== s.trim()) return false;
  if (YAML11_WORDS.test(s)) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/^[-?:][^\s]/.test(s)) return false;
  if (/^[-?:]$/.test(s) || /^---|^\.\.\./.test(s)) return false;
  if (/: |:$| #|\t|[\n\r]/.test(s)) return false;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029﻿]/.test(s)) return false;
  if (/^[-+]?(\.?[0-9])/.test(s) || /^[-+]?\.(inf|Inf|INF|nan|NaN|NAN)$/.test(s) || /^0[ox]/.test(s)) return false; // numbers and number-like text
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s) || /^\d+(:\d+)+(\.\d*)?$/.test(s)) return false; // dates and sexagesimal numbers (YAML 1.1)
  if (/^[0-9_,.]+$/.test(s)) return false;
  return true;
}

function scalarText(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new YamlError('Infinity and NaN cannot be written to YAML from JSON.');
    if (Object.is(v, -0)) return '-0.0';
    const text = String(v);
    // 1e+21 is a number in YAML 1.2 but text in YAML 1.1 readers; 1.0e+21 is a number in both
    return /e/.test(text) && !/\./.test(text) ? text.replace('e', '.0e') : text;
  }
  return plainSafe(v) ? v : JSON.stringify(v);
}

/** A multi-line string that a literal block (|) can hold exactly, as opposed to quoted text. */
function literalBlockOk(s) {
  if (!s.includes('\n')) return false;
  if (/^[ \t\n]/.test(s)) return false; // leading space or blank line would need an indentation indicator
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff]/.test(s)) return false; // control characters and \r
  const body = s.endsWith('\n') ? s.slice(0, -1) : s;
  return !body.split('\n').some((line) => line !== '' && line.trim() === ''); // lines of only spaces are ambiguous
}

/** The header ("|", "|-" or "|+") and the content lines of a literal block, not yet indented. */
function literalBlock(s) {
  const header = !s.endsWith('\n') ? '|-' : s.endsWith('\n\n') ? '|+' : '|';
  const body = s.endsWith('\n') ? s.slice(0, -1) : s;
  return { header, lines: body.split('\n') };
}

/**
 * Writes a JSON value as block-style YAML (always ending with a line break).
 * @param {{indent?: number, literalBlocks?: boolean}} options indent is the step for nested mappings (1 to 8)
 */
export function stringifyYaml(value, { indent = 2, literalBlocks = true } = {}) {
  if (!Number.isInteger(indent) || indent < 1 || indent > 8) throw new RangeError('The indentation must be a whole number from 1 to 8.');
  const key = (k) => (plainSafe(k) ? k : JSON.stringify(k));
  const isCollection = (v) => v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
  const emptyText = (v) => (Array.isArray(v) ? '[]' : '{}');

  /** Lines for a non-empty array or object, written at `level` spaces of indentation. */
  const block = (v, level) => {
    const pad = ' '.repeat(level);
    const lines = [];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (isCollection(item)) {
          // compact form: the first line of the nested collection sits right after "- "
          const child = block(item, level + 2);
          lines.push(`${pad}- ${child[0].slice(level + 2)}`, ...child.slice(1));
        } else if (item !== null && typeof item === 'object') lines.push(`${pad}- ${emptyText(item)}`);
        else if (typeof item === 'string' && literalBlocks && literalBlockOk(item)) {
          const { header, lines: body } = literalBlock(item);
          lines.push(`${pad}- ${header}`, ...body.map((l) => (l === '' ? '' : `${' '.repeat(level + 2)}${l}`)));
        } else lines.push(`${pad}- ${scalarText(item)}`);
      }
      return lines;
    }
    for (const k of Object.keys(v)) {
      const item = v[k];
      if (isCollection(item)) lines.push(`${pad}${key(k)}:`, ...block(item, level + indent));
      else if (item !== null && typeof item === 'object') lines.push(`${pad}${key(k)}: ${emptyText(item)}`);
      else if (typeof item === 'string' && literalBlocks && literalBlockOk(item)) {
        const { header, lines: body } = literalBlock(item);
        lines.push(`${pad}${key(k)}: ${header}`, ...body.map((l) => (l === '' ? '' : `${' '.repeat(level + indent)}${l}`)));
      } else lines.push(`${pad}${key(k)}: ${scalarText(item)}`);
    }
    return lines;
  };

  const lines = isCollection(value) ? block(value, 0) : [value !== null && typeof value === 'object' ? emptyText(value) : scalarText(value)];
  return `${lines.join('\n')}\n`;
}
