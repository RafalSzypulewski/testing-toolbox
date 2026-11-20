import { test, expect, open, setText, clipboard, download } from './helpers.js';

const input = (page) => page.locator('textarea').first();
const result = (page) => page.locator('textarea[readonly]');
const operation = (page, label) => page.getByLabel('Operation').selectOption({ label });

test.describe('Text utilities', () => {
  test('uppercase is the default and the status shows lines and characters before and after', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('zażółć gęślą\nhello World');
    await expect(result(page)).toHaveValue('ZAŻÓŁĆ GĘŚLĄ\nHELLO WORLD');
    await expect(page.locator('.status')).toHaveText('2 lines → 2 lines · 24 → 24 characters');
  });

  test('programming cases work per line', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('HTTPServer\nhello_world-foo bar');
    await operation(page, 'snake_case (per line)');
    await expect(result(page)).toHaveValue('http_server\nhello_world_foo_bar');
    await operation(page, 'camelCase (per line)');
    await expect(result(page)).toHaveValue('httpServer\nhelloWorldFooBar');
  });

  test('sorting is natural, has live options, and follows the chosen language', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('item 10\nItem 2\nitem 1\nbanana\nApple\nbanana');
    await operation(page, 'Sort lines alphabetically');
    await expect(result(page)).toHaveValue('Apple\nbanana\nbanana\nitem 1\nItem 2\nitem 10');
    await expect(page.locator('select')).toHaveCount(3); // operation, order, language
    await page.locator('select').nth(1).selectOption('desc');
    await expect(result(page)).toHaveValue(/^item 10/);
    await page.locator('select').nth(1).selectOption('asc');

    await input(page).fill('Zażółć\nżaba\nzebra\nłódka\nlampa');
    await page.locator('select').nth(2).selectOption('pl');
    await expect(result(page)).toHaveValue('lampa\nłódka\nZażółć\nzebra\nżaba'); // in Polish ż comes after z
    await page.locator('select').nth(2).selectOption('en');
    await expect(result(page)).toHaveValue('lampa\nłódka\nżaba\nZażółć\nzebra'); // in English ż sorts like z
  });

  test('steps can be chained with "Use result as input"', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('b\na\nb\nc\na');
    await operation(page, 'Sort lines alphabetically');
    await page.click('button:text-is("↑ Use result as input")');
    await operation(page, 'Remove duplicate lines (keep first)');
    await expect(result(page)).toHaveValue('a\nb\nc');
  });

  test('join with quotes makes an SQL list; numbering can be padded', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('a\nb\n\nc\n');
    await operation(page, 'Join lines into one line');
    await page.locator('select').nth(1).selectOption("'");
    await page.fill('input[type=text]', ',');
    await expect(result(page)).toHaveValue("'a','b','c'");
    await operation(page, 'Add line numbers');
    await page.check('text=Pad with zeros');
    await page.fill('input[type=number]', '8');
    await expect(result(page)).toHaveValue('08. a\n09. b\n10. \n11. c\n');
  });

  test('extracts unique email addresses', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('tom@example.com, ann@test.org and tom@example.com');
    await operation(page, 'Extract email addresses');
    await expect(result(page)).toHaveValue('tom@example.com\nann@test.org');
  });

  test('an invalid regular expression gives a message and no stale result', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('a\nb');
    await operation(page, 'Keep or remove lines containing text');
    await page.fill('input[type=text]', '(');
    await page.check('text=Text is a regular expression');
    await expect(page.locator('.status')).toContainText('Invalid regular expression');
    await expect(result(page)).toHaveValue('');
  });

  test('CRLF survives: the download contains real carriage returns', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('one\ntwo\nthree');
    await operation(page, 'Convert line endings');
    await page.locator('select').nth(1).selectOption('crlf');
    await expect(page.locator('.status')).toContainText('3 lines');
    const file = await download(page, () => page.click('button:text-is("Download")'));
    expect(file.data.toString('latin1')).toBe('one\r\ntwo\r\nthree');
    await page.click('button:text-is("Copy")');
    expect((await clipboard(page)).replace(/\r/g, '')).toBe('one\ntwo\nthree');
  });

  test('HTML in the text is not interpreted', async ({ page }) => {
    await open(page, 'text-utilities');
    await input(page).fill('<img src=x onerror=alert(1)>');
    await expect(result(page)).toHaveValue('<IMG SRC=X ONERROR=ALERT(1)>');
    await expect(page.locator('main img')).toHaveCount(0);
  });

  test('sorts 100,000 lines correctly', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, 'text-utilities');
    await operation(page, 'Sort lines alphabetically');
    await setText(input(page), Array.from({ length: 100_000 }, (_, i) => `row ${(i * 7919) % 100_000}`).join('\n'));
    await expect(page.locator('.status')).toContainText('100,000 lines', { timeout: 30_000 });
    expect((await result(page).inputValue()).startsWith('row 0\nrow 1\nrow 2\nrow 3')).toBe(true);
  });
});
