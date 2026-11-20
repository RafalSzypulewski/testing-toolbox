// Pairwise (all-pairs) and higher-strength combinatorial test design. No DOM access.
//
// Given parameters and their values, `generate` returns a small set of test cases in which
// every combination of `strength` values (2 = every pair) from different parameters appears
// at least once. Impossible combinations can be forbidden, and values marked invalid are
// tested one at a time, each in a case where every other value is valid.
//
// The search is a seeded greedy algorithm (like AETG): deterministic for a given seed, so the
// same input always gives the same cases. Several seeds are tried and the smallest result wins.

export const MAX_PARAMETERS = 50;
export const MAX_VALUES = 50;
export const MAX_TUPLES = 1_500_000;

export class InputError extends RangeError {
  constructor(message, line = null) {
    super(line ? `Line ${line}: ${message}` : message);
    this.line = line;
  }
}

// ---- reading the parameter list ------------------------------------------------------

const WS = /\s/;

/** Splits `Chrome, "Fire, fox", !bad` into values; a leading ! marks a value invalid. */
function splitValues(source, line) {
  const out = [];
  const n = source.length;
  let i = 0;
  for (;;) {
    while (i < n && WS.test(source[i])) i++;
    let invalid = false;
    let text = '';
    if (source.startsWith('\\!', i)) {
      text = '!';
      i += 2;
    } else if (source[i] === '!') {
      invalid = true;
      i++;
      while (i < n && WS.test(source[i])) i++;
    }
    if (source[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new InputError('a quoted value is missing its closing quote (")', line);
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        text += source[i++];
      }
      while (i < n && WS.test(source[i])) i++;
      if (i < n && source[i] !== ',') throw new InputError('expected a comma after a quoted value', line);
    } else {
      const start = i;
      while (i < n && source[i] !== ',') i++;
      text += source.slice(start, i).trim();
    }
    if (text === '') throw new InputError('empty value (check for a doubled or trailing comma)', line);
    out.push({ text, invalid });
    if (i >= n) break;
    i++; // the comma
  }
  return out;
}

/**
 * Reads lines like `Browser: Chrome, Firefox, !Netscape`.
 * @returns {{parameters: {name: string, values: string[], invalid: string[]}[], warnings: string[]}}
 */
export function parseParameters(text) {
  const parameters = [];
  const warnings = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = index + 1;
    const s = raw.trim();
    if (s === '' || s.startsWith('#')) return;
    const colon = s.indexOf(':');
    if (colon <= 0) throw new InputError('write each parameter as  Name: value1, value2, value3', line);
    const name = s.slice(0, colon).trim();
    const rest = s.slice(colon + 1).trim();
    if (rest === '') throw new InputError(`parameter "${name}" has no values after the colon`, line);
    if (parameters.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new InputError(`parameter "${name}" is listed twice`, line);

    const values = [];
    const invalid = [];
    const seen = new Set();
    let duplicates = 0;
    for (const v of splitValues(rest, line)) {
      const key = `${v.invalid ? '!' : ''}${v.text}`;
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      (v.invalid ? invalid : values).push(v.text);
    }
    if (duplicates) warnings.push(`Line ${line}: ${duplicates} repeated value${duplicates === 1 ? '' : 's'} of "${name}" ignored.`);
    if (values.length === 0) throw new InputError(`parameter "${name}" needs at least one value that is not marked invalid with !`, line);
    if (values.length + invalid.length > MAX_VALUES) throw new InputError(`parameter "${name}" has more than ${MAX_VALUES} values`, line);
    parameters.push({ name, values, invalid });
  });
  if (parameters.length === 0) throw new InputError('Enter at least one parameter, for example  Browser: Chrome, Firefox, Safari');
  if (parameters.length > MAX_PARAMETERS) throw new InputError(`At most ${MAX_PARAMETERS} parameters are supported.`);
  return { parameters, warnings };
}

// ---- reading the rules ---------------------------------------------------------------------

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function didYouMean(word, options) {
  const best = options.map((o) => [o, editDistance(word.toLowerCase(), o.toLowerCase())]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(word.length / 3)) ? ` Did you mean "${best[0]}"?` : '';
}

