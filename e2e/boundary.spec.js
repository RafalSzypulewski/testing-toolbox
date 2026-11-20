import { test, expect, open, clipboard } from './helpers.js';

// All three tabs live in the page (the inactive ones are hidden), so every locator is scoped
// to the visible tab panel.
const panel = (page) => page.getByRole('tabpanel');
const firstTable = (page) => panel(page).locator('table').first();
const column = (page, n) => firstTable(page).locator(`tr td:nth-child(${n})`);
const select = (page) => panel(page).locator('select').first();
const number = (page, n) => panel(page).locator('input[type=number]').nth(n);
const text = (page, n) => panel(page).locator('input[type=text]').nth(n);
const status = (page) => panel(page).locator('.status').first();
const tab = (page, name) => page.getByRole('tab', { name }).click();
const year = new Date().getFullYear();

test.describe('Boundary values: text length', () => {
  test('lists the cases around min and max with verdicts and byte counts', async ({ page }) => {
    await open(page, 'boundary-values');
    await expect(page.locator('.tab[aria-selected=true]')).toHaveText('Text length');
    await expect(column(page, 2)).toHaveText(['0', '1', '2', '19', '20', '21']);
    await expect(column(page, 1).first()).toContainText('empty');
    await expect(column(page, 4)).toHaveText(['✗ Reject', '✓ Accept', '✓ Accept', '✓ Accept', '✓ Accept', '✗ Reject']);
    await select(page).selectOption('polish');
    await expect(column(page, 3)).toHaveText(['0', '2', '4', '38', '40', '42']); // 2 bytes per letter
    await select(page).selectOption('emoji');
    await expect(column(page, 3).last()).toHaveText('84');
    await select(page).selectOption('counter');
    await expect(column(page, 5).nth(4)).toHaveText('2*4*6*8*11*14*17*20*');
  });

  test('copies one string or all of them, truncates long previews and validates', async ({ page }) => {
    await open(page, 'boundary-values');
    await page.getByRole('button', { name: 'Copy max + 1' }).click();
    expect(await clipboard(page)).toBe('a'.repeat(21));
    await page.click('button:text-is("Copy all (one per line)")');
    expect((await clipboard(page)).split('\n')).toHaveLength(6);
    await number(page, 1).fill('100000');
    await expect(column(page, 5).last()).toContainText('(+');
    await number(page, 1).fill('0');
    await expect(status(page)).toContainText('between 1');
    await number(page, 1).fill('5');
    await number(page, 0).fill('9');
    await expect(status(page)).toContainText('cannot be greater');
  });
});

test.describe('Boundary values: numbers', () => {
  test('exact limits for 32- and 64-bit types, not rounded floats', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await expect(column(page, 2)).toHaveText(['-1', '0', '1', '99', '100', '101']);
    await select(page).selectOption('int32');
    await expect(column(page, 2)).toContainText(['-2147483649', '2147483648']);
    await select(page).selectOption('int64');
    await expect(column(page, 2)).toContainText(['9223372036854775808']);
    await select(page).selectOption('uint64');
    await expect(column(page, 2)).toContainText(['18446744073709551616']);
  });

  test('decimal steps keep their precision and the type returns to Custom when you edit', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await select(page).selectOption('int8');
    await text(page, 0).fill('0.00');
    await text(page, 1).fill('999.99');
    await text(page, 2).fill('0.01');
    await expect(select(page)).toHaveValue('');
    await expect(column(page, 2)).toHaveText(['-0.01', '0.00', '0.01', '999.98', '999.99', '1000.00']);
    await panel(page).locator('input[type=checkbox]').uncheck();
    await expect(column(page, 2)).toHaveText(['-0.01', '0.00', '0.01', '999.98', '999.99', '1000.00']);
  });

  test('bad input gives a message and the special numbers stay available', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Numbers');
    await text(page, 0).fill('abc');
    await expect(status(page)).toContainText('plain number');
    await expect(panel(page).locator('table')).toHaveCount(1);
    await page.getByRole('button', { name: 'Copy JavaScript max safe integer', exact: true }).click();
    expect(await clipboard(page)).toBe('9007199254740991');
  });
});

test.describe('Boundary values: dates and times', () => {
  test('range edges, leap days and impossible dates', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Dates and times');
    await expect(column(page, 2)).toHaveText([`${year - 1}-12-31`, `${year}-01-01`, `${year}-01-02`, `${year}-12-30`, `${year}-12-31`, `${year + 1}-01-01`]);
    await text(page, 0).fill('2023-02-30');
    await expect(status(page)).toContainText('real date');
    await text(page, 0).fill('2024-02-28');
    await text(page, 1).fill('2024-03-01');
    await expect(column(page, 2)).toHaveText(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02']);
    const verdicts = page.locator('h3:text-is("Calendar edge cases") + .table-wrap tr td:nth-child(3)');
    await expect(verdicts).toHaveCount(18);
    await expect(verdicts.filter({ hasText: 'Not a real' })).toHaveCount(7);
  });

  test('clock-change dates follow the year', async ({ page }) => {
    await open(page, 'boundary-values');
    await tab(page, 'Dates and times');
    const local = () => page.locator('h3:text-is("Clock changes (daylight saving time)") ~ div table tr td:nth-child(3)');
    await number(page, 0).fill('2026');
    await expect(local()).toHaveText(['2026-03-29T02:30:00', '2026-10-25T02:30:00', '2026-03-08T02:30:00', '2026-11-01T01:30:00']);
    await number(page, 0).fill('2024');
    await expect(local().first()).toHaveText('2024-03-31T02:30:00');
    await number(page, 0).fill('1800');
    await expect(panel(page).locator('.status.error')).not.toHaveCount(0);
  });
});
