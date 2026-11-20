import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParameters, parseConstraints, generate, verify, formatCases, InputError, MAX_TUPLES,
} from '../js/lib/pairwise.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const spec = (text) => parseParameters(text).parameters;
const uniform = (counts) => counts.map((n, i) => ({ name: `P${i}`, values: Array.from({ length: n }, (_, v) => `v${v}`), invalid: [] }));

// ---- an oracle that shares no code with the generator -----------------------------------
function allAssignments(parameters, forbidden) {
  const out = [];
  const walk = (p, cur) => {
    if (p === parameters.length) {
      if (!forbidden.some((rule) => rule.every(({ p: q, v }) => cur[q] === v))) out.push([...cur]);
      return;
    }
    for (let v = 0; v < parameters[p].values.length; v++) walk(p + 1, [...cur, v]);
  };
  walk(0, []);
  return out;
}
const subsets = (n, k) => (k === 0 ? [[]] : n === 0 ? [] : [...subsets(n - 1, k).map((s) => s), ...subsets(n - 1, k - 1).map((s) => [...s, n - 1])]);
const tupleKeysOf = (row, t) => subsets(row.length, t).map((pick) => pick.map((p) => `${p}:${row[p]}`).join('|'));
const rowOf = (c) => c.valueIndexes;

// ---- reading parameters ------------------------------------------------------------------------
test('parseParameters reads names, values, comments, quotes and invalid markers', () => {
  const { parameters, warnings } = parseParameters(`
    # a comment
    Browser: Chrome, Firefox , Safari
    OS : "Windows, 11", "say ""hi""", macOS

    Age: !-1, 18, 65, !abc, \\!literal
  `);
  assert.deepEqual(parameters, [
    { name: 'Browser', values: ['Chrome', 'Firefox', 'Safari'], invalid: [] },
    { name: 'OS', values: ['Windows, 11', 'say "hi"', 'macOS'], invalid: [] },
    { name: 'Age', values: ['18', '65', '!literal'], invalid: ['-1', 'abc'] },
  ]);
  assert.deepEqual(warnings, []);
  assert.equal(spec('A: x, y, x, x\nB: 1').length, 2);
  assert.match(parseParameters('A: x, y, x, x\nB: 1').warnings[0], /Line 1: 2 repeated values of "A" ignored/);
});

test('parseParameters explains mistakes with line numbers', () => {
  const bad = (text, pattern) => assert.throws(() => parseParameters(text), (e) => e instanceof InputError && pattern.test(e.message), text);
  bad('', /at least one parameter/);
  bad('# only a comment\n\n', /at least one parameter/);
  bad('A: 1, 2\nno colon here', /Line 2: write each parameter as/);
  bad(': 1, 2', /Line 1: write each parameter as/);
  bad('A:', /Line 1: parameter "A" has no values/);
  bad('A: 1,,2', /Line 1: empty value/);
  bad('A: 1, 2,', /Line 1: empty value/);
  bad('A: 1, "2', /Line 1: a quoted value is missing its closing quote/);
  bad('A: "1" x, 2', /expected a comma after a quoted value/);
  bad('A: 1\na: 2', /Line 2: parameter "a" is listed twice/);
  bad('A: !1, !2', /Line 1: parameter "A" needs at least one value that is not marked invalid/);
  bad(`A: ${Array.from({ length: 51 }, (_, i) => i).join(',')}`, /more than 50 values/);
  bad(Array.from({ length: 51 }, (_, i) => `P${i}: 1, 2`).join('\n'), /At most 50 parameters/);
});

