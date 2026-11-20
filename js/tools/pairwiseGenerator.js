import { h, field, statusLine, outputPanel } from '../util.js';
import { parseParameters, parseConstraints, generate, verify, formatCases, InputError } from '../lib/pairwise.js';

const EXAMPLE_PARAMETERS = `# One line per parameter:  Name: value1, value2, value3
# A value starting with ! is invalid: it is tested alone, once.
Browser: Chrome, Firefox, Safari, Edge
OS: Windows, macOS, iOS, Android
Language: English, Polish, !Klingon
Payment: Card, Blik, Transfer`;

const EXAMPLE_RULES = `# Combinations that cannot happen (one per line)
IF OS = iOS THEN Browser = Safari
Browser = Safari & OS = Android
Browser = Edge & OS = macOS`;

const STRENGTHS = [
  [2, 'Pairwise: every pair of values (recommended)'],
  [3, '3-way: every triple of values (more cases)'],
  [1, 'Each value at least once (fewest cases)'],
];

const FORMATS = [
  ['tsv', 'Spreadsheet (tab-separated)'],
  ['csv', 'CSV'],
  ['markdown', 'Markdown table'],
  ['gherkin', 'Gherkin examples table'],
  ['json', 'JSON'],
];

const FILE_EXTENSION = { tsv: 'tsv', csv: 'csv', markdown: 'md', gherkin: 'feature.txt', json: 'json' };
const fmt = (n) => Number(n).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const VERIFY_LIMIT = 60_000; // the independent coverage check is skipped for huge inputs

function reduction(cases, full) {
  const total = Number(full);
  if (!Number.isFinite(total) || total <= cases) return null;
  const fewer = (1 - cases / total) * 100;
  return fewer >= 99.95 ? 'over 99.9%' : `${fewer.toFixed(fewer >= 10 ? 0 : 1)}%`;
}

