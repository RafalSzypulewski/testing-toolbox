import { test, expect, open, setText, clipboard, download } from './helpers.js';

const parameters = (page) => page.getByLabel('Parameters and their values');
const rules = (page) => page.getByLabel('Rules: combinations that cannot happen (optional)');
const rows = (page) => page.locator('table tr:has(td)');
const cells = async (page) => (await rows(page).evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())))).map((r) => r.slice(1));
const status = (page) => page.locator('.status');

test.describe('Pairwise generator', () => {
  test('the example gives a covered, rule-abiding set and flags the one invalid-value case', async ({ page }) => {
    await open(page, 'pairwise');
    await expect(status(page)).toContainText('14 test cases instead of 96 combinations (85% fewer), plus 1 case for invalid values');
    await expect(status(page)).toContainText('Every one of the 57 pairs is covered (checked independently)');
    await expect(rows(page)).toHaveCount(15);

    const all = await cells(page); // [Browser, OS, Language, Payment]
    for (const [browser, os] of all) {
      if (os === 'iOS') expect(browser, 'iOS only works with Safari').toBe('Safari');
      expect([browser, os]).not.toEqual(['Safari', 'Android']);
      expect([browser, os]).not.toEqual(['Edge', 'macOS']);
    }
    // exactly one row has an invalid value, and it is announced as such, not just coloured
    await expect(page.locator('.bad-value')).toHaveCount(1);
    await expect(page.locator('.bad-value')).toHaveText('invalid value: ✗ Klingon');
    await expect(page.locator('tr.row-invalid')).toHaveCount(1);
  });

  test('lists the combinations the rules exclude, so a typo in a rule shows up', async ({ page }) => {
    await open(page, 'pairwise');
    const details = page.locator('details');
    await expect(details.locator('summary')).toHaveText('5 combinations excluded by your rules');
    await details.locator('summary').click();
    const items = await details.locator('li').allTextContents();
    expect(items.sort()).toEqual([
      'Browser = Chrome  +  OS = iOS', 'Browser = Edge  +  OS = iOS', 'Browser = Edge  +  OS = macOS',
      'Browser = Firefox  +  OS = iOS', 'Browser = Safari  +  OS = Android',
    ]);
    await rules(page).fill('');
    await expect(details).toHaveCount(0);
  });

  test('the classic 3x3x3x3 example gets the optimal 9 cases', async ({ page }) => {
    await open(page, 'pairwise');
    await parameters(page).fill('A: a1, a2, a3\nB: b1, b2, b3\nC: c1, c2, c3\nD: d1, d2, d3');
    await rules(page).fill('');
    await expect(status(page)).toContainText('9 test cases instead of 81 combinations (89% fewer)');
    await expect(status(page)).toContainText('Every one of the 54 pairs is covered');
    await expect(rows(page)).toHaveCount(9);
  });

  test('the coverage level changes the number of cases', async ({ page }) => {
    await open(page, 'pairwise');
    await parameters(page).fill('A: 1, 2, 3\nB: x, y\nC: p, q, r, s');
    await rules(page).fill('');
    await expect(rows(page)).toHaveCount(12); // pairwise: 3 x 4 pairs of the two biggest parameters
    await page.getByLabel('Coverage').selectOption('1');
    await expect(rows(page)).toHaveCount(4); // each value at least once
    await expect(status(page)).toContainText('Every one of the 9 values is covered');
    await page.getByLabel('Coverage').selectOption('3');
    await expect(rows(page)).toHaveCount(24);
    await expect(status(page)).toContainText('24 test cases instead of 24 combinations');
  });

  test('"Try another arrangement" gives another valid set', async ({ page }) => {
    await open(page, 'pairwise');
    await rules(page).fill('');
    const before = await cells(page);
    await page.click('button:text-is("Try another arrangement")');
    await expect(page.getByLabel('Arrangement')).toHaveValue('2');
    await expect(status(page)).toContainText('Every one of the');
    expect(await cells(page)).not.toEqual(before);
  });

  test('mistakes are explained with line numbers and suggestions', async ({ page }) => {
    await open(page, 'pairwise');
    await parameters(page).fill('Browser Chrome, Firefox');
    await expect(status(page)).toHaveText('Parameters: Line 1: write each parameter as  Name: value1, value2, value3');
    await parameters(page).fill('Browser: Chrome, Firefox\nOS: Windows, macOS');
    await rules(page).fill('Browsr = Chrome & OS = macOS');
    await expect(status(page)).toContainText('Rules: Line 1: unknown parameter "Browsr". Did you mean "Browser"?');
    await rules(page).fill('Browser = Chrom & OS = macOS');
    await expect(status(page)).toContainText('"Chrom" is not a value of Browser. Did you mean "Chrome"?');
    await parameters(page).fill('');
    await expect(status(page)).toContainText('Parameters: Enter at least one parameter');
    await expect(rows(page)).toHaveCount(0);
  });

  test('a rule that names a parameter you removed says what the parameters are, without a wall of text', async ({ page }) => {
    await open(page, 'pairwise');
    await setText(parameters(page), Array.from({ length: 30 }, (_, i) => `P${i}: a, b`).join('\n'));
    await expect(status(page)).toContainText('Rules: Line 2: unknown parameter "OS"');
    await expect(status(page)).toContainText('P11, … (30 in all)');
    expect((await status(page).textContent()).length).toBeLessThan(300);
  });

  test('warns about repeated values and about a rule that allows everything', async ({ page }) => {
    await open(page, 'pairwise');
    await parameters(page).fill('A: x, y, x\nB: 1, 2');
    await rules(page).fill('IF A = x THEN B = 1 | 2');
    await expect(page.locator('.note', { hasText: '1 repeated value of "A" ignored' })).toBeVisible();
    await expect(page.locator('.note', { hasText: 'has no effect' })).toBeVisible();
  });

  test('refuses an input that is far too large, with advice', async ({ page }) => {
    await open(page, 'pairwise');
    const line = (i) => `P${i}: ${Array.from({ length: 50 }, (_, v) => v).join(', ')}`;
    await rules(page).fill(''); // the example's rules refer to parameters that are about to disappear
    await setText(parameters(page), Array.from({ length: 50 }, (_, i) => line(i)).join('\n'));
    await expect(status(page)).toContainText('to cover; the limit is 1,500,000');
    await expect(status(page)).toContainText('fewer parameters or values');
  });

  test('a wide input (20 parameters of 5 values) is solved and checked quickly', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, 'pairwise');
    await setText(parameters(page), Array.from({ length: 20 }, (_, i) => `P${i}: a, b, c, d, e`).join('\n'));
    await rules(page).fill('');
    await expect(status(page)).toContainText('Every one of the 4,750 pairs is covered', { timeout: 30_000 });
    expect(await rows(page).count()).toBeLessThan(80); // the product of the two biggest is 25: a good result is well under 80
  });

  test('exports as spreadsheet text, CSV, Markdown, Gherkin and JSON, and downloads with a matching name', async ({ page }) => {
    await open(page, 'pairwise');
    await expect(status(page)).toContainText('Every one of the');
    const output = page.locator('textarea[readonly]');
    await expect(output).toHaveValue(/^#\tBrowser\tOS\tLanguage\tPayment\n1\t/);

    await page.getByLabel('Format').selectOption('csv');
    await expect(output).toHaveValue(/^#,Browser,OS,Language,Payment\n1,/);
    await page.getByLabel('Format').selectOption('markdown');
    await expect(output).toHaveValue(/^\| # \| Browser \| OS \| Language \| Payment \|\n\| --- /);
    await page.getByLabel('Format').selectOption('gherkin');
    await expect(output).toHaveValue(/^Examples:\n {2}\| Browser \| OS \| Language \| Payment \|\n/);
    await page.getByLabel('Format').selectOption('json');
    expect(JSON.parse(await output.inputValue())).toHaveLength(15);

    await page.getByLabel('Format').selectOption('csv');
    await page.getByRole('button', { name: 'Copy test cases' }).click();
    expect(await clipboard(page)).toBe(await output.inputValue());
    const file = await download(page, () => page.getByRole('button', { name: 'Download test cases' }).click());
    expect(file.name).toBe('pairwise-tests.csv');
    expect(file.data.toString('utf8')).toBe(await output.inputValue());
    await page.getByLabel('Format').selectOption('markdown');
    expect((await download(page, () => page.getByRole('button', { name: 'Download test cases' }).click())).name).toBe('pairwise-tests.md');
  });

  test('Clear empties everything and Load example brings the example back', async ({ page }) => {
    await open(page, 'pairwise');
    await page.click('button:text-is("Clear")');
    await expect(status(page)).toContainText('Enter at least one parameter');
    await expect(page.locator('textarea[readonly]')).toHaveValue('');
    await page.click('button:text-is("Load example")');
    await expect(rows(page)).toHaveCount(15);
  });

  test('the result table is a labelled, keyboard-scrollable region and every header names its column', async ({ page }) => {
    await open(page, 'pairwise');
    const region = page.getByRole('region', { name: 'Generated test cases, scrollable' });
    await expect(region).toBeVisible();
    await region.focus();
    await expect(region).toBeFocused();
    await expect(page.getByRole('columnheader')).toHaveText(['#', 'Browser', 'OS', 'Language', 'Payment']);
  });
});