// ---- reading rules -------------------------------------------------------------------------------
test('parseConstraints: forbidden combinations, IF/THEN, alternatives, <> and case-insensitive names', () => {
  const parameters = spec('Browser: Chrome, Firefox, Safari, Edge\nOS: Windows, macOS, iOS\nLang: EN, PL');
  const names = (rule) => rule.map(({ p, v }) => `${parameters[p].name}=${parameters[p].values[v]}`).join(' & ');
  const rules = (text) => parseConstraints(text, parameters).forbidden.map(names).sort();

  assert.deepEqual(rules('OS = iOS & Browser = Edge'), ['Browser=Edge & OS=iOS']);
  assert.deepEqual(rules('IF OS = iOS THEN Browser = Safari'), ['Browser=Chrome & OS=iOS', 'Browser=Edge & OS=iOS', 'Browser=Firefox & OS=iOS']);
  assert.deepEqual(rules('IF OS = iOS THEN Browser = Safari | Chrome'), ['Browser=Edge & OS=iOS', 'Browser=Firefox & OS=iOS']);
  assert.deepEqual(rules('if os = ios then browser <> edge'), ['Browser=Edge & OS=iOS']);
  assert.deepEqual(rules('Browser = Safari & OS <> macOS'), ['Browser=Safari & OS=Windows', 'Browser=Safari & OS=iOS'].sort());
  assert.deepEqual(rules('Browser = Edge | Firefox & OS = iOS'), ['Browser=Edge & OS=iOS', 'Browser=Firefox & OS=iOS']);
  assert.deepEqual(rules('IF OS = iOS AND Lang = PL THEN Browser = Safari').length, 3);
  assert.deepEqual(rules('# comment\n\nOS = iOS & Lang = PL\nLang = PL & OS = iOS'), ['OS=iOS & Lang=PL'], 'the same rule written twice counts once');
  assert.deepEqual(rules(''), []);
  // "and" inside a value is not a separator; only & or an upper-case AND is
  const withAnd = spec('Genre: Rock and Roll, Pop\nMood: Happy, Sad');
  assert.equal(parseConstraints('Genre = Rock and Roll & Mood = Sad', withAnd).forbidden.length, 1);
});

test('parseConstraints: warnings for rules that do nothing, and errors that suggest a fix', () => {
  const parameters = spec('Browser: Chrome, Firefox\nOS: Windows, macOS, !BeOS');
  assert.match(parseConstraints('OS = Windows & OS = macOS', parameters).warnings[0], /can never apply/);
  assert.match(parseConstraints('IF OS = Windows THEN Browser = Chrome | Firefox', parameters).warnings[0], /no effect/);
  const bad = (text, pattern) => assert.throws(() => parseConstraints(text, parameters), (e) => e instanceof InputError && pattern.test(e.message), text);
  bad('Browsr = Chrome & OS = Windows', /unknown parameter "Browsr"\. Did you mean "Browser"\?/);
  bad('Browser = Chrom & OS = Windows', /"Chrom" is not a value of Browser\. Did you mean "Chrome"\?/);
  bad('Browser = Chrome & OS = BeOS', /"BeOS" is marked invalid in OS/);
  bad('Browser = Chrome', /Line 1: a rule needs at least two items/);
  bad('IF Browser = Chrome', /write a condition as/);
  bad('Browser Chrome & OS = Windows', /could not read "Browser Chrome"/);
  bad('OS = Windows & Browser = Chrome\nBrowser = Edge & OS = Windows', /Line 2: "Edge" is not a value of Browser/);
});

// ---- generating ----------------------------------------------------------------------------------
test('the classic 3x3x3x3 example reaches the proven optimum of 9 cases and covers all 54 pairs', () => {
  const parameters = uniform([3, 3, 3, 3]);
  const result = generate({ parameters });
  assert.equal(result.cases.length, 9);
  assert.equal(result.stats.requiredTuples, 54);
  assert.equal(result.stats.fullCombinations, '81');
  const check = verify({ parameters, cases: result.cases, strength: 2 });
  assert.deepEqual([check.required, check.covered, check.missing, check.violations], [54, 54, [], []]);
});

