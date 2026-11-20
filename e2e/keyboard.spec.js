import { tools } from '../js/registry.js';
import { test, expect, open, clipboard, noHorizontalScroll } from './helpers.js';

const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');

test.describe('skip link and focus handling', () => {
  test('the first Tab stop is a visible "Skip to the tool" link that jumps to the content', async ({ page }) => {
    await open(page, 'counter-string');
    await page.keyboard.press('Tab');
    const skip = page.locator('#skip');
    await expect(skip).toBeFocused();
    await expect.poll(async () => (await skip.boundingBox()).y).toBeGreaterThanOrEqual(0); // slid into view (it animates in)
    await page.keyboard.press('Enter');
    expect(await activeId(page)).toBe('main');
    await expect(page).toHaveURL(/#\/counter-string$/); // the link must not change the page
    await page.keyboard.press('Tab');
    await expect(page.locator('main input').first()).toBeFocused(); // next Tab is the first control of the tool
  });

  test('the skip link stays hidden until it has focus', async ({ page }) => {
    await open(page, 'counter-string');
    expect((await page.locator('#skip').boundingBox()).y).toBeLessThan(0);
  });

  test('opening the page does not steal focus, but navigating moves it to the new content', async ({ page }) => {
    await open(page, 'counter-string');
    expect(await activeId(page)).toBe('');
    await page.locator('.nav-link', { hasText: 'Random string' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('main h2')).toHaveText('Random string');
    expect(await activeId(page)).toBe('main');
  });

  test('the Tab order starts with skip link, title, version, theme, search and the tool list', async ({ page }) => {
    await open(page, 'counter-string');
    const order = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.className || document.activeElement.tagName));
    }
    expect(order.slice(0, 5)).toEqual(['skip', 'brand', 'version', 'theme', 'search']);
    expect(order[5]).toBe('nav-link');
  });
});

test.describe('every keyboard-focusable control shows where the focus is', () => {
  for (const id of ['', 'changelog', ...tools.map((t) => t.id)]) {
    test(id || 'home', async ({ page }) => {
      await open(page, id);
      await expect(page.locator('main h2')).toBeVisible();
      const hidden = [];
      let stops = 0;
      for (let i = 0; i < 150; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return { name: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}[${(el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 30)}]`, visible };
        });
        if (!info) break;
        stops++;
        if (!info.visible) hidden.push(info.name);
      }
      expect(stops).toBeGreaterThan(8);
      expect(hidden, 'controls without a visible focus indicator').toEqual([]);
    });
  }
});

test.describe('tabs (Boundary values)', () => {
  test('follow the ARIA tabs pattern: roles, selection, roving tab stop and arrow keys', async ({ page }) => {
    await open(page, 'boundary-values');
    const tabs = page.getByRole('tab');
    await expect(page.getByRole('tablist')).toHaveAttribute('aria-label', 'Kind of values');
    await expect(tabs).toHaveText(['Text length', 'Numbers', 'Dates and times']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');
    // each tab controls a labelled panel; only the selected panel is visible
    for (const [i, key] of ['length', 'numbers', 'dates'].entries()) {
      await expect(tabs.nth(i)).toHaveAttribute('aria-controls', `boundary-panel-${key}`);
      await expect(page.locator(`#boundary-panel-${key}`)).toHaveAttribute('aria-labelledby', `boundary-tab-${key}`);
    }
    await expect(page.getByRole('tabpanel')).toHaveCount(1); // hidden panels are not exposed
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'boundary-tab-numbers');
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowRight'); // wraps around
    await expect(tabs.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toBeFocused();
    // Tab leaves the tab list into the panel instead of visiting every tab
    await page.keyboard.press('Tab');
    await expect(page.locator('#boundary-panel-length input').first()).toBeFocused();
  });

  test('values typed in one tab survive switching to another and back', async ({ page }) => {
    await open(page, 'boundary-values');
    await page.fill('input[type=number] >> nth=1', '77');
    await page.getByRole('tab', { name: 'Numbers' }).click();
    await page.getByRole('tab', { name: 'Text length' }).click();
    await expect(page.locator('input[type=number] >> nth=1')).toHaveValue('77');
  });
});

test.describe('lists of clickable rows', () => {
  test('naughty strings can be copied with Enter and with Space', async ({ page }) => {
    await open(page, 'naughty-strings');
    await page.fill('input[type=search] >> nth=-1', 'drop table');
    const row = page.getByRole('button', { name: /SQL: drop table/ });
    await row.focus();
    await page.keyboard.press('Enter');
    expect(await clipboard(page)).toBe("'; DROP TABLE users;--");
    await page.evaluate(() => navigator.clipboard.writeText('x'));
    await page.keyboard.press('Space');
    expect(await clipboard(page)).toBe("'; DROP TABLE users;--");
  });
});

test.describe('motion and zoom', () => {
  test('animations are switched off for people who ask for reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto('/index.html#/counter-string');
    await page.click('button.primary');
    const duration = await page.locator('#toast').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
    await context.close();
  });

  test.describe('text enlarged to 200% (WCAG 1.4.4)', () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    for (const id of ['', ...tools.map((t) => t.id)]) {
      test(id || 'home', async ({ page }) => {
        await open(page, id);
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        await expect(page.locator('main h2')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
      });
    }
  });

  test('wider letter, word and line spacing does not break the layout (WCAG 1.4.12)', async ({ page }) => {
    await open(page, 'text-utilities');
    await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
    await expect(page.locator('main h2')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(page.locator('button:text-is("↻ Run again")')).toBeVisible();
  });
});
