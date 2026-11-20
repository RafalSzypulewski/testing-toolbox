import { tools } from '../js/registry.js';
import { test, expect, open } from './helpers.js';

test.describe('page structure', () => {
  for (const id of ['', 'changelog', ...tools.map((t) => t.id)]) {
    test(`${id || 'home'}: one h1, one main, labelled navigation, headings never skip a level`, async ({ page }) => {
      await open(page, id);
      await expect(page.locator('main h2')).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Tools' })).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const levels = await page.$$eval('h1,h2,h3,h4,h5,h6', (hs) => hs.map((h) => Number(h.tagName[1])));
      expect(levels[0]).toBe(1);
      levels.forEach((level, i) => i && expect(level, `heading ${i + 1} follows level ${levels[i - 1]}`).toBeLessThanOrEqual(levels[i - 1] + 1));
    });
  }

  test('the tool list is announced as named groups', async ({ page }) => {
    await open(page, 'counter-string');
    for (const group of ['Generate', 'Inspect', 'Convert']) {
      const section = page.getByRole('group', { name: group });
      await expect(section).toHaveCount(1);
      await expect(section.getByRole('link').first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Counter string', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('the nav groups stay in sync with the search', async ({ page }) => {
    await open(page, 'counter-string');
    await page.fill('#search', 'hash');
    await expect(page.getByRole('group', { name: 'Convert' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Generate' })).toHaveCount(0);
  });
});

test.describe('buttons that repeat in a table can be told apart', () => {
  const names = (page) => page.locator('table button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()));
  const expectDistinct = async (page) => {
    const all = await names(page);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((n) => n.length > 0 && n !== 'Copy' && n !== 'Download')).toBe(true);
    expect(new Set(all).size, JSON.stringify(all)).toBe(all.length);
  };

  test('hash calculator', async ({ page }) => {
    await open(page, 'hash-calculator');
    await page.fill('textarea', 'abc');
    await expectDistinct(page);
    await expect(page.getByRole('button', { name: 'Copy SHA-256 hash' })).toBeVisible();
  });

  test('timestamp converter', async ({ page }) => {
    await open(page, 'timestamp');
    await page.fill('input[placeholder^="1700000000"]', '1700000000');
    await expectDistinct(page);
  });

  test('boundary values, every table on every tab', async ({ page }) => {
    await open(page, 'boundary-values');
    for (const tab of ['Text length', 'Numbers', 'Dates and times']) {
      await page.getByRole('tab', { name: tab }).click();
      for (const table of await page.locator('[role=tabpanel] table').all()) {
        const labels = await table.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
        expect(labels.every((l) => l && l.startsWith('Copy ') && l.length > 5), `${tab}: ${labels}`).toBe(true);
        expect(new Set(labels).size, `${tab}: ${labels}`).toBe(labels.length);
      }
    }
    await page.getByRole('tab', { name: 'Dates and times' }).click();
    await expect(page.getByRole('button', { name: 'Copy Europe (e.g. Warsaw), Clocks go forward: 02:30 does not exist' })).toBeVisible();
  });

  test('file generator download buttons name their file', async ({ page }) => {
    await open(page, 'file-generator');
    await page.check('text=Also create the files 1 byte smaller');
    await page.click('button:text-is("Create file")');
    await page.waitForSelector('table button');
    await expect(page.getByRole('button', { name: 'Download testfile-5MiB.txt', exact: true })).toBeVisible();
    await expectDistinct(page);
  });

  test('output boxes name what they copy and download', async ({ page }) => {
    await open(page, 'counter-string');
    await expect(page.getByRole('button', { name: 'Copy counter string' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download counter string' })).toBeVisible();
  });
});

test.describe('tables', () => {
  test('column headers say which column they head and none is empty', async ({ page }) => {
    for (const [id, setup] of [
      ['hash-calculator', (p) => p.fill('textarea', 'abc')],
      ['timestamp', (p) => p.fill('input[placeholder^="1700000000"]', '1700000000')],
      ['regex-tester', (p) => p.selectOption('select', { label: 'Email address' })],
    ]) {
      await open(page, id);
      await setup(page);
      const headers = await page.locator('main th').evaluateAll((ths) => ths.map((t) => ({ text: t.textContent.trim(), scope: t.getAttribute('scope') })));
      expect(headers.length, id).toBeGreaterThan(2);
      for (const h of headers) {
        expect(h.text, `${id} has an empty header`).not.toBe('');
        expect(h.scope).toBe('col');
      }
    }
  });
});