function findParameter(parameters, name, line) {
  const exact = parameters.findIndex((p) => p.name === name);
  if (exact >= 0) return exact;
  const loose = parameters.map((p, i) => [p, i]).filter(([p]) => p.name.toLowerCase() === name.toLowerCase());
  if (loose.length === 1) return loose[0][1];
  const names = parameters.map((p) => p.name);
  const list = names.length > 12 ? `${names.slice(0, 12).join(', ')}, … (${names.length} in all)` : names.join(', ');
  throw new InputError(`unknown parameter "${name}".${didYouMean(name, names)} Parameters are: ${list}`, line);
}

function findValue(parameter, text, line) {
  let i = parameter.values.indexOf(text);
  if (i < 0) {
    const loose = parameter.values.map((v, k) => [v, k]).filter(([v]) => v.toLowerCase() === text.toLowerCase());
    if (loose.length === 1) i = loose[0][1];
  }
  if (i >= 0) return i;
  if (parameter.invalid.some((v) => v.toLowerCase() === text.toLowerCase())) {
    throw new InputError(`"${text}" is marked invalid in ${parameter.name}; rules can only use valid values`, line);
  }
  const list = parameter.values.length > 12 ? `${parameter.values.slice(0, 12).join(', ')}, … (${parameter.values.length} in all)` : parameter.values.join(', ');
  throw new InputError(`"${text}" is not a value of ${parameter.name}.${didYouMean(text, parameter.values)} Values are: ${list}`, line);
}

const unquote = (s) => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
};

/** `Browser = Chrome | Edge` or `Browser <> Safari` -> the parameter and the set of value indexes it may take. */
function parseItem(text, parameters, line) {
  const m = /^([^=<!]+?)\s*(<>|!=|==|=)\s*(.+)$/.exec(text.trim());
  if (!m) throw new InputError(`could not read "${text.trim()}"; write  Parameter = value  or  Parameter <> value`, line);
  const p = findParameter(parameters, m[1].trim(), line);
  const listed = new Set(m[3].split('|').map((v) => findValue(parameters[p], unquote(v), line)));
  const all = parameters[p].values.map((_, i) => i);
  const values = m[2] === '<>' || m[2] === '!=' ? all.filter((i) => !listed.has(i)) : [...listed];
  return { p, values };
}

const splitItems = (text) => text.split(/\s*&\s*|\s+AND\s+/).filter((s) => s.trim() !== '');

function product(items) {
  // every way of picking one value from each item
  return items.reduce((acc, item) => acc.flatMap((combo) => item.values.map((v) => [...combo, { p: item.p, v }])), [[]]);
}

/**
 * Reads rules, one per line:
 *   OS = iOS & Browser = Edge          these two never occur together (& or an upper-case AND joins items)
 *   IF OS = iOS THEN Browser = Safari  when OS is iOS, Browser must be Safari (| lists alternatives)
 *   Browser = Safari & OS <> macOS     <> means "any other value"
 * @returns {{forbidden: {p: number, v: number}[][], warnings: string[]}}
 */
