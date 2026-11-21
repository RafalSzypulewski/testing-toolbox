import AxeBuilder from '@axe-core/playwright';
import { tools } from '../js/registry.js';
import { test, expect, open } from './helpers.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Each tool is also checked after being used, because results, tables and highlights only
// exist then. `setup` drives the page into its busiest state.
const STATES = {
  'json-toolkit': [
    ['query', async () => {}],
    ['query error', async (p) => p.getByLabel('JSONPath query').fill('$[')],
    ['convert', async (p) => p.getByRole('tab', { name: 'Convert' }).click()],
    ['convert error', async (p) => { await p.getByRole('tab', { name: 'Convert' }).click(); await p.getByLabel('Direction').selectOption('yaml-json'); await p.getByLabel('Input').fill('a: [1'); }],
    ['compare', async (p) => p.getByRole('tab', { name: 'Compare' }).click()],
    ['validate problems', async (p) => p.getByRole('tab', { name: 'Validate' }).click()],
    ['validate valid', async (p) => { await p.getByRole('tab', { name: 'Validate' }).click(); await p.getByLabel('Data to check').fill('{"id": 1, "email": "a@b.pl", "role": "admin"}'); }],
    ['query yaml', async (p) => p.getByRole('tabpanel', { name: 'Query' }).getByLabel('Format').selectOption('yaml')],
  ],
  'counter-string': [['generated', async (p) => p.click('button.primary')]],
  'random-string': [['generated', async (p) => p.click('button.primary')]],
  'test-data': [
    ['generated', async (p) => p.click('button.primary')],
    ['validator', async (p) => p.fill('input[placeholder="Paste a value to check"]', '44051401359')],
  ],
  'text-inspector': [['with text', async (p) => p.fill('textarea', 'a😀​é\nsecond line ')]],
  'json-formatter': [
    ['formatted', async (p) => { await p.fill('textarea >> nth=0', '{"b":1,"a":[1]}'); await p.click('button.primary'); }],
    ['error', async (p) => { await p.fill('textarea >> nth=0', '{"b":'); await p.click('button.primary'); }],
  ],
  encoder: [['encoded', async (p) => { await p.fill('textarea >> nth=0', 'Zażółć'); await p.click('button:text-is("Encode")'); }]],
  'jwt-decoder': [['decoded', async (p) => p.fill('textarea', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwiZXhwIjoxfQ.sig')]],
  timestamp: [['converted', async (p) => p.fill('input[placeholder^="1700000000"]', '1700000000')]],
  'regex-tester': [
    ['matches', async (p) => { await p.selectOption('select', { label: 'ISO date with named groups' }); }],
    ['error', async (p) => p.fill('input[aria-label=Pattern]', '(')],
  ],
  'hash-calculator': [['hmac', async (p) => { await p.check('text=HMAC with secret key'); await p.fill('input[placeholder^="Secret key"]', 'key'); await p.fill('textarea', 'abc'); }]],
  'text-diff': [
    ['lines', async (p) => p.click('text=Load example')],
    ['words', async (p) => { await p.click('text=Load example'); await p.selectOption('select', 'words'); }],
  ],
  'boundary-values': [
    ['numbers tab', async (p) => p.click('.tab:text-is("Numbers")')],
    ['dates tab', async (p) => p.click('.tab:text-is("Dates and times")')],
  ],
  'file-generator': [['created', async (p) => { await p.click('button:text-is("Create file")'); await p.waitForSelector('table button'); }]],
  pairwise: [
    ['example', async (p) => p.waitForSelector('table')],
    ['error', async (p) => p.getByLabel('Parameters and their values').fill('broken')],
    ['no rules, three-way', async (p) => { await p.getByLabel('Rules: combinations that cannot happen (optional)').fill(''); await p.getByLabel('Coverage').selectOption('3'); await p.waitForSelector('table'); }],
  ],
  'text-utilities': [
    ['sorted', async (p) => { await p.locator('textarea').first().fill('b\na\nc'); await p.getByLabel('Operation').selectOption({ label: 'Sort lines alphabetically' }); }],
  ],
};

async function audit(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`);
}

for (const scheme of ['light', 'dark']) {
  test.describe(`axe: no WCAG 2.2 AA or best-practice violations (${scheme} theme)`, () => {
    test.use({ colorScheme: scheme });

    for (const id of ['', 'changelog', ...tools.map((t) => t.id)]) {
      test(id || 'home', async ({ page }) => {
        await open(page, id);
        await expect(page.locator('main h2')).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }

    for (const [id, states] of Object.entries(STATES)) {
      for (const [name, setup] of states) {
        test(`${id} (${name})`, async ({ page }) => {
          await open(page, id);
          await setup(page);
          await page.waitForTimeout(200); // debounced tools finish rendering
          expect(await audit(page)).toEqual([]);
        });
      }
    }
  });
}
