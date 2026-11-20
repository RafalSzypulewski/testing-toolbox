import { test, expect, open, clipboard } from './helpers.js';

const firstTable = (page) => page.locator('table').first();
const column = (page, n) => firstTable(page).locator(`tr td:nth-child(${n})`);
const tab = (page, name) => page.click(`.tab:text-is("${name}")`);
const year = new Date().getFullYear();

test.describe('Boundary values: text length', () => {
  test('lists the cases around min and max with verdicts and byte counts', async ({ page }) => {
    await open(page, 'boundary-values');
    await expect(page.locator('.tab[aria-selected=true]')).toHaveText('Text length');
    await expect(column(page, 2)).toHaveText(['0', '1', '2', '19', '20', '21']);
    await expect(column(page, 1).first()).toContainText('empty');
    await expect(column(page, 4)).toHaveText(['✗ Reject', '✓ Accept', '✓ Accept', '✓ Accept', '✓ Accept', '✗ Reject']);
    await page.selectOption('select', 'polish');
    await expect(column(page, 3)).toHaveText(['0', '2', '4', '38', '40', '42']); // 2 bytes per letter
    await page.selectOption('select', 'emoji');
    await expect(column(page, 3).last()).toHaveText('84');
    await page.selectOption('select', 'counter');
    await expect(column(page, 5).nth(4)).toHaveText('2*4*6*8*11*14*17*20*');
  });

  test('copies one string or all of them, truncates long previews and validates', async ({ page }) => {
    await open(page, 'boundary-values');
    await firstTable(page).locator('tr:nth-child(7) button').click(); // row 1 is the header: this is "max + 1"
    expect(await clipboard(page)).toBe('a'.repeat(21));
    await page.click('button:text-is("Copy all (one per line)")');
    expect((await clipboard(page)).split('\n')).toHaveLength(6);
    await page.fill('input[type=number] >> nth=1', '100000');
    await expect(column(page, 5).last()).toContainText('(+');
    await page.fill('input[type=number] >> nth=1', '0');
    await expect(page.locator('.status')).toContainText('between 1');
    await page.fill('input[type=number] >> nth=1', '5');
    await page.fill('input[type=number] >> nth=0', '9');
    await expect(page.locator('.status')).toContainText('cannot be greater');
  });
});

test.describe('Boundary values: numbers', () => {
  test('exact limits for 32- and 64-bit types, not rounded floats', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await expect(column(page, 2)).toHaveText(['-1', '0', '1', '99', '100', '101']);
    await page.selectOption('select', 'int32');
    await expect(column(page, 2)).toContainText(['-2147483649', '2147483648']);
    await page.selectOption('select', 'int64');
    await expect(column(page, 2)).toContainText(['9223372036854775808']);
    await page.selectOption('select', 'uint64');
    await expect(column(page, 2)).toContainText(['18446744073709551616']);
  });

  test('decimal steps keep their precision and the type returns to Custom when you edit', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await page.selectOption('select', 'int8');
    await page.fill('input[type=text] >> nth=0', '0.00');
    await page.fill('input[type=text] >> nth=1', '999.99');
    await page.fill('input[type=text] >> nth=2', '0.01');
    await expect(page.locator('select')).toHaveValue('');
    await expect(column(page, 2)).toHaveText(['-0.01', '0.00', '0.01', '999.98', '999.99', '1000.00']);
    await page.uncheck('input[type=checkbox]');
    await expect(column(page, 2)).toHaveText(['-0.01', '0.00', '0.01', '999.98', '999.99', '1000.00']);
  });

  test('bad input gives a message and the special numbers stay available', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await page.fill('input[type=text] >> nth=0', 'abc');
    await expect(page.locator('.status')).toContainText('plain number');
    await expect(page.locator('table')).toHaveCount(1);
    await page.locator('table tr:nth-child(2) button').click();
    expect(await clipboard(page)).toBe('9007199254740991');
  });
});

test.describe('Boundary values: dates and times', () => {
  test('range edges, leap days and impossible dates', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Dates and times');
    await expect(column(page, 2)).toHaveText([`${year - 1}-12-31`, `${year}-01-01`, `${year}-01-02`, `${year}-12-30`, `${year}-12-31`, `${year + 1}-01-01`]);
    await page.fill('input[placeholder=YYYY-MM-DD] >> nth=0', '2023-02-30');
    await expect(page.locator('.status')).toContainText('real date');
    await page.fill('input[placeholder=YYYY-MM-DD] >> nth=0', '2024-02-28');
    await page.fill('input[placeholder=YYYY-MM-DD] >> nth=1', '2024-03-01');
    await expect(column(page, 2)).toHaveText(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02']);
    const verdicts = page.locator('h3:text-is("Calendar edge cases") + .table-wrap tr td:nth-child(3)');
    await expect(verdicts).toHaveCount(18);
    await expect(verdicts.filter({ hasText: 'Not a real' })).toHaveCount(7);
  });

  test('clock-change dates follow the year', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Dates and times');
    const local = () => page.locator('h3:text-is("Clock changes (daylight saving time)") ~ div table tr td:nth-child(3)');
    await page.fill('input[type=number]', '2026');
    await expect(local()).toHaveText(['2026-03-29T02:30:00', '2026-10-25T02:30:00', '2026-03-08T02:30:00', '2026-11-01T01:30:00']);
    await page.fill('input[type=number]', '2024');
    await expect(local().first()).toHaveText('2024-03-31T02:30:00');
    await page.fill('input[type=number]', '1800');
    await expect(page.locator('.status.error')).not.toHaveCount(0);
  });
});