test('results are deterministic for a seed and a different seed may give a different arrangement', () => {
  const parameters = uniform([4, 3, 3, 2, 2]);
  const a = generate({ parameters, seed: 5 });
  assert.deepEqual(generate({ parameters, seed: 5 }), a);
  const others = [1, 2, 3, 4].map((seed) => JSON.stringify(generate({ parameters, seed }).cases));
  assert.ok(new Set([JSON.stringify(a.cases), ...others]).size > 1);
});

test('size is never below the mathematical lower bound and stays near it (regression caps)', () => {
  // For pairwise coverage at least (largest size) x (second largest size) cases are needed, so a
  // result equal to that product is provably optimal. The caps are measured results plus a margin:
  // they exist to notice if a change makes the search clearly worse.
  const benchmarks = [
    { counts: [3, 3, 3, 3], allow: 9 }, // optimal
    { counts: [4, 4, 4, 4, 4], allow: 16 }, // optimal
    { counts: [5, 5, 5], allow: 25 }, // optimal
    { counts: [6, 5, 4, 3, 2], allow: 30 }, // optimal
    { counts: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2], allow: 10 },
    { counts: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], allow: 22 },
    { counts: [10, 10, 10], allow: 125 },
  ];
  for (const { counts, allow } of benchmarks) {
    const parameters = uniform(counts);
    const sorted = [...counts].sort((a, b) => b - a);
    const lowerBound = sorted[0] * sorted[1];
    const { cases } = generate({ parameters });
    assert.ok(cases.length >= lowerBound, `${counts}: ${cases.length} is below the lower bound ${lowerBound}`);
    assert.ok(cases.length <= allow, `${counts.join('x')}: got ${cases.length}, allowed ${allow} (lower bound ${lowerBound})`);
    assert.equal(verify({ parameters, cases, strength: 2 }).missing.length, 0, `${counts}`);
  }
});

test('edge shapes: one parameter, two parameters, single-valued parameters', () => {
  const one = generate({ parameters: uniform([4]) });
  assert.equal(one.cases.length, 4);
  assert.equal(one.stats.strength, 1);
  const two = generate({ parameters: uniform([3, 4]) });
  assert.equal(two.cases.length, 12, 'with two parameters every combination is a pair');
  const flat = generate({ parameters: uniform([1, 1, 1]) });
  assert.equal(flat.cases.length, 1);
  assert.deepEqual(flat.cases[0].cells, ['v0', 'v0', 'v0']);
  const mixed = generate({ parameters: uniform([1, 5, 1, 2]) });
  assert.equal(verify({ parameters: uniform([1, 5, 1, 2]), cases: mixed.cases, strength: 2 }).missing.length, 0);
  assert.equal(mixed.cases.length, 10);
});

test('strength 1 uses each value once; strength 3 covers every triple; strength above the parameter count means every combination', () => {
  const parameters = uniform([3, 4, 2]);
  assert.equal(generate({ parameters, strength: 1 }).cases.length, 4);
  const three = generate({ parameters: uniform([3, 3, 3, 3, 3]), strength: 3 });
  assert.equal(verify({ parameters: uniform([3, 3, 3, 3, 3]), cases: three.cases, strength: 3 }).missing.length, 0);
  assert.equal(three.stats.requiredTuples, 270);
  assert.ok(three.cases.length < 243 && three.cases.length >= 27);
  const every = generate({ parameters: uniform([2, 3]), strength: 3 });
  assert.equal(every.cases.length, 6);
  assert.equal(every.stats.strength, 2);
  assert.equal(every.stats.requestedStrength, 3);
  assert.throws(() => generate({ parameters: uniform([2, 2]), strength: 4 }), /Strength must be 1, 2 or 3/);
  assert.throws(() => generate({ parameters: [] }), /at least one parameter/);
});

