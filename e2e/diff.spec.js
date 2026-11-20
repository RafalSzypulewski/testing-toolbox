import { test, expect, open, setText, clipboard } from './helpers.js';

const A = 'textarea >> nth=0';
const B = 'textarea >> nth=1';

test.describe('Text diff', () => {
  test('the example shows changed, added and unchanged lines with inline highlights', async ({ page }) => {
    await open(page, 'text-diff');
    await expect(page.locator('.status')).toContainText('Paste two texts');
    await page.click('text=Load example');
    await expect(page.locator('.status')).toHaveText('3 changed, 1 added, 0 removed lines · 3 unchanged');
    await expect(page.locator('tr.d-change')).toHaveCount(3);
    await expect(page.locator('tr.d-insert')).toHaveCount(1);
    await expect(page.locator('tr.d-change td.b mark')).toHaveText(['31', 'Warszawa', ',']);
    await expect(page.locator('tr.d-change td.a mark')).toHaveText(['30', 'Kraków']);
  });

  test('copies a unified diff with deletions before insertions', async ({ page }) => {
    await open(page, 'text-diff');
    await page.click('text=Load example');
    await page.click('text=Copy unified diff');
    const diff = await clipboard(page);
    expect(diff.startsWith('--- text A\n+++ text B\n@@ -1,6 +1,7 @@\n')).toBe(true);
    expect(diff).toContain('-  "age": 30,\n-  "city": "Kraków",\n-  "active": true\n+  "age": 31,');
  });

  test('swap turns additions into removals', async ({ page }) => {
    await open(page, 'text-diff');
    await page.click('text=Load example');
    await page.click('text=Swap');
    await expect(page.locator('.status')).toContainText('3 changed, 0 added, 1 removed');
  });

  test('ignore options hide whitespace and case differences', async ({ page }) => {
    await open(page, 'text-diff');
    await page.fill(A, 'Hello   World\nline2');
    await page.fill(B, 'hello world\nline2');
    await expect(page.locator('.status')).toContainText('1 changed');
    await page.check('text=Ignore whitespace');
    await page.check('text=Ignore case');
    await expect(page.locator('.status')).toContainText('No differences');
  });

  test('line endings: typed text is normalised, loaded files keep CRLF and are reported', async ({ page }) => {
    await open(page, 'text-diff');
    await page.fill(A, 'a\r\nb');
    await page.fill(B, 'a\nb');
    await expect(page.locator('.status')).toContainText('No differences');
    await expect(page.locator('.note')).toHaveCount(1); // only the permanent help note
    await page.setInputFiles('input[aria-label="Load text A from a file"]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a\r\nb\r\n') });
    await page.setInputFiles('input[aria-label="Load text B from a file"]', { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('a\nb\n') });
    await expect(page.locator('.note').first()).toContainText('Line endings differ: A uses CRLF, B uses LF');
    await page.fill(A, 'edited by hand');
    await expect(page.locator('.note').first()).not.toContainText('Line endings differ');
  });

  test('HTML in the text is shown as text', async ({ page }) => {
    await open(page, 'text-diff');
    await page.fill(A, '<img src=x onerror=alert(1)>\nsame');
    await page.fill(B, '<b>x</b>\nsame');
    await expect(page.locator('table.diff')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('table.diff img, table.diff b')).toHaveCount(0);
  });

  test('"show only changes" collapses unchanged lines, and only applies in line mode', async ({ page }) => {
    await open(page, 'text-diff');
    const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    await setText(page.locator(A), big);
    await setText(page.locator(B), big.replace('line 100', 'CHANGED'));
    await expect(page.locator('table.diff tr')).toHaveCount(201); // 200 lines + the header row
    await page.check('text=Show only changes');
    await expect(page.locator('tr.d-skip')).toHaveCount(2);
    expect(await page.locator('table.diff tr').count()).toBeLessThan(20);
    await page.selectOption('select', 'words');
    await expect(page.locator('text=Show only changes')).toBeHidden();
  });

  test('word and character modes mark removed and added text', async ({ page }) => {
    await open(page, 'text-diff');
    await page.selectOption('select', 'words');
    await page.fill(A, 'the quick brown fox');
    await page.fill(B, 'the slow brown dog');
    await expect(page.locator('del')).toHaveText(['quick', 'fox']);
    await expect(page.locator('ins')).toHaveText(['slow', 'dog']);
    await page.selectOption('select', 'chars');
    await page.fill(A, 'kitten');
    await page.fill(B, 'sitting');
    await expect(page.locator('.status')).toHaveText('2 characters removed, 3 added');
  });

  test('handles thousands of lines and refuses absurd sizes politely', async ({ page }) => {
    await open(page, 'text-diff');
    const a = Array.from({ length: 5000 }, (_, i) => `row ${i} value ${i * 7}`).join('\n');
    const b = a.split('\n').filter((_, i) => i % 40 !== 0).map((l, i) => (i % 25 === 0 ? `${l} edited` : l)).join('\n');
    await setText(page.locator(A), a);
    await setText(page.locator(B), b);
    await expect(page.locator('.status')).toContainText('unchanged', { timeout: 15000 });
    await setText(page.locator(A), 'x\n'.repeat(20001));
    await setText(page.locator(B), 'y');
    await expect(page.locator('.status')).toContainText('at most 20,000 lines');
  });
});