export default {
  id: 'pairwise',
  name: 'Pairwise generator',
  category: 'Generate',
  description: 'Turn parameters and values into the smallest set of test cases that still covers every pair of values.',
  keywords: ['pairwise', 'all-pairs', 'combinatorial', 'test design', 'combinations', 'matrix', 'orthogonal', 'covering array', 'pict', 'parameters', 'equivalence', 'negative', 'constraints', 'gherkin', 'examples'],
  render(root) {
    const parameters = h('textarea', { rows: 9, spellcheck: false, value: EXAMPLE_PARAMETERS, 'aria-describedby': 'pairwise-help' });
    const rules = h('textarea', { rows: 5, spellcheck: false, value: EXAMPLE_RULES, 'aria-describedby': 'pairwise-help' });
    const strength = h('select', {}, STRENGTHS.map(([value, label]) => h('option', { value }, label)));
    const seed = h('input', { type: 'number', min: 1, max: 9999, value: 1, size: 5 });
    const format = h('select', {}, FORMATS.map(([value, label]) => h('option', { value }, label)));
    const status = statusLine();
    const notes = h('div');
    const result = h('div');
    const excluded = h('div');
    const out = outputPanel({ label: 'Test cases', filename: 'pairwise-tests.tsv', rows: 8 });
    let current = null;
    let timer;

    const showExport = () => {
      out.setFilename(`pairwise-tests.${FILE_EXTENSION[format.value]}`);
      out.set(current ? formatCases(current, format.value) : '');
    };

    const render = (generated, check) => {
      result.replaceChildren();
      excluded.replaceChildren();
      const { stats } = generated;
      const table = h('table', {},
        h('caption', { class: 'sr-only' }, 'Generated test cases'),
        h('tr', {}, h('th', {}, '#'), generated.parameters.map((name) => h('th', {}, name))),
        generated.cases.map((c, i) =>
          h('tr', { class: c.invalid.some(Boolean) ? 'row-invalid' : null },
            h('td', {}, String(i + 1)),
            c.cells.map((cell, p) => (c.invalid[p]
              ? h('td', {}, h('span', { class: 'bad-value' }, h('span', { class: 'sr-only' }, 'invalid value: '), `✗ ${cell}`))
              : h('td', {}, cell))))),
      );
      result.append(h('div', { class: 'table-wrap', role: 'region', tabindex: 0, 'aria-label': 'Generated test cases, scrollable' }, table));

      if (stats.excludedByRules) {
        const shown = stats.excludedExamples.map((tuple) => tuple.map((i) => `${i.parameter} = ${i.value}`).join('  +  '));
        excluded.append(
          h('details', {},
            h('summary', {}, `${plural(stats.excludedByRules, 'combination')} excluded by your rules`),
            h('p', { class: 'muted' }, 'These pairs can never occur, so they are not tested. Check that this is what you meant: a typo in a rule can rule out more than intended.'),
            h('ul', {}, shown.map((line) => h('li', {}, line))),
            stats.excludedByRules > shown.length ? h('p', { class: 'muted' }, `…and ${fmt(stats.excludedByRules - shown.length)} more.`) : null),
        );
      }

      const unit = stats.strength === 1 ? 'value' : stats.strength === 2 ? 'pair' : 'triple';
      const cut = reduction(stats.validCases, stats.fullCombinations);
      const parts = [
        `${plural(stats.validCases, 'test case')} instead of ${fmt(stats.fullCombinations)} combinations${cut ? ` (${cut} fewer)` : ''}`,
        stats.invalidCases ? `plus ${plural(stats.invalidCases, 'case')} for invalid values` : null,
      ].filter(Boolean);
      const coverage = !check
        ? `Coverage check skipped: the input is very large (${plural(stats.requiredTuples, unit)}).`
        : check.missing.length || check.violations.length
          ? `PROBLEM: the independent check found ${check.missing.length} missed and ${check.violations.length} rule-breaking case(s).`
          : `Every one of the ${plural(stats.requiredTuples, unit)} is covered (checked independently).`;
      const healthy = !check || (!check.missing.length && !check.violations.length);
      status[healthy ? 'ok' : 'error'](`${parts.join(', ')}. ${coverage}`);
    };

    const run = () => {
      notes.replaceChildren();
      current = null;
      result.replaceChildren();
      excluded.replaceChildren();
      showExport();
      let spec;
      try {
        spec = parseParameters(parameters.value);
      } catch (err) {
        return status.error(err instanceof InputError ? `Parameters: ${err.message}` : err.message);
      }
      let ruleSet;
      try {
        ruleSet = parseConstraints(rules.value, spec.parameters);
      } catch (err) {
        return status.error(err instanceof InputError ? `Rules: ${err.message}` : err.message);
      }
      status.info('Calculating…');
      setTimeout(() => {
        try {
          const generated = generate({ parameters: spec.parameters, forbidden: ruleSet.forbidden, strength: Number(strength.value), seed: Number(seed.value) || 1 });
          const check = generated.stats.requiredTuples <= VERIFY_LIMIT
            ? verify({ parameters: spec.parameters, cases: generated.cases, forbidden: ruleSet.forbidden, strength: Number(strength.value) })
            : null;
          current = generated;
          render(generated, check);
          showExport();
          for (const warning of [...spec.warnings, ...ruleSet.warnings]) notes.append(h('p', { class: 'note' }, warning));
          if (generated.stats.requestedStrength > generated.stats.strength) {
            notes.append(h('p', { class: 'note' }, `With only ${plural(spec.parameters.length, 'parameter')} a ${generated.stats.requestedStrength}-way test is the same as testing every combination, so that is what you get.`));
          }
        } catch (err) {
          status.error(err.message);
        }
      }, 10);
    };

    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 300);
    };
    parameters.addEventListener('input', later);
    rules.addEventListener('input', later);
    strength.addEventListener('change', run);
    seed.addEventListener('input', later);
    format.addEventListener('change', () => {
      showExport();
    });

    root.append(
      h('div', { class: 'two-col' }, field('Parameters and their values', parameters), field('Rules: combinations that cannot happen (optional)', rules)),
      h('div', { class: 'form-row', style: 'margin-top:.75rem' },
        field('Coverage', strength),
        field('Arrangement', seed, 'A different number gives a different, equally valid set.'),
        h('button', { onclick: () => ((seed.value = Number(seed.value) + 1), run()) }, 'Try another arrangement'),
        h('button', { onclick: () => ((parameters.value = EXAMPLE_PARAMETERS), (rules.value = EXAMPLE_RULES), (seed.value = 1), (strength.value = 2), run()) }, 'Load example'),
        h('button', { onclick: () => ((parameters.value = ''), (rules.value = ''), run()) }, 'Clear')),
      status.el,
      notes,
      result,
      excluded,
      h('h3', {}, 'Export'),
      h('div', { class: 'form-row' }, field('Format', format)),
      out.el,
      h('p', { class: 'note', id: 'pairwise-help' },
        'Why pairwise? Most bugs are caused by one value or the interaction of two, so covering every pair of values finds most of them with a small fraction of the combinations. '
        + 'Write one parameter per line as Name: value1, value2, value3. Put a value in "double quotes" if it contains a comma, and start it with ! to mark it invalid (it is then tested alone, once, with valid values everywhere else). '
        + 'Rules: "OS = iOS & Browser = Edge" means these never occur together; "IF OS = iOS THEN Browser = Safari | Chrome" lists allowed alternatives; "<>" means any other value; join items with & or an upper-case AND. '
        + 'The result is found by a seeded greedy search: the same input always gives the same cases, and the number of cases is close to, but not guaranteed to be, the smallest possible. The coverage is checked again independently after every run.'),
    );
    run();
    return () => clearTimeout(timer);
  },
};
