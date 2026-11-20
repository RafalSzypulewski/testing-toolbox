// JSONPath as standardised in RFC 9535: names, indexes, wildcards, slices, unions,
// descendant segments ("..") and filter expressions with comparisons, && || !, existence
// tests and the functions length(), count(), match(), search() and value().
// No DOM access.
//
// Differences from the RFC worth knowing:
//  * match() and search() use JavaScript regular expressions (with the u flag) instead of
//    I-Regexp, so a few exotic patterns behave differently.
//  * Members of a JSON object are visited in the order JavaScript keeps them, which puts
//    integer-like keys ("1", "42") first. The RFC does not require a particular order.

export class JsonPathError extends SyntaxError {
  constructor(message, position = null) {
    super(position === null ? message : `${message} (at character ${position + 1})`);
    this.position = position;
  }
}

const MAX_SAFE = 9007199254740991;
const NOTHING = Symbol('nothing'); // the "no value" result of an empty singular query

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---- the parser -----------------------------------------------------------------------------------

const FUNCTIONS = {
  length: { params: ['value'], result: 'value' },
  count: { params: ['nodes'], result: 'value' },
  match: { params: ['value', 'value'], result: 'logical' },
  search: { params: ['value', 'value'], result: 'logical' },
  value: { params: ['nodes'], result: 'value' },
};