export function parseConstraints(text, parameters) {
  const found = new Map();
  const warnings = [];
  const add = (set, line) => {
    const params = set.map((x) => x.p);
    if (new Set(params).size !== params.length) {
      warnings.push(`Line ${line}: a rule names the same parameter twice with different values, so it can never apply and was ignored.`);
      return;
    }
    const sorted = [...set].sort((a, b) => a.p - b.p);
    found.set(sorted.map((x) => `${x.p}:${x.v}`).join('|'), sorted);
    if (found.size > 10_000) throw new InputError('The rules expand into more than 10,000 forbidden combinations; make them more specific.', line);
  };

  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = index + 1;
    const s = raw.trim();
    if (s === '' || s.startsWith('#')) return;
    const ifThen = /^if\s+(.+?)\s+then\s+(.+)$/i.exec(s);
    if (/^if\s/i.test(s) && !ifThen) throw new InputError('write a condition as  IF Parameter = value THEN Parameter = value', line);
    if (ifThen) {
      const conditions = splitItems(ifThen[1]).map((i) => parseItem(i, parameters, line));
      const consequence = parseItem(ifThen[2], parameters, line);
      const wrong = parameters[consequence.p].values.map((_, i) => i).filter((i) => !consequence.values.includes(i));
      if (wrong.length === 0) warnings.push(`Line ${line}: this rule allows every value, so it has no effect.`);
      for (const combo of product(conditions)) for (const v of wrong) add([...combo, { p: consequence.p, v }], line);
    } else {
      const items = splitItems(s).map((i) => parseItem(i, parameters, line));
      if (items.length < 2) throw new InputError('a rule needs at least two items joined by &  (to leave a value out, delete it from the list)', line);
      for (const combo of product(items)) add(combo, line);
    }
  });
  return { forbidden: [...found.values()], warnings };
}

