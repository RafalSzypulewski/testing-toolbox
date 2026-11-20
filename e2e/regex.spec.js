import { test, expect, open, clipboard } from './helpers.js';

const pattern = 'input[aria-label=Pattern]';

test.describe('Regex tester', () => {
  test('highlights matches and lists groups and the replace preview', async ({ page }) => {
    await open(page, 'regex-tester');
    await expect(page.locator('.status')).toContainText('Enter a pattern');
    await page.fill(pattern, '(\\d+)-(\\w+)');
    await page.fill('textarea', 'ab 12-x and 7-yz');
    await expect(page.locator('.status')).toHaveText('2 matches.');
    await expect(page.locator('mark')).toHaveCount(2);
    await expect(page.locator('table td.mono').nth(1)).toContainText('$1 = "12"');
    await page.fill('input[placeholder^="e.g. $2"]', '$2:$1');
    await expect(page.locator('pre.visual').last()).toHaveText('ab x:12 and yz:7');
  });

  test('shows the engine message for an invalid pattern and clears old results', async ({ page }) => {
    await open(page, 'regex-tester');
    await page.fill(pattern, 'a');
    await page.fill('textarea', 'aaa');
    await expect(page.locator('table')).toHaveCount(1);
    await page.fill(pattern, '(');
    await expect(page.locator('.status')).toContainText('Invalid regular expression');
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('text that looks like HTML is shown as text', async ({ page }) => {
    await open(page, 'regex-tester');
    await page.fill(pattern, 'b');
    await page.fill('textarea', '<img src=x onerror=alert(1)><b>b</b>');
    await expect(page.locator('pre.visual img, pre.visual b')).toHaveCount(0);
    await expect(page.locator('mark')).toHaveCount(3);
  });

  test('flags change the result', async ({ page }) => {
    await open(page, 'regex-tester');
    await page.fill(pattern, 'B');
    await page.fill('textarea', 'bb');
    await expect(page.locator('.status')).toHaveText('No matches.');
    await page.check('text=i (ignore case)');
    await expect(page.locator('.status')).toHaveText('2 matches.');
  });

  test('ready-made patterns fill pattern, flags and sample; the literal can be copied', async ({ page }) => {
    await open(page, 'regex-tester');
    await page.selectOption('select', { label: 'PESEL (11 digits)' });
    await expect(page.locator('.status')).toHaveText('1 match.');
    await expect(page.locator(pattern)).toHaveValue('\\b\\d{11}\\b');
    await page.click('button:text-is("Copy as /pattern/flags")');
    expect(await clipboard(page)).toBe('/\\b\\d{11}\\b/g');
    await page.click('button:text-is("Copy as quoted string")');
    expect(await clipboard(page)).toBe('"\\\\b\\\\d{11}\\\\b"');
  });

  test('caps the number of matches and rows, and never hangs on empty matches', async ({ page }) => {
    await open(page, 'regex-tester');
    await page.fill(pattern, 'a');
    await page.locator('textarea').evaluate((el) => { el.value = 'a'.repeat(1500); el.dispatchEvent(new Event('input')); });
    await expect(page.locator('.status')).toContainText('stopped at the limit');
    await expect(page.locator('table tr')).toHaveCount(201);
    await page.fill(pattern, 'a*');
    await page.fill('textarea', 'x');
    await expect(page.locator('.status')).toContainText('matches');
  });
});