const isNameFirst = (c) => c !== undefined && (/[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80);
const isNameChar = (c) => c !== undefined && (/[A-Za-z0-9_]/.test(c) || c.charCodeAt(0) >= 0x80);
const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

class Parser {
  constructor(source) {
    this.s = source;
    this.i = 0;
  }

  fail(message, position = this.i) {
    throw new JsonPathError(message, position);
  }

  peek(offset = 0) {
    return this.s[this.i + offset];
  }

  ws() {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n' || this.peek() === '\r') this.i++;
  }

  expect(text, what = `"${text}"`) {
    if (!this.s.startsWith(text, this.i)) this.fail(`expected ${what}`);
    this.i += text.length;
  }

  describeHere() {
    return this.i >= this.s.length ? 'the end of the query' : `"${this.peek()}"`;
  }

  parseQuery() {
    if (this.peek() !== '$') this.fail('a JSONPath query must start with $');
    this.i++;
    const query = { root: '$', segments: this.segments() };
    if (this.i < this.s.length) {
      if (this.s.slice(this.i).trim() === '') this.fail('a query must not end with whitespace');
      this.ws();
      this.fail(`unexpected ${this.describeHere()}`);
    }
    return query;
  }

  // zero or more segments; whitespace is only consumed if a segment follows
  segments() {
    const out = [];
    for (;;) {
      let j = this.i;
      while (' \t\n\r'.includes(this.s[j] ?? 'x')) j++;
      if (this.s[j] !== '.' && this.s[j] !== '[') break;
      this.i = j;
      out.push(this.segment());
    }
    return out;
  }

  segment() {
    if (this.s.startsWith('..', this.i)) {
      this.i += 2;
      if (this.peek() === '[') return { type: 'descendant', selectors: this.bracketed() };
      if (this.peek() === '*') {
        this.i++;
        return { type: 'descendant', selectors: [{ type: 'wildcard' }] };
      }
      if (isNameFirst(this.peek())) return { type: 'descendant', selectors: [{ type: 'name', name: this.shorthand() }] };
      return this.fail(`expected a name, * or [ after ".." but found ${this.describeHere()}`);
    }
    if (this.peek() === '.') {
      this.i++;
      if (this.peek() === '*') {
        this.i++;
        return { type: 'child', selectors: [{ type: 'wildcard' }] };
      }
      if (isNameFirst(this.peek())) return { type: 'child', selectors: [{ type: 'name', name: this.shorthand() }] };
      return this.fail(`expected a name or * after "." but found ${this.describeHere()}`);
    }
    return { type: 'child', selectors: this.bracketed() };
  }

  shorthand() {
    const start = this.i;
    while (isNameChar(this.peek())) this.i++;
    return this.s.slice(start, this.i);
  }

  bracketed() {
    this.expect('[');
    const selectors = [];
    for (;;) {
      this.ws();
      selectors.push(this.selector());
      this.ws();
      if (this.peek() === ',') {
        this.i++;
        continue;
      }
      if (this.peek() === ']') {
        this.i++;
        return selectors;
      }
      this.fail(`expected "," or "]" but found ${this.describeHere()}`);
    }
  }

  selector() {
    const c = this.peek();
    if (c === "'" || c === '"') return { type: 'name', name: this.string() };
    if (c === '*') {
      this.i++;
      return { type: 'wildcard' };
    }
    if (c === '?') {
      this.i++;
      this.ws();
      return { type: 'filter', expr: this.logicalOr() };
    }
    if (c === '-' || c === ':' || isDigit(c)) return this.indexOrSlice();
    return this.fail(`expected a selector (a name in quotes, an index, *, a slice or ?filter) but found ${this.describeHere()}`);
  }

  int() {
    const start = this.i;
    if (this.peek() === '-') this.i++;
    if (!isDigit(this.peek())) this.fail('expected a number', start);
    const digits = this.i;
    while (isDigit(this.peek())) this.i++;
    const text = this.s.slice(start, this.i);
    if (this.s[digits] === '0' && this.i - digits > 1) this.fail('numbers must not have leading zeros', start);
    if (text === '-0') this.fail('"-0" is not a valid index', start);
    const n = Number(text);
    if (Math.abs(n) > MAX_SAFE) this.fail('number is too large to be an index', start);
    return n;
  }

  indexOrSlice() {
    let start = null;
    if (this.peek() !== ':') start = this.int();
    this.ws();
    if (this.peek() !== ':') {
      if (start === null) this.fail('expected an index or a slice');
      return { type: 'index', index: start };
    }
    this.i++;
    this.ws();
    let end = null;
    let step = null;
    if (this.peek() === '-' || isDigit(this.peek())) end = this.int();
    this.ws();
    if (this.peek() === ':') {
      this.i++;
      this.ws();
      if (this.peek() === '-' || isDigit(this.peek())) step = this.int();
    }
    return { type: 'slice', start, end, step };
  }

  string() {
    const quote = this.peek();
    const open = this.i;
    this.i++;
    let out = '';
    for (;;) {
      const c = this.peek();
      if (c === undefined) this.fail('the quoted string is missing its closing quote', open);
      if (c === quote) {
        this.i++;
        return out;
      }
      if (c === '\\') {
        this.i++;
        const e = this.peek();
        const simple = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '/': '/', '\\': '\\' };
        if (e === quote) out += quote;
        else if (e in simple && e !== undefined) out += simple[e];
        else if (e === 'u') {
          const code = this.hex4();
          if (code >= 0xd800 && code <= 0xdbff) {
            if (!(this.s[this.i] === '\\' && this.s[this.i + 1] === 'u')) this.fail('a high surrogate must be followed by a low surrogate escape');
            this.i += 1; // onto the "u"
            const low = this.hex4();
            if (low < 0xdc00 || low > 0xdfff) this.fail('invalid surrogate pair');
            out += String.fromCharCode(code, low);
          } else if (code >= 0xdc00 && code <= 0xdfff) {
            this.fail('unpaired low surrogate');
          } else out += String.fromCharCode(code);
          continue;
        } else this.fail(`invalid escape "\\${e ?? ''}"`, this.i - 1);
        this.i++;
        continue;
      }
      if (c.charCodeAt(0) < 0x20) this.fail('control characters must be escaped in strings');
      out += c;
      this.i++;
    }
  }

  hex4() {
    const digits = this.s.slice(this.i + 1, this.i + 5);
    if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.fail('\\u must be followed by four hexadecimal digits');
    this.i += 4; // leaves the cursor on the last digit; callers advance past it
    const code = parseInt(digits, 16);
    this.i++;
    return code;
  }

  // ---- filter expressions ----
  logicalOr() {
    const operands = [this.logicalAnd()];
    for (;;) {
      this.ws();
      if (!this.s.startsWith('||', this.i)) break;
      this.i += 2;
      this.ws();
      operands.push(this.logicalAnd());
    }
    return operands.length === 1 ? operands[0] : { type: 'or', operands };
  }

  logicalAnd() {
    const operands = [this.basic()];
    for (;;) {
      this.ws();
      if (!this.s.startsWith('&&', this.i)) break;
      this.i += 2;
      this.ws();
      operands.push(this.basic());
    }
    return operands.length === 1 ? operands[0] : { type: 'and', operands };
  }

  comparisonOp() {
    this.ws();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (this.s.startsWith(op, this.i)) {
        this.i += op.length;
        this.ws();
        return op;
      }
    }
    if (this.peek() === '=') this.fail('use == to compare (a single = is not an operator)');
    return null;
  }

  basic() {
    this.ws();
    if (this.peek() === '!') {
      this.i++;
      this.ws();
      const operand = this.peek() === '(' ? this.paren() : this.testExpr();
      if (['==', '!=', '<', '>'].some((op) => this.s.startsWith(op, (this.ws(), this.i)))) {
        this.fail('"!" can only negate a parenthesised expression or an existence test; put the comparison in parentheses');
      }
      return { type: 'not', operand };
    }
    if (this.peek() === '(') return this.paren();

    const first = this.comparable();
    const op = this.comparisonOp();
    if (op) {
      const right = this.comparable();
      for (const side of [first, right]) {
        if (side.kind === 'query' && !side.query.singular) this.fail('a query used in a comparison must select at most one node (use only names and indexes, no *, .., slices, filters or unions)');
        if (side.kind === 'function' && FUNCTIONS[side.name].result !== 'value') this.fail(`${side.name}() returns true or false, so it cannot be compared`);
      }
      return { type: 'cmp', op, left: first, right };
    }
    if (first.kind === 'literal') this.fail('a literal on its own is not a condition; compare it with something');
    return this.toTest(first);
  }

  paren() {
    this.expect('(');
    this.ws();
    const inner = this.logicalOr();
    this.ws();
    this.expect(')', '")" to close the parenthesis');
    return inner;
  }

  testExpr() {
    const c = this.comparable();
    if (c.kind === 'literal') this.fail('a literal on its own is not a condition');
    return this.toTest(c);
  }

  toTest(c) {
    if (c.kind === 'function') {
      if (FUNCTIONS[c.name].result !== 'logical') {
        this.fail(`${c.name}() returns a value, so it must be compared with something, for example ${c.name}(@.x) > 3`);
      }
      return { type: 'test', function: c };
    }
    return { type: 'test', query: c.query };
  }

  comparable() {
    this.ws();
    const c = this.peek();
    if (c === '@' || c === '$') {
      const start = this.i;
      this.i++;
      const segments = this.segments();
      const singular = segments.every((seg) => seg.type === 'child' && seg.selectors.length === 1 && ['name', 'index'].includes(seg.selectors[0].type));
      return { kind: 'query', query: { root: c, segments, singular, source: this.s.slice(start, this.i) } };
    }
    if (c === "'" || c === '"') return { kind: 'literal', value: this.string() };
    if (c === '-' || isDigit(c)) return { kind: 'literal', value: this.number() };
    if (isNameFirst(c) && /[a-z]/.test(c)) {
      const start = this.i;
      while (/[a-z0-9_]/.test(this.peek() ?? '')) this.i++;
      const name = this.s.slice(start, this.i);
      if (this.peek() === '(') return this.functionCall(name, start);
      if (!isNameChar(this.peek())) {
        if (name === 'true') return { kind: 'literal', value: true };
        if (name === 'false') return { kind: 'literal', value: false };
        if (name === 'null') return { kind: 'literal', value: null };
      }
      return this.fail(`unknown word "${name}"; names of fields must be written like @.${name}`, start);
    }
    return this.fail(`expected @, $, a literal or a function but found ${this.describeHere()}`);
  }

  number() {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.s.slice(this.i));
    if (!m) this.fail('expected a number');
    this.i += m[0].length;
    return Number(m[0]);
  }

  functionCall(name, start) {
    const signature = FUNCTIONS[name];
    if (!signature) this.fail(`unknown function ${name}(); available: ${Object.keys(FUNCTIONS).map((f) => `${f}()`).join(', ')}`, start);
    this.expect('(');
    const args = [];
    this.ws();
    if (this.peek() !== ')') {
      for (;;) {
        this.ws();
        args.push(this.comparable());
        this.ws();
        if (this.peek() === ',') {
          this.i++;
          continue;
        }
        break;
      }
    }
    this.expect(')', '")" to close the function call');
    if (args.length !== signature.params.length) {
      this.fail(`${name}() takes ${signature.params.length} argument${signature.params.length === 1 ? '' : 's'} but ${args.length} ${args.length === 1 ? 'was' : 'were'} given`, start);
    }
    args.forEach((arg, k) => {
      const wanted = signature.params[k];
      if (wanted === 'nodes' && arg.kind !== 'query') this.fail(`argument ${k + 1} of ${name}() must be a query such as @.items`, start);
      if (wanted === 'value') {
        if (arg.kind === 'query' && !arg.query.singular) this.fail(`argument ${k + 1} of ${name}() must select a single value (no *, .., slices, filters or unions)`, start);
        if (arg.kind === 'function' && FUNCTIONS[arg.name].result !== 'value') this.fail(`argument ${k + 1} of ${name}() cannot be a true/false function`, start);
      }
    });
    return { kind: 'function', name, args };
  }
}

