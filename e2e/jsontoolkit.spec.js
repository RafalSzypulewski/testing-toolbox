import { test, expect, open, clipboard, download } from './helpers.js';

const panel = (page, name) => page.getByRole('tabpanel', { name });
const tab = (page, name) => page.getByRole('tab', { name });
const status = (page) => page.getByRole('tabpanel').locator('.status:visible');

test.describe('JSON toolkit', () => {
  test('tabs work with arrow keys and keep what was typed', async ({ page }) => {
    await open(page, 'json-toolkit');
    await expect(tab(page, 'Query')).toHaveAttribute('aria-selected', 'true');
    await tab(page, 'Query').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'Convert')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, 'Validate')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(panel(page, 'Query')).toBeVisible();
    await expect(panel(page, 'Validate')).toBeHidden();
  });

  test('query: finds the cheap books, with normalized paths, and explains errors', async ({ page }) => {
    await open(page, 'json-toolkit');
    const p = panel(page, 'Query');
    await expect(status(page)).toHaveText('2 matches.');
    const rows = await p.locator('table tr:has(td)').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
    expect(rows).toEqual([['1', "$['store']['book'][0]['title']", '"Sayings of the Century"'], ['3', "$['store']['book'][2]['title']", '"Moby Dick"']].map((r, i) => [String(i + 1), r[1], r[2]]));
    await p.getByRole('button', { name: 'Copy paths' }).click();
    expect(await clipboard(page)).toBe("$['store']['book'][0]['title']\n$['store']['book'][2]['title']");

    await p.getByLabel('JSONPath query').fill('$.store.book[?@.price <');
    await expect(status(page)).toContainText('Query:');
    await p.getByLabel('Text to search').fill('{"a":');
    await expect(status(page)).toContainText('JSON:');
  });

  test('convert: all four directions, and a download named for the format', async ({ page }) => {
    await open(page, 'json-toolkit');
    await tab(page, 'Convert').click();
    const p = panel(page, 'Convert');
    const out = p.getByRole('textbox', { name: 'Converted' });
    await expect(out).toHaveValue('name,city.name,tags\nAnna,Gdańsk,"[""qa"",""dev""]"\nPiotr,Łódź,[]');
    const file = await download(page, () => p.getByRole('button', { name: 'Download converted' }).click());
    expect(file.name).toBe('converted.csv');

    await p.getByLabel('Direction').selectOption('csv-json');
    expect(JSON.parse(await out.inputValue())).toEqual([{ name: 'Anna', 'city.name': 'Gdańsk', age: 31 }, { name: 'Piotr', 'city.name': 'Łódź', age: '' }]);
    await p.getByLabel('Rebuild objects from dotted columns').check();
    expect(JSON.parse(await out.inputValue())[0].city).toEqual({ name: 'Gdańsk' });

    await p.getByLabel('Direction').selectOption('json-yaml');
    await expect(out).toHaveValue('name: Anna\ntags:\n  - qa\n  - dev\naddress:\n  city: Gdańsk\n');
    await p.getByLabel('Direction').selectOption('yaml-json');
    expect(JSON.parse(await out.inputValue())).toEqual({ name: 'Anna', tags: ['qa', 'dev'], address: { city: 'Gdańsk' } });

    await p.getByLabel('Input').fill('a: 1\n---\nb: 2\n');
    await expect(out).toHaveValue(JSON.stringify([{ a: 1 }, { b: 2 }], null, 2));
    await expect(p.locator('.note').first()).toContainText('2 YAML documents');
    await p.getByLabel('Input').fill('a: [1, 2');
    await expect(status(page)).toHaveClass(/error/);
  });

  test('compare: lists differences with text labels, and options change the result', async ({ page }) => {
    await open(page, 'json-toolkit');
    await tab(page, 'Compare').click();
    const p = panel(page, 'Compare');
    await expect(status(page)).toContainText('3 differences: 0 added, 1 removed, 2 changed, 0 changed type.');
    const rows = await p.locator('table tr:has(td)').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
    expect(rows.map((r) => r[0].replace(/^\S\s/, ''))).toEqual(['Changed', 'Removed', 'Changed']);
    expect(rows[0].slice(1)).toEqual(["$['store']['book'][0]['price']", '8.95', '9.95']);

    await p.getByLabel('Ignore these paths').fill('$..price');
    await expect(status(page)).toContainText('2 differences');
    await p.getByLabel('Left JSON').fill('{"a":1}');
    await p.getByLabel('Right JSON').fill('{"a":1.05}');
    await p.getByLabel('Ignore these paths').fill('');
    await expect(status(page)).toContainText('1 difference:');
    await p.getByLabel('Number tolerance').fill('0.1');
    await expect(status(page)).toHaveText('No differences: the two documents are the same.');
    await p.getByLabel('Right JSON').fill('{"a":');
    await expect(status(page)).toContainText('Right JSON:');
  });

  test('query: the same search works on YAML, with a sample swap and a YAML error', async ({ page }) => {
    await open(page, 'json-toolkit');
    const p = panel(page, 'Query');
    await p.getByLabel('Format').selectOption('yaml');
    await expect(p.getByLabel('Text to search')).toHaveValue(/^store:/);
    await expect(status(page)).toHaveText('2 matches.');
    const paths = await p.locator('table tr:has(td) td:nth-child(2)').allTextContents();
    expect(paths).toEqual(["$['store']['book'][0]['title']", "$['store']['book'][2]['title']"]);
    await p.getByLabel('Text to search').fill('a: [1, 2');
    await expect(status(page)).toContainText('YAML:');
    await p.getByLabel('Text to search').fill('a: 1\n---\na: 2');
    await p.getByLabel('JSONPath query').fill('$[*].a');
    await expect(status(page)).toHaveText('2 matches.');
    await expect(p.locator('.note').first()).toContainText('2 YAML documents');
    await p.getByLabel('Format').selectOption('json');
    await expect(status(page)).toContainText('JSON:'); // the YAML text is not JSON
  });

  test('validate: lists every problem with its path and rule, and goes green when fixed', async ({ page }) => {
    await open(page, 'json-toolkit');
    await tab(page, 'Validate').click();
    const p = panel(page, 'Validate');
    await expect(status(page)).toHaveText('Not valid: 5 problems.');
    const rows = await p.locator('table tr:has(td)').evaluateAll((trs) => trs.map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent]));
    expect(rows).toEqual([["$['id']", 'minimum'], ["$['email']", 'format'], ["$['role']", 'enum'], ["$['tags']", 'uniqueItems'], ["$['age']", 'additionalProperties']]);
    await p.getByLabel('Check formats').uncheck();
    await expect(status(page)).toHaveText('Not valid: 4 problems.');
    await p.getByLabel('Data to check').fill('{"id": 1, "email": "a@b.pl", "role": "admin"}');
    await expect(status(page)).toHaveText('Valid: the data satisfies the schema.');
    await p.getByLabel('Data format').selectOption('yaml');
    await p.getByLabel('Data to check').fill("id: '1'\nemail: a@b.pl\nrole: admin");
    await expect(status(page)).toHaveText('Not valid: 1 problem.'); // a quoted YAML scalar stays text
    await expect(p.locator('table tr:has(td)')).toContainText("$['id']");
  });

  test('validate: schema in YAML, anyOf reasons, unsupported keywords and bad schemas are explained', async ({ page }) => {
    await open(page, 'json-toolkit');
    await tab(page, 'Validate').click();
    const p = panel(page, 'Validate');
    await p.getByLabel('Schema format').selectOption('yaml');
    await p.getByLabel('JSON Schema').fill('anyOf:\n  - type: string\n  - type: integer\n    minimum: 10\n');
    await p.getByLabel('Data format').selectOption('yaml');
    await p.getByLabel('Data to check').fill('5');
    await expect(status(page)).toHaveText('Not valid: 1 problem.');
    await expect(p.locator('table li')).toHaveCount(2);
    await p.getByLabel('JSON Schema').fill('unevaluatedProperties: false');
    await expect(status(page)).toHaveText('Valid: the data satisfies the schema.');
    await expect(p.locator('.note').first()).toContainText('unevaluatedProperties');
    await p.getByLabel('JSON Schema').fill('$ref: "#/$defs/nope"');
    await expect(status(page)).toContainText('Schema:');
    await p.getByLabel('JSON Schema').fill('type: [');
    await expect(status(page)).toContainText('Schema:');
  });
});
