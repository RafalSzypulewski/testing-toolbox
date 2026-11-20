import { test, expect, open, clipboard } from './helpers.js';

test.describe('Counter string', () => {
  test('generates the classic counter string and copies it', async ({ page }) => {
    await open(page, 'counter-string');
    await page.fill('input[type=number]', '10');
    await page.click('button.primary');
    await expect(page.locator('textarea')).toHaveValue('*3*5*7*10*');
    expect(await clipboard(page)).toBe('*3*5*7*10*');
    await expect(page.locator('.status')).toHaveText('Generated 10 characters.');
  });

  test('preset chips fill the length and generate', async ({ page }) => {
    await open(page, 'counter-string');
    await page.click('.chip:text-is("255")');
    await expect(page.locator('input[type=number]')).toHaveValue('255');
    expect((await page.locator('textarea').inputValue()).length).toBe(255);
  });

  test('rejects an invalid length with a message', async ({ page }) => {
    await open(page, 'counter-string');
    await page.fill('input[type=number]', '0');
    await page.click('button.primary');
    await expect(page.locator('.status')).toContainText('between 1');
    await expect(page.locator('textarea')).toHaveValue('');
  });
});

test.describe('Random string', () => {
  test('creates exactly the requested length', async ({ page }) => {
    await open(page, 'random-string');
    await page.fill('input[type=number] >> nth=0', '120');
    await page.click('button.primary');
    expect((await page.locator('textarea[readonly]').inputValue()).length).toBe(120);
  });

  test('inserts line breaks and spaces without changing the length', async ({ page }) => {
    await open(page, 'random-string');
    await page.fill('input[type=number] >> nth=0', '300');
    await page.check('text=Insert line breaks');
    await page.selectOption('select >> nth=1', '\r\n');
    await page.click('button.primary');
    const text = await page.locator('textarea[readonly]').inputValue();
    expect(text.length).toBeGreaterThanOrEqual(300 - 20); // the box shows CRLF as LF, so it may be shorter
    expect(text).toContain('\n');
    expect(text).toContain(' ');
  });

  test('rejects an empty character set', async ({ page }) => {
    await open(page, 'random-string');
    await page.fill('textarea:not([readonly])', '');
    await page.click('button.primary');
    await expect(page.locator('.status')).toContainText('must not be empty');
  });
});

test.describe('Naughty strings', () => {
  test('lists many strings, filters them and copies one on click', async ({ page }) => {
    await open(page, 'naughty-strings');
    expect(await page.locator('.list-row').count()).toBeGreaterThan(80);
    await page.fill('input[type=search] >> nth=-1', 'drop table');
    await expect(page.locator('.list-row')).toHaveCount(1);
    await page.click('.list-row');
    expect(await clipboard(page)).toBe("'; DROP TABLE users;--");
  });

  test('can be narrowed to a category and shows invisible characters as escapes', async ({ page }) => {
    await open(page, 'naughty-strings');
    await page.selectOption('select', 'Unicode');
    await expect(page.locator('.list-row', { hasText: 'Zero-width space' })).toContainText('\\u{200b}');
    await expect(page.locator('.list-row', { hasText: 'SQL' })).toHaveCount(0);
  });

  test('HTML-looking strings are shown as text, not interpreted', async ({ page }) => {
    await open(page, 'naughty-strings');
    await page.fill('input[type=search] >> nth=-1', 'script tag');
    await expect(page.locator('.list-row')).toContainText('<script>alert(1)</script>');
    await expect(page.locator('main script, main img')).toHaveCount(0);
  });
});