/** Parses a query. Throws JsonPathError with the character position of the problem. */
export function parse(source) {
  if (typeof source !== 'string') throw new JsonPathError('The query must be text');
  return new Parser(source).parseQuery();
}

// ---- evaluation ---------------------------------------------------------------------------------------

const childrenOf = (node) => {
  const { value, path } = node;
  if (Array.isArray(value)) return value.map((v, i) => ({ value: v, path: [...path, i] }));
  if (isObject(value)) return Object.keys(value).map((k) => ({ value: value[k], path: [...path, k] }));
  return [];
};

function* descendantsOrSelf(node) {
  yield node;
  for (const child of childrenOf(node)) yield* descendantsOrSelf(child);
}

function sliceIndexes(start, end, step, length) {
  const s = step ?? 1;
  if (s === 0) return [];
  const norm = (i) => (i >= 0 ? i : length + i);
  const from = start ?? (s >= 0 ? 0 : length - 1);
  const to = end ?? (s >= 0 ? length : -length - 1);
  const nFrom = norm(from);
  const nTo = norm(to);
  const out = [];
  if (s > 0) {
    const lower = Math.min(Math.max(nFrom, 0), length);
    const upper = Math.min(Math.max(nTo, 0), length);
    for (let i = lower; i < upper; i += s) out.push(i);
  } else {
    const upper = Math.min(Math.max(nFrom, -1), length - 1);
    const lower = Math.min(Math.max(nTo, -1), length - 1);
    for (let i = upper; lower < i; i += s) out.push(i);
  }
  return out;
}