test('rules are respected and impossible pairs are reported, not silently skipped', () => {
  const parameters = spec('Browser: Chrome, Safari, Edge\nOS: Windows, macOS, iOS\nLang: EN, PL');
  const { forbidden } = parseConstraints('IF OS = iOS THEN Browser = Safari\nBrowser = Edge & OS = macOS', parameters);
  const result = generate({ parameters, forbidden });
  const check = verify({ parameters, cases: result.cases, forbidden, strength: 2 });
  assert.deepEqual(check.violations, []);
  assert.deepEqual(check.missing, []);
  for (const c of result.cases) {
    assert.ok(!(c.cells[1] === 'iOS' && c.cells[0] !== 'Safari'), c.cells.join());
    assert.ok(!(c.cells[0] === 'Edge' && c.cells[1] === 'macOS'), c.cells.join());
  }
  // iOS + Chrome, iOS + Edge and Edge + macOS can never happen, and the report says so
  const names = (tuple) => tuple.map((i) => `${i.parameter}=${i.value}`).sort().join(' & ');
  assert.equal(result.stats.excludedByRules, 3);
  assert.deepEqual(result.stats.excludedExamples.map(names).sort(), ['Browser=Chrome & OS=iOS', 'Browser=Edge & OS=iOS', 'Browser=Edge & OS=macOS']);
  assert.equal(check.impossible, 3, 'the independent verifier finds the same number');
  assert.equal(result.stats.requiredTuples, 21 - 3, 'pairs: 3x3 + 3x2 + 3x2 = 21, minus the 3 impossible ones');
});

test('a value that every rule excludes makes its pairs uncoverable', () => {
  const parameters = spec('A: x, y\nB: 1, 2\nC: p, q');
  const { forbidden } = parseConstraints('A = x & B = 1\nA = x & B = 2', parameters); // A=x is impossible
  const result = generate({ parameters, forbidden });
  // two pairs are forbidden outright; the other two are impossible because of how the rules combine
  assert.deepEqual(result.stats.excludedExamples.map((t) => t.map((i) => `${i.parameter}=${i.value}`).sort().join(' & ')).sort(),
    ['A=x & B=1', 'A=x & B=2', 'A=x & C=p', 'A=x & C=q']);
  assert.ok(result.cases.every((c) => c.cells[0] === 'y'));
  const check = verify({ parameters, cases: result.cases, forbidden });
  assert.deepEqual([check.missing.length, check.impossible], [0, 4]);
});

test('invalid values appear once each, in a row where everything else is valid', () => {
  const { parameters } = parseParameters('Age: !-1, !abc, 18, 65\nCountry: PL, DE, FR\nPlan: Free, Pro');
  const result = generate({ parameters });
  assert.equal(result.stats.invalidCases, 2);
  const invalidRows = result.cases.filter((c) => c.invalid.some(Boolean));
  assert.deepEqual(invalidRows.map((c) => c.cells[0]), ['-1', 'abc']);
  for (const row of invalidRows) {
    assert.deepEqual(row.invalid, [true, false, false]);
    assert.ok(parameters[1].values.includes(row.cells[1]) && parameters[2].values.includes(row.cells[2]));
  }
  assert.equal(result.cases.length, result.stats.validCases + 2);
  for (const c of result.cases) assert.ok(c.cells.every((cell) => typeof cell === 'string' && cell !== ''), JSON.stringify(c.cells));
  // the valid rows alone still cover every pair of valid values
  assert.equal(verify({ parameters, cases: result.cases, strength: 2 }).missing.length, 0);
  assert.equal(result.stats.fullCombinations, '12', 'invalid values do not count');
  // two invalid values in different parameters never share a row
  const both = generate({ parameters: parseParameters('A: !bad, 1, 2\nB: !worse, x, y').parameters });
  assert.ok(both.cases.every((c) => c.invalid.filter(Boolean).length <= 1));
  assert.equal(both.stats.invalidCases, 2);
  // each invalid value sits in its own parameter's column, flagged there and nowhere else
  const flagged = both.cases.filter((c) => c.invalid.some(Boolean)).map((c) => [c.invalid.indexOf(true), c.cells[c.invalid.indexOf(true)]]);
  assert.deepEqual(flagged, [[0, 'bad'], [1, 'worse']]);
  for (const c of both.cases.filter((x) => x.invalid.some(Boolean))) {
    c.cells.forEach((cell, p) => {
      assert.ok(typeof cell === 'string' && cell !== '', `column ${p} of ${JSON.stringify(c.cells)} is not a real value`);
      assert.equal(['bad', 'worse'].includes(cell), c.invalid[p], `column ${p} of ${c.cells}`);
    });
  }
});

