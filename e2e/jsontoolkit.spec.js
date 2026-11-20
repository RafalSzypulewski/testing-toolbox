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
    await expect(tab(page, 'Compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(panel(page, 'Query')).toBeVisible();
    await expect(panel(page, 'Compare')).toBeHidden();
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
    await p.getByLabel('JSON to search').fill('{"a":');
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
});
