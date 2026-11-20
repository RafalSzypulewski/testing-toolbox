import { spawnSync } from 'node:child_process';
import { test, expect, open, hasCommand, download } from './helpers.js';

const create = (page) => page.click('button:text-is("Create file")');
const set = async (page, value, unit, format) => {
  await page.fill('input[type=number]', String(value));
  await page.selectOption('select >> nth=0', unit);
  await page.selectOption('select >> nth=1', format);
};
const saveRow = (page, row) => download(page, () => page.click(`table tr:nth-child(${row + 1}) button`));

test.describe('File generator', () => {
  test('shows the exact byte count and the smallest possible size per format', async ({ page }) => {
    await open(page, 'file-generator');
    await expect(page.locator('p.muted').first()).toHaveText('= 5,242,880 bytes');
    await expect(page.locator('text=Image dimensions')).toBeHidden();
    await page.selectOption('select >> nth=0', 'KB');
    await expect(page.locator('p.muted').first()).toHaveText('= 5,000 bytes');
    await set(page, 1, 'KiB', 'pdf');
    await expect(page.locator('p.muted').nth(1)).toContainText('Smallest possible PDF document: 6');
    await set(page, 1, 'KiB', 'png');
    await expect(page.locator('text=Image dimensions')).toBeVisible();
    await page.click('.chip:text-is("10 MiB")');
    await expect(page.locator('p.muted').first()).toHaveText('= 10,485,760 bytes');
  });

  test('a text file of 5 MiB downloads with the right name, size and final line break', async ({ page }) => {
    await open(page, 'file-generator');
    await create(page);
    await expect(page.locator('table tr:nth-child(2) td').first()).toHaveText('testfile-5MiB.txt');
    const file = await saveRow(page, 1);
    expect(file.name).toBe('testfile-5MiB.txt');
    expect(file.data.length).toBe(5 * 1024 * 1024);
    expect(file.data.at(-1)).toBe(10);
  });

  test('size -1 / size / size +1 mode makes three valid JSON files', async ({ page }) => {
    await open(page, 'file-generator');
    await set(page, 1, 'KiB', 'json');
    await page.check('text=Also create the files 1 byte smaller');
    await create(page);
    await expect(page.locator('table tr')).toHaveCount(4);
    const sizes = [];
    for (const row of [1, 2, 3]) {
      const file = await saveRow(page, row);
      sizes.push(file.data.length);
      expect(Array.isArray(JSON.parse(file.data.toString('utf8')))).toBe(true);
    }
    expect(sizes).toEqual([1023, 1024, 1025]);
  });

  test('random bytes use every byte value and zero files are all zero', async ({ page }) => {
    await open(page, 'file-generator');
    await set(page, 1, 'MiB', 'random');
    await create(page);
    const random = await saveRow(page, 1);
    expect(random.data.length).toBe(1_048_576);
    expect(new Set(random.data.subarray(0, 100_000)).size).toBe(256);
    await set(page, 100, 'KiB', 'zeros');
    await create(page);
    await expect(page.locator('table tr:nth-child(2) td').first()).toHaveText('testfile-100KiB.bin');
    expect((await saveRow(page, 1)).data.every((b) => b === 0)).toBe(true);
  });

  test('explains sizes that cannot be made', async ({ page }) => {
    await open(page, 'file-generator');
    await set(page, 70, 'B', 'png');
    await page.selectOption('select >> nth=2', '1x1');
    await create(page);
    await expect(page.locator('table .error')).toContainText('nothing in between');
    await set(page, 10, 'B', 'pdf');
    await create(page);
    await expect(page.locator('table .error')).toContainText('smallest PDF');
    await set(page, 101, 'MiB', 'txt');
    await create(page);
    await expect(page.locator('.status')).toContainText('limited to');
    await page.fill('input[type=number]', '0');
    await create(page);
    await expect(page.locator('.status')).toContainText('greater than zero');
    await set(page, 0.5, 'B', 'txt');
    await create(page);
    await expect(page.locator('.status')).toContainText('whole number');
  });

  test('the largest allowed file (100 MiB) can be made and downloaded', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 'file-generator');
    await set(page, 100, 'MiB', 'zeros');
    await create(page);
    await expect(page.locator('table tr:nth-child(2) td').first()).toHaveText('testfile-100MiB.bin', { timeout: 60_000 });
    const file = await saveRow(page, 1);
    expect(file.data.length).toBe(104_857_600);
  });

  test('a PDF made in the browser opens in poppler without warnings', async ({ page }) => {
    test.skip(!hasCommand('pdfinfo'), 'pdfinfo (poppler-utils) is not installed');
    await open(page, 'file-generator');
    await set(page, 1, 'MiB', 'pdf');
    await create(page);
    const file = await saveRow(page, 1);
    const result = spawnSync('pdfinfo', [file.path], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/Pages:\s+1/);
    expect(result.stdout).toMatch(/File size:\s+1048576 bytes/);
  });

  test('a PNG made in the browser decodes in ImageMagick', async ({ page }) => {
    test.skip(!hasCommand('identify'), 'identify (ImageMagick) is not installed');
    await open(page, 'file-generator');
    await set(page, 2, 'MiB', 'png');
    await page.selectOption('select >> nth=2', '800x600');
    await create(page);
    const file = await saveRow(page, 1);
    expect(file.data.length).toBe(2 * 1024 * 1024);
    const result = spawnSync('identify', ['-regard-warnings', file.path], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PNG 800x600');
  });
});