test('refuses inputs with too many combinations, with a helpful message', () => {
  assert.throws(() => generate({ parameters: uniform(Array(50).fill(50)) }), (e) => /to cover; the limit is 1,500,000/.test(e.message) && /fewer parameters or values/.test(e.message));
  assert.equal(MAX_TUPLES, 1_500_000);
  assert.throws(() => generate({ parameters: uniform(Array(40).fill(10)), strength: 3 }), /triples to cover/);
});

test('property: random specs with random rules are covered exactly, judged by a brute-force oracle', () => {
  const r = seeded(2024);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let withRules = 0;
  let withUncoverable = 0;
  for (let trial = 0; trial < 150; trial++) {
    const P = int(2, 5);
    const parameters = uniform(Array.from({ length: P }, () => int(1, 4)));
    const forbidden = [];
    for (let k = int(0, 4); k > 0; k--) {
      const ps = [...Array(P).keys()].sort(() => r() - 0.5).slice(0, int(2, Math.min(3, P))).sort((a, b) => a - b);
      forbidden.push(ps.map((p) => ({ p, v: int(0, parameters[p].values.length - 1) })));
    }
    const strength = [1, 2, 2, 2, 3][int(0, 4)];
    const t = Math.min(strength, P);
    const result = generate({ parameters, forbidden, strength, seed: trial + 1 });

    // 1. no case breaks a rule, and every case is a real combination
    const valid = allAssignments(parameters, forbidden);
    const validKeys = new Set(valid.map((row) => row.join()));
    for (const c of result.cases) assert.ok(validKeys.has(rowOf(c).join()), `trial ${trial}: case ${rowOf(c)} breaks a rule`);

    // 2. the set of feasible tuples comes from the oracle, not from the generator
    const feasible = new Set(valid.flatMap((row) => tupleKeysOf(row, t)));
    const everyTuple = [...allAssignments(parameters, []).flatMap((row) => tupleKeysOf(row, t))];
    const infeasible = new Set(everyTuple.filter((k) => !feasible.has(k)));
    // the generator must cover every feasible tuple...
    const covered = new Set(result.cases.flatMap((c) => tupleKeysOf(rowOf(c), t)));
    for (const k of feasible) assert.ok(covered.has(k), `trial ${trial}: feasible tuple ${k} is not covered`);
    // ...and the count of required and of excluded tuples must match the oracle exactly
    assert.equal(result.stats.requiredTuples, feasible.size, `trial ${trial}: required count`);
    assert.equal(result.stats.excludedByRules, infeasible.size, `trial ${trial}: excluded count`);
    for (const tuple of result.stats.excludedExamples) {
      const key = tuple.map(({ parameter, value }) => `${parameter.slice(1)}:${value.slice(1)}`).join('|');
      assert.ok(infeasible.has(key) && !feasible.has(key), `trial ${trial}: ${key} was reported impossible but is possible`);
    }
    assert.deepEqual(result.stats.uncoverable, [], `trial ${trial}: the search should never give up on tiny inputs`);

    // 3. never more cases than there are valid combinations
    assert.ok(result.cases.length <= Math.max(valid.length, 1) + 0, `trial ${trial}: ${result.cases.length} cases for ${valid.length} combinations`);
    // 4. the library's own verifier agrees with the oracle
    const check = verify({ parameters, cases: result.cases, forbidden, strength });
    assert.deepEqual([check.missing.length, check.violations.length, check.impossible], [0, 0, infeasible.size], `trial ${trial}`);
    if (forbidden.length) withRules++;
    if (infeasible.size) withUncoverable++;
  }
  assert.ok(withRules > 100 && withUncoverable > 50, `the random inputs should exercise rules (${withRules}) and impossible tuples (${withUncoverable})`);
});

