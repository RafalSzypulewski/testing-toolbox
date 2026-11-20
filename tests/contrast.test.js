import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reads the colour variables straight from css/style.css and checks the WCAG 2.2 contrast
// rules for the combinations the app actually uses, in both themes.
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

const variables = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
const light = variables(css.match(/:root\s*\{([^}]*)\}/)[1]);
const darkManual = variables(css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)[1]);
const darkSystem = variables(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([^}]*)\}/)[1]);
const dark = { ...light, ...darkManual };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5; // WCAG 1.4.3: normal-size text
const UI = 3; // WCAG 1.4.11: borders of form controls, focus indicators

const PAIRS = [
  ['text on the page', 'text', 'bg', TEXT], ['text on panels', 'text', 'panel', TEXT],
  ['muted text on the page', 'muted', 'bg', TEXT], ['muted text on panels', 'muted', 'panel', TEXT], ['muted text on hover rows', 'muted', 'hover', TEXT],
  ['button text on the accent colour', 'accent-text', 'accent', TEXT],
  ['links on the page', 'accent', 'bg', TEXT], ['links on panels', 'accent', 'panel', TEXT],
  ['success text on panels', 'ok', 'panel', TEXT], ['success text on the page', 'ok', 'bg', TEXT],
  ['error text on panels', 'error', 'panel', TEXT], ['error text on the page', 'error', 'bg', TEXT],
  ['text on added lines', 'text', 'add-bg', TEXT], ['text on removed lines', 'text', 'del-bg', TEXT],
  ['text on added words', 'text', 'add-strong', TEXT], ['text on removed words', 'text', 'del-strong', TEXT],
  ['muted signs on added lines', 'muted', 'add-bg', TEXT], ['muted signs on removed lines', 'muted', 'del-bg', TEXT],
  ['text box border against the page', 'control-border', 'bg', UI], ['text box border against panels', 'control-border', 'panel', UI],
  ['focus ring against the page', 'accent', 'bg', UI], ['focus ring against panels', 'accent', 'panel', UI],
];

for (const [theme, colours] of [['light', light], ['dark', dark]]) {
  test(`${theme} theme: every colour pair meets WCAG 2.2 AA contrast`, () => {
    const failures = [];
    for (const [label, fg, bg, minimum] of PAIRS) {
      assert.ok(colours[fg] && colours[bg], `${label}: variable --${fg} or --${bg} is missing`);
      const ratio = contrast(colours[fg], colours[bg]);
      if (ratio < minimum) failures.push(`${label}: ${colours[fg]} on ${colours[bg]} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
    }
    assert.deepEqual(failures, []);
  });
}

test('both copies of the dark theme (system setting and manual toggle) are identical', () => {
  assert.deepEqual(darkSystem, darkManual);
  assert.ok(Object.keys(darkManual).length >= 12);
});

test('the contrast formula agrees with known values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54'); // the classic "just passes AA" grey
});

test('font sizes are relative, so they follow the reader\'s own text-size setting', () => {
  const fixed = [...css.matchAll(/font(?:-size)?:\s*(?:[^;{}]*?\s)?(\d+(?:\.\d+)?)px/g)].map((m) => m[0]);
  assert.deepEqual(fixed, []);
});