const deepEqual = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
};

const lessThan = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a < b;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = Array.from(a);
    const y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = x[i].codePointAt(0) - y[i].codePointAt(0);
      if (d !== 0) return d < 0;
    }
    return x.length < y.length;
  }
  return false;
};

function compare(op, a, b) {
  const equal = a === NOTHING || b === NOTHING ? a === b : deepEqual(a, b);
  switch (op) {
    case '==': return equal;
    case '!=': return !equal;
    case '<': return a !== NOTHING && b !== NOTHING && lessThan(a, b);
    case '>': return a !== NOTHING && b !== NOTHING && lessThan(b, a);
    case '<=': return (a !== NOTHING && b !== NOTHING && lessThan(a, b)) || equal;
    default: return (a !== NOTHING && b !== NOTHING && lessThan(b, a)) || equal; // >=
  }
}

function runQuery(query, root, current) {
  let nodes = [query.root === '$' ? { value: root, path: [] } : current];
  for (const segment of query.segments) {
    const out = [];
    for (const node of nodes) {
      const targets = segment.type === 'child' ? [node] : descendantsOrSelf(node);
      for (const target of targets) for (const selector of segment.selectors) out.push(...select(selector, target, root));
    }
    nodes = out;
  }
  return nodes;
}

function select(selector, node, root) {
  const { value, path } = node;
  switch (selector.type) {
    case 'name':
      return isObject(value) && hasOwn(value, selector.name) ? [{ value: value[selector.name], path: [...path, selector.name] }] : [];
    case 'index': {
      if (!Array.isArray(value)) return [];
      const i = selector.index >= 0 ? selector.index : value.length + selector.index;
      return i >= 0 && i < value.length ? [{ value: value[i], path: [...path, i] }] : [];
    }
    case 'wildcard':
      return childrenOf(node);
    case 'slice':
      return Array.isArray(value) ? sliceIndexes(selector.start, selector.end, selector.step, value.length).map((i) => ({ value: value[i], path: [...path, i] })) : [];
    default: // filter
      return childrenOf(node).filter((child) => truth(selector.expr, root, child));
  }
}