test('verify really detects a missing pair and a broken rule', () => {
  const parameters = uniform([3, 3, 3]);
  const result = generate({ parameters });
  const dropped = result.cases.slice(1);
  assert.ok(verify({ parameters, cases: dropped, strength: 2 }).missing.length > 0);
  const forbidden = [[{ p: 0, v: Number(result.cases[0].valueIndexes[0]) }, { p: 1, v: Number(result.cases[0].valueIndexes[1]) }]];
  assert.ok(verify({ parameters, cases: result.cases, forbidden, strength: 2 }).violations.includes(0));
});

test('speed: realistic and large inputs finish quickly', () => {
  const timed = (parameters, strength = 2) => {
    const t0 = performance.now();
    const result = generate({ parameters, strength });
    return { ms: performance.now() - t0, cases: result.cases.length, ok: verify({ parameters, cases: result.cases, strength }).missing.length === 0 };
  };
  const typical = timed(uniform([4, 4, 3, 3, 3, 2, 2, 2]));
  const wide = timed(uniform(Array(20).fill(5)));
  const big = timed(uniform(Array(10).fill(10)));
  for (const r of [typical, wide, big]) assert.ok(r.ok);
  assert.ok(typical.ms < 2000 && wide.ms < 8000 && big.ms < 8000, `typical ${typical.ms | 0} ms, 20x5 ${wide.ms | 0} ms, 10x10 ${big.ms | 0} ms`);
  console.log(`      timings: typical ${typical.ms | 0} ms (${typical.cases} cases), 20 params x 5 values ${wide.ms | 0} ms (${wide.cases} cases), 10 x 10 ${big.ms | 0} ms (${big.cases} cases)`);
});

// ---- output -----------------------------------------------------------------------------------------
test('formatCases: CSV, TSV, Markdown, Gherkin and JSON, with awkward values', () => {
  const { parameters } = parseParameters('Name: "a,b", "say ""x""", plain\nPipe: "p|q", r');
  const result = generate({ parameters });
  const csv = formatCases(result, 'csv').split('\n');
  assert.equal(csv[0], '#,Name,Pipe');
  assert.ok(csv.some((l) => l.includes('"a,b"')) && csv.some((l) => l.includes('"say ""x"""')));
  assert.equal(csv.length, result.cases.length + 1);

  const tabbed = generate({ parameters: [{ name: 'T', values: ['a\tb', 'c'], invalid: [] }, { name: 'U', values: ['1', '2'], invalid: [] }] });
  assert.ok(!formatCases(tabbed, 'tsv').split('\n').slice(1).some((l) => l.split('\t').length !== 3), 'tabs inside values do not add columns');

  const md = formatCases(result, 'markdown').split('\n');
  assert.equal(md[0], '| # | Name | Pipe |');
  assert.equal(md[1], '| --- | --- | --- |');
  assert.ok(md.join('\n').includes('p\\|q'));
  const gherkin = formatCases(result, 'gherkin').split('\n');
  assert.equal(gherkin[0], 'Examples:');
  assert.equal(gherkin[1], '  | Name | Pipe |');
  assert.equal(gherkin.length, result.cases.length + 2);
  const json = JSON.parse(formatCases(result, 'json'));
  assert.equal(json.length, result.cases.length);
  assert.deepEqual(Object.keys(json[0]), ['Name', 'Pipe']);
  assert.throws(() => formatCases(result, 'xml'), /Unknown format/);
});
