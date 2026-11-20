import { createHash } from 'node:crypto';
import { test, expect, open, clipboard } from './helpers.js';

const cell = (page, algo) => page.locator(`table tr:has(td:text-is("${algo}")) td.mono`);

test.describe('Hash calculator', () => {
  test('hashes the empty text straight away and text as you type', async ({ page }) => {
    await open(page, 'hash-calculator');
    await expect(cell(page, 'MD5')).toHaveText('d41d8cd98f00b204e9800998ecf8427e');
    await expect(cell(page, 'SHA-256')).toHaveText('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    await page.fill('textarea', 'abc');
    await expect(cell(page, 'MD5')).toHaveText('900150983cd24fb0d6963f7d28e17f72');
    await expect(cell(page, 'SHA-256')).toHaveText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('output can be uppercase hex or Base64, and each value can be copied', async ({ page }) => {
    await open(page, 'hash-calculator');
    await page.fill('textarea', 'abc');
    await page.selectOption('select', 'HEX');
    await expect(cell(page, 'SHA-1')).toHaveText('A9993E364706816ABA3E25717850C26C9CD0D89D');
    await page.selectOption('select', 'base64');
    await expect(cell(page, 'SHA-256')).toHaveText('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    await page.locator('table tr:has(td:text-is("SHA-256")) button').click();
    expect(await clipboard(page)).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });

  test('HMAC needs the checkbox and matches the published vector', async ({ page }) => {
    await open(page, 'hash-calculator');
    await page.fill('textarea', 'The quick brown fox jumps over the lazy dog');
    await expect(page.locator('input[placeholder^="Secret key"]')).toBeDisabled();
    await page.check('text=HMAC with secret key');
    await page.fill('input[placeholder^="Secret key"]', 'key');
    await expect(page.locator('th:nth-child(2)')).toHaveText('HMAC');
    await expect(cell(page, 'SHA-256')).toHaveText('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  test('the comparer recognises a pasted checksum in several formats', async ({ page }) => {
    await open(page, 'hash-calculator');
    await page.fill('textarea', 'abc');
    const compare = page.locator('input[placeholder^="Paste a checksum"]');
    const status = page.locator('.status').last();
    await compare.fill('SHA256: BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
    await expect(status).toHaveText('Match: SHA-256.');
    await compare.fill('deadbeef');
    await expect(status).toContainText('No match');
  });

  test('hashes a file in the browser and matches Node, for a large file too', async ({ page }) => {
    await open(page, 'hash-calculator');
    const buffer = Buffer.alloc(5 * 1024 * 1024, 7);
    await page.setInputFiles('input[type=file]', { name: 'big.bin', mimeType: 'application/octet-stream', buffer });
    await expect(page.locator('.status').first()).toContainText('big.bin');
    for (const [label, algo] of [['MD5', 'md5'], ['SHA-1', 'sha1'], ['SHA-512', 'sha512']]) {
      await expect(cell(page, label)).toHaveText(createHash(algo).update(buffer).digest('hex'));
    }
    await page.fill('textarea', 'abc'); // typing switches back to text mode
    await expect(cell(page, 'MD5')).toHaveText('900150983cd24fb0d6963f7d28e17f72');
  });
});