function comparableValue(c, root, current) {
  if (c.kind === 'literal') return c.value;
  if (c.kind === 'query') {
    const nodes = runQuery(c.query, root, current);
    return nodes.length === 1 ? nodes[0].value : NOTHING;
  }
  return callFunction(c, root, current);
}

function callFunction(call, root, current) {
  const arg = (k) => {
    const a = call.args[k];
    return a.kind === 'query' && FUNCTIONS[call.name].params[k] === 'nodes' ? runQuery(a.query, root, current) : comparableValue(a, root, current);
  };
  switch (call.name) {
    case 'length': {
      const v = arg(0);
      if (typeof v === 'string') return Array.from(v).length;
      if (Array.isArray(v)) return v.length;
      return isObject(v) ? Object.keys(v).length : NOTHING;
    }
    case 'count':
      return arg(0).length;
    case 'value': {
      const nodes = arg(0);
      return nodes.length === 1 ? nodes[0].value : NOTHING;
    }
    default: { // match, search
      const [text, pattern] = [arg(0), arg(1)];
      if (typeof text !== 'string' || typeof pattern !== 'string') return false;
      try {
        return new RegExp(call.name === 'match' ? `^(?:${pattern})$` : pattern, 'u').test(text);
      } catch {
        return false;
      }
    }
  }
}

function truth(expr, root, current) {
  switch (expr.type) {
    case 'or': return expr.operands.some((e) => truth(e, root, current));
    case 'and': return expr.operands.every((e) => truth(e, root, current));
    case 'not': return !truth(expr.operand, root, current);
    case 'cmp': return compare(expr.op, comparableValue(expr.left, root, current), comparableValue(expr.right, root, current));
    default: // test
      return expr.function ? callFunction(expr.function, root, current) : runQuery(expr.query, root, current).length > 0;
  }
}

// ---- results -----------------------------------------------------------------------------------------------

const ESCAPES = { '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t', "'": "\\'", '\\': '\\\\' };

/** Normalized path (RFC 9535 section 2.7), e.g. $['store']['book'][0]['title'] */
export function normalizedPath(path) {
  return `$${path.map((p) => (typeof p === 'number'
    ? `[${p}]`
    : `['${p.replace(/[\b\f\n\r\t'\\\u0000-\u001f]/g, (c) => ESCAPES[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}']`)).join('')}`;
}

/**
 * Runs a query against a parsed JSON value.
 * @returns {{path: (string|number)[], pathText: string, value: any}[]} matches in result order
 */
export function query(document, source) {
  const ast = parse(source);
  return runQuery(ast, document, null).map((n) => ({ path: n.path, pathText: normalizedPath(n.path), value: n.value }));
}