// ---- the search --------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function combinations(n, k) {
  const out = [];
  const pick = (start, chosen) => {
    if (chosen.length === k) return out.push([...chosen]);
    for (let i = start; i < n; i++) {
      chosen.push(i);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

const fullProduct = (sizes) => sizes.reduce((acc, n) => acc * BigInt(n), 1n);

/**
 * @param {{parameters: {name: string, values: string[], invalid?: string[]}[],
 *          forbidden?: {p: number, v: number}[][], strength?: 1|2|3, seed?: number}} input
 */
export function generate({ parameters, forbidden = [], strength = 2, seed = 1 }) {
  if (!Array.isArray(parameters) || parameters.length === 0) throw new InputError('Enter at least one parameter.');
  if (![1, 2, 3].includes(strength)) throw new RangeError('Strength must be 1, 2 or 3.');
  const P = parameters.length;
  const sizes = parameters.map((p) => p.values.length);
  const t = Math.min(strength, P);

  // every (parameter, value) gets one number; the numbers ascend with the parameter index
  const offset = [];
  let N = 0;
  for (const n of sizes) {
    offset.push(N);
    N += n;
  }
  const paramOf = new Int32Array(N);
  const valueOf = new Int32Array(N);
  parameters.forEach((p, pi) => p.values.forEach((_, vi) => {
    paramOf[offset[pi] + vi] = pi;
    valueOf[offset[pi] + vi] = vi;
  }));

  const rules = forbidden.map((set) => set.map(({ p, v }) => offset[p] + v).sort((a, b) => a - b));
  const rulesOf = Array.from({ length: N }, () => []);
  rules.forEach((rule, ri) => rule.forEach((id) => rulesOf[id].push(ri)));

  // would giving parameter p the value v complete a forbidden combination?
  const violates = (assign, p, v) => {
    const id = offset[p] + v;
    for (const ri of rulesOf[id]) {
      let complete = true;
      for (const other of rules[ri]) {
        if (other !== id && assign[paramOf[other]] !== valueOf[other]) {
          complete = false;
          break;
        }
      }
      if (complete) return true;
    }
    return false;
  };

  const deadEnd = (assign) => {
    for (let q = 0; q < P; q++) {
      if (assign[q] >= 0) continue;
      let any = false;
      for (let v = 0; v < sizes[q] && !any; v++) any = !violates(assign, q, v);
      if (!any) return true;
    }
    return false;
  };

  /** Finishes a partial assignment into a valid case (depth-first, fewest options first), or null. */
  const complete = (start) => {
    let budget = 50_000;
    let exhausted = false;
    const search = (assign) => {
      if (--budget < 0) {
        exhausted = true;
        return null;
      }
      let q = -1;
      let options = null;
      for (let i = 0; i < P; i++) {
        if (assign[i] >= 0) continue;
        const ok = [];
        for (let v = 0; v < sizes[i]; v++) if (!violates(assign, i, v)) ok.push(v);
        if (ok.length === 0) return null;
        if (!options || ok.length < options.length) [q, options] = [i, ok];
      }
      if (q < 0) return Int32Array.from(assign);
      for (const v of options) {
        assign[q] = v;
        const done = search(assign);
        assign[q] = -1;
        if (done) return done;
      }
      return null;
    };
    const result = search(Int32Array.from(start));
    return { assign: result, exhausted };
  };

  // --- the tuples that must be covered ---
  const combos = combinations(P, t);
  let total = 0;
  for (const combo of combos) total += combo.reduce((acc, p) => acc * sizes[p], 1);
  if (total > MAX_TUPLES) {
    throw new RangeError(`That is ${total.toLocaleString('en-US')} ${t === 1 ? 'values' : t === 2 ? 'pairs' : 'triples'} to cover; the limit is ${MAX_TUPLES.toLocaleString('en-US')}. Use fewer parameters or values, or a lower strength.`);
  }

  const keyOf = (ids) => ids.reduce((key, id) => key * N + id, 0);
  const decode = (key) => {
    const ids = [];
    let k = key;
    for (let i = 0; i < t; i++) {
      ids.unshift(k % N);
      k = Math.floor(k / N);
    }
    return ids;
  };

  const allKeys = [];
  let excludedCount = 0;
  const excludedKeys = []; // a sample, for the report
  for (const combo of combos) {
    const ids = new Array(t);
    const walk = (depth, key) => {
      if (depth === t) {
        if (rules.length) {
          const assign = new Int32Array(P).fill(-1);
          let ok = true;
          for (let i = 0; i < t && ok; i++) {
            if (violates(assign, combo[i], valueOf[ids[i]])) ok = false;
            else assign[combo[i]] = valueOf[ids[i]];
          }
          if (ok) {
            const { assign: done, exhausted } = complete(assign);
            if (!done && !exhausted) ok = false; // proven impossible; if the search gave up, assume it is possible
          }
          if (!ok) {
            excludedCount++;
            if (excludedKeys.length < 200) excludedKeys.push(key);
            return;
          }
        }
        allKeys.push(key);
        return;
      }
      const p = combo[depth];
      for (let v = 0; v < sizes[p]; v++) {
        ids[depth] = offset[p] + v;
        walk(depth + 1, key * N + ids[depth]);
      }
    };
    walk(0, 0);
  }

  const tupleCount = allKeys.length;
  const tries = tupleCount <= 2000 ? 30 : tupleCount <= 20000 ? 10 : tupleCount <= 100000 ? 3 : 1;
  const candidates = tupleCount <= 20000 ? 8 : 3;
  const positions = combinations(P, t); // which of a case's cells form each tuple

  const runOnce = (runSeed) => {
    const rng = mulberry32(runSeed);
    const list = allKeys.slice();
    const pos = new Map(list.map((k, i) => [k, i]));
    const remove = (key) => {
      const i = pos.get(key);
      const last = list.pop();
      if (last !== key) {
        list[i] = last;
        pos.set(last, i);
      }
      pos.delete(key);
    };
    const cases = [];
    const dropped = [];

    const gain = (assigned, id) => {
      let g = 0;
      if (t === 1) return pos.has(id) ? 1 : 0;
      if (t === 2) {
        for (const o of assigned) g += pos.has(o < id ? o * N + id : id * N + o) ? 1 : 0;
        return g;
      }
      for (let i = 0; i < assigned.length; i++) {
        for (let j = i + 1; j < assigned.length; j++) {
          const trio = [assigned[i], assigned[j], id].sort((a, b) => a - b);
          g += pos.has((trio[0] * N + trio[1]) * N + trio[2]) ? 1 : 0;
        }
      }
      return g;
    };

    const build = (seedKey) => {
      const assign = new Int32Array(P).fill(-1);
      const assigned = [];
      for (const id of decode(seedKey)) {
        assign[paramOf[id]] = valueOf[id];
        assigned.push(id);
      }
      const order = [];
      for (let p = 0; p < P; p++) if (assign[p] < 0) order.push(p);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const p of order) {
        let bestValues = [];
        let bestGain = -1;
        for (let v = 0; v < sizes[p]; v++) {
          if (rules.length) {
            if (violates(assign, p, v)) continue;
            assign[p] = v;
            const stuck = deadEnd(assign);
            assign[p] = -1;
            if (stuck) continue;
          }
          const g = gain(assigned, offset[p] + v);
          if (g > bestGain) [bestGain, bestValues] = [g, [v]];
          else if (g === bestGain) bestValues.push(v);
        }
        if (bestValues.length === 0) return complete(Int32Array.from(assign.map((x, i) => (order.includes(i) ? -1 : x)))).assign;
        const chosen = bestValues[Math.floor(rng() * bestValues.length)];
        assign[p] = chosen;
        assigned.push(offset[p] + chosen);
      }
      return assign;
    };

    const keysOfCase = (assign) => {
      const ids = Array.from(assign, (v, p) => offset[p] + v);
      return positions.map((pick) => keyOf(pick.map((i) => ids[i])));
    };

    while (list.length) {
      let best = null;
      let bestScore = -1;
      const failed = [];
      for (let c = 0; c < candidates; c++) {
        const seedKey = list[Math.floor(rng() * list.length)];
        const assign = build(seedKey);
        if (!assign) {
          failed.push(seedKey);
          continue;
        }
        const score = keysOfCase(assign).reduce((n, k) => n + (pos.has(k) ? 1 : 0), 0);
        if (score > bestScore) [best, bestScore] = [assign, score];
      }
      if (!best) {
        for (const key of new Set(failed)) {
          if (pos.has(key)) {
            remove(key);
            dropped.push(key);
          }
        }
        continue;
      }
      cases.push(best);
      for (const k of keysOfCase(best)) if (pos.has(k)) remove(k);
    }

    // drop cases whose every tuple is also covered by another case
    const count = new Map();
    const allowed = new Set(allKeys);
    for (const assign of cases) for (const k of new Set(keysOfCase(assign))) if (allowed.has(k)) count.set(k, (count.get(k) ?? 0) + 1);
    const kept = [];
    for (let i = cases.length - 1; i >= 0; i--) {
      const mine = [...new Set(keysOfCase(cases[i]))].filter((k) => allowed.has(k));
      if (mine.every((k) => count.get(k) > 1)) mine.forEach((k) => count.set(k, count.get(k) - 1));
      else kept.push(cases[i]);
    }
    return { cases: kept.reverse(), dropped };
  };

  let best = null;
  let bestSeed = seed;
  for (let i = 0; i < tries; i++) {
    const runSeed = seed + i * 7919;
    const run = runOnce(runSeed);
    if (!best || run.cases.length < best.cases.length) [best, bestSeed] = [run, runSeed];
  }

  // --- invalid values: one per case, everything else valid ---
  const rows = best.cases.map((assign) => ({ values: Array.from(assign), invalid: new Array(P).fill(false) }));
  const validRows = rows.length;
  let next = 0;
  parameters.forEach((param, p) => {
    for (const bad of param.invalid ?? []) {
      const base = best.cases[validRows ? next++ % validRows : 0];
      const values = Array.from(base ?? new Int32Array(P));
      rows.push({ values: values.map((v, q) => (q === p ? -1 : v)), invalid: values.map((_, q) => q === p), badValue: bad });
    }
  });

  const cases = rows.map((row) => ({
    cells: row.values.map((v, p) => (row.invalid[p] ? row.badValue : parameters[p].values[v])),
    invalid: row.invalid,
    valueIndexes: row.values,
  }));

  const describe = (key) => decode(key).map((id) => ({ parameter: parameters[paramOf[id]].name, value: parameters[paramOf[id]].values[valueOf[id]] }));
  return {
    parameters: parameters.map((p) => p.name),
    cases,
    stats: {
      strength: t,
      requestedStrength: strength,
      requiredTuples: tupleCount - best.dropped.length,
      fullCombinations: fullProduct(sizes).toString(),
      validCases: validRows,
      invalidCases: rows.length - validRows,
      excludedByRules: excludedCount,
      excludedExamples: excludedKeys.map(describe),
      uncoverable: best.dropped.map(describe), // the search gave up on these (rare)
      seed: bestSeed,
      triesUsed: tries,
    },
  };
}

// ---- checking a result, independently of how it was made -----------------------------------------

/**
 * Re-counts coverage by looking only at the finished cases and the rules, with its own simple
 * search for which tuples are possible at all. `parameters` are the valid values.
 * @returns {{required: number, covered: number, missing: object[][], violations: number[], impossible: number}}
 */
export function verify({ parameters, cases, forbidden = [], strength = 2 }) {
  const P = parameters.length;
  const t = Math.min(strength, P);
  const sizes = parameters.map((p) => p.values.length);
  const rows = cases.filter((c) => !c.invalid.some(Boolean)).map((c) => c.valueIndexes);
  const broken = (assign) => forbidden.some((rule) => rule.every(({ p, v }) => assign[p] === v));

  // can some complete, rule-abiding case contain these (parameter, value) items?
  const possible = (items) => {
    const assign = new Array(P).fill(-1);
    for (const [p, v] of items) assign[p] = v;
    if (broken(assign)) return false;
    let nodes = 0;
    const fill = (p) => {
      if (++nodes > 200_000) return true; // gave up: assume possible
      while (p < P && assign[p] >= 0) p++;
      if (p === P) return true;
      for (let v = 0; v < sizes[p]; v++) {
        assign[p] = v;
        if (!broken(assign) && fill(p + 1)) {
          assign[p] = -1;
          return true;
        }
      }
      assign[p] = -1;
      return false;
    };
    return fill(0);
  };

  const picks = combinations(P, t);
  const covered = new Set();
  for (const row of rows) {
    const cells = row.map((v, p) => `${p}:${v}`);
    for (const pick of picks) covered.add(pick.map((i) => cells[i]).join('|'));
  }
  const violations = rows.map((row, i) => [row, i]).filter(([row]) => broken(row)).map(([, i]) => i);

  let required = 0;
  let impossible = 0;
  const missing = [];
  for (const pick of picks) {
    const walk = (depth, chosen) => {
      if (depth === t) {
        if (!possible(chosen)) {
          impossible++;
          return;
        }
        required++;
        if (!covered.has(chosen.map(([p, v]) => `${p}:${v}`).join('|'))) missing.push(chosen.map(([p, v]) => ({ parameter: parameters[p].name, value: parameters[p].values[v] })));
        return;
      }
      const p = pick[depth];
      for (let v = 0; v < sizes[p]; v++) walk(depth + 1, [...chosen, [p, v]]);
    };
    walk(0, []);
  }
  return { required, covered: required - missing.length, missing, violations, impossible };
}

// ---- output -----------------------------------------------------------------------------------

const csvCell = (s, sep) => (s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** @param {'csv'|'tsv'|'markdown'|'gherkin'|'json'} format */
export function formatCases(result, format) {
  const header = ['#', ...result.parameters];
  const rows = result.cases.map((c, i) => [String(i + 1), ...c.cells]);
  switch (format) {
    case 'csv':
    case 'tsv': {
      const sep = format === 'csv' ? ',' : '\t';
      const clean = (s) => (format === 'tsv' ? s.replace(/[\t\r\n]+/g, ' ') : s);
      return [header, ...rows].map((r) => r.map((c) => csvCell(clean(c), sep)).join(sep)).join('\n');
    }
    case 'markdown': {
      const esc = (s) => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
      const line = (r) => `| ${r.map(esc).join(' | ')} |`;
      return [line(header), `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
    }
    case 'gherkin': {
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
      const line = (r) => `  | ${r.map(esc).join(' | ')} |`;
      return ['Examples:', line(result.parameters), ...result.cases.map((c) => line(c.cells))].join('\n');
    }
    case 'json':
      return JSON.stringify(result.cases.map((c) => Object.fromEntries(result.parameters.map((name, i) => [name, c.cells[i]]))), null, 2);
    default:
      throw new RangeError(`Unknown format: ${format}`);
  }
}
