import { test, expect, open, clipboard } from './helpers.js';

const validator = 'input[placeholder="Paste a value to check"]';

test.describe('Test data (Poland)', () => {
  test('generates JSON records with a valid-looking PESEL', async ({ page }) => {
    await open(page, 'test-data');
    await page.click('button.primary');
    const records = JSON.parse(await page.locator('textarea[readonly]').inputValue());
    expect(records).toHaveLength(5);
    expect(records[0].pesel).toMatch(/^\d{11}$/);
    expect(records[0].email).toMatch(/@example\.(com|org|net)$/);
  });

  test('switches to CSV and respects the chosen fields', async ({ page }) => {
    await open(page, 'test-data');
    await page.selectOption('select >> nth=0', 'csv');
    await page.check('text=IBAN (PL)');
    await page.click('button.primary');
    const lines = (await page.locator('textarea[readonly]').inputValue()).split('\n');
    expect(lines[0]).toBe('firstName,lastName,birthDate,email,phone,pesel,iban');
    expect(lines).toHaveLength(6);
  });

  test('validates PESEL, NIP, REGON and IBAN, and says why a value is wrong', async ({ page }) => {
    await open(page, 'test-data');
    const status = page.locator('.status >> nth=-1');
    await page.fill(validator, '44051401359');
    await expect(status).toContainText('Valid PESEL');
    await expect(status).toContainText('born 1944-05-14');
    await page.fill(validator, '44051401358');
    await expect(status).toContainText('Invalid PESEL: Check digit');
    await page.selectOption('select >> nth=-1', 'IBAN');
    await page.fill(validator, 'PL61 1090 1014 0000 0712 1981 2874');
    await expect(status).toContainText('Valid IBAN');
    await page.selectOption('select >> nth=-1', 'NIP');
    await page.fill(validator, '123-456-32-18');
    await expect(status).toContainText('Valid NIP');
  });

  test('"Copy new ..." buttons put a fresh value on the clipboard', async ({ page }) => {
    await open(page, 'test-data');
    await page.click('button:text-is("Copy new PESEL")');
    expect(await clipboard(page)).toMatch(/^\d{11}$/);
    await page.click('button:text-is("Copy new UUID")');
    expect(await clipboard(page)).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('rejects a count out of range', async ({ page }) => {
    await open(page, 'test-data');
    await page.fill('input[type=number]', '5000');
    await page.click('button.primary');
    await expect(page.locator('.status').first()).toContainText('between 1 and 1,000');
  });
});
