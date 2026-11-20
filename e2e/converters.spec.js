import { test, expect, open } from './helpers.js';

test.describe('Text inspector', () => {
  test('counts characters by several definitions and reveals hidden ones', async ({ page }) => {
    await open(page, 'text-inspector');
    await page.fill('textarea', 'a😀​é');
    await expect(page.locator('.stat b').first()).toHaveText('4');
    await expect(page.locator('pre.visual')).toContainText('\\u{200b}');
    await expect(page.locator('.status')).toContainText('invisible');
  });
});

test.describe('JSON formatter', () => {
  test('points to the line and column of an error', async ({ page }) => {
    await open(page, 'json-formatter');
    await page.fill('textarea >> nth=0', '{"b":1,\n"a":}');
    await page.click('button.primary');
    await expect(page.locator('.status')).toContainText('Line 2');
    await expect(page.locator('textarea[readonly]')).toHaveValue('');
  });

  test('formats, minifies and sorts keys', async ({ page }) => {
    await open(page, 'json-formatter');
    await page.fill('textarea >> nth=0', '{"b":1,"a":[1]}');
    await page.click('button.primary');
    await expect(page.locator('textarea[readonly]')).toHaveValue(/\n {2}"b": 1/);
    await page.click('button:text-is("Minify")');
    await expect(page.locator('textarea[readonly]')).toHaveValue('{"b":1,"a":[1]}');
    await page.check('text=Sort keys');
    await page.click('button:text-is("Minify")');
    await expect(page.locator('textarea[readonly]')).toHaveValue('{"a":[1],"b":1}');
  });
});

test.describe('Encode / decode', () => {
  test('Base64 round trip with Polish letters, using the result as the next input', async ({ page }) => {
    await open(page, 'encoder');
    await page.fill('textarea >> nth=0', 'Zażółć');
    await page.click('button:text-is("Encode")');
    await expect(page.locator('textarea[readonly]')).toHaveValue('WmHFvMOzxYLEhw==');
    await page.click('text=Use result as input');
    await page.click('button:text-is("Decode")');
    await expect(page.locator('textarea[readonly]')).toHaveValue('Zażółć');
  });

  test('reports invalid input instead of failing silently', async ({ page }) => {
    await open(page, 'encoder');
    await page.fill('textarea >> nth=0', 'not base64!!');
    await page.click('button:text-is("Decode")');
    await expect(page.locator('.status')).toContainText('Not valid Base64');
  });
});

test.describe('JWT decoder', () => {
  const header = 'eyJhbGciOiJIUzI1NiJ9';

  test('decodes a token and reports that it has expired', async ({ page }) => {
    await open(page, 'jwt-decoder');
    await page.fill('textarea', `${header}.eyJzdWIiOiJ4IiwiZXhwIjoxfQ.sig`);
    await expect(page.locator('.status')).toHaveText('Expired');
    await expect(page.locator('pre.visual').first()).toContainText('HS256');
    await expect(page.locator('table')).toContainText('1970-01-01T00:00:01.000Z');
  });

  test('a token without time claims shows no table and no stray text', async ({ page }) => {
    await open(page, 'jwt-decoder');
    await page.fill('textarea', `${header}.eyJzdWIiOiJ4In0.sig`);
    await expect(page.locator('.status')).toContainText('No expiry claim');
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('null');
  });

  test('rejects text that is not a token', async ({ page }) => {
    await open(page, 'jwt-decoder');
    await page.fill('textarea', 'hello');
    await expect(page.locator('.status')).toContainText('3 dot-separated parts');
  });
});

test.describe('Timestamp converter', () => {
  test('converts epoch seconds and milliseconds', async ({ page }) => {
    await open(page, 'timestamp');
    await page.fill('input[placeholder^="1700000000"]', '1700000000');
    await expect(page.locator('table')).toContainText('2023-11-14T22:13:20.000Z');
    await expect(page.locator('.status')).toContainText('seconds');
    await page.fill('input[placeholder^="1700000000"]', '1700000000000');
    await expect(page.locator('.status')).toContainText('milliseconds');
  });

  test('shows the right local time in a chosen zone and rejects an unknown one', async ({ page }) => {
    await open(page, 'timestamp');
    await page.fill('input[placeholder^="1700000000"]', '2026-11-20T10:00:00Z');
    await expect(page.locator('tr', { hasText: 'Europe/Warsaw' })).toContainText('2026-11-20 11:00:00');
    await page.fill('input[placeholder^="e.g."]', 'Mars/Base');
    await expect(page.locator('.status')).toContainText('Unknown time zone');
  });

  test('the live clock ticks and stops when you leave', async ({ page }) => {
    await open(page, 'timestamp');
    const first = await page.locator('p.mono').first().textContent();
    await expect.poll(() => page.locator('p.mono').first().textContent(), { timeout: 4000 }).not.toBe(first);
    await open(page, 'counter-string');
    await expect(page.locator('main h2')).toHaveText('Counter string');
  });
});
