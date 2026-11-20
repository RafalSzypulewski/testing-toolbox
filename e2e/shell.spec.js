import { readFileSync } from 'node:fs';
import { tools } from '../js/registry.js';
import { VERSION, CHANGELOG_URL } from '../js/version.js';
import { test, expect, open, noHorizontalScroll } from './helpers.js';

test.describe('home and navigation', () => {
  test('home lists every registered tool', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.tool-card')).toHaveCount(tools.length);
    for (const t of tools) await expect(page.locator(`.tool-card[href="#/${t.id}"]`)).toContainText(t.name);
  });

  test('every tool opens from its own URL with its name as heading and title', async ({ page }) => {
    for (const t of tools) {
      await open(page, t.id);
      await expect(page.locator('main h2'), t.id).toHaveText(t.name);
      await expect(page).toHaveTitle(`${t.name} · Testing Toolbox`);
      await expect(page.locator('.nav-link[aria-current=page]')).toHaveText(t.name);
    }
  });

  test('an unknown address falls back to the home page', async ({ page }) => {
    await open(page, 'no-such-tool');
    await expect(page.locator('main h2')).toHaveText('Testing Toolbox');
    await expect(page.locator('.tool-card')).toHaveCount(tools.length);
  });

  test('sidebar search matches names, descriptions and keywords, and can be cleared', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#search', 'pesel');
    await expect(page.locator('.nav-link', { hasText: 'Test data (Poland)' })).toBeVisible();
    await expect(page.locator('.nav-link', { hasText: 'Regex tester' })).toBeVisible();
    await expect(page.locator('.nav-link', { hasText: 'Counter string' })).toHaveCount(0);
    await page.fill('#search', 'zzzz');
    await expect(page.locator('.nav-empty')).toHaveText('No matching tools');
    await page.fill('#search', '');
    await expect(page.locator('.nav-link')).toHaveCount(tools.length);
  });

  test('the theme toggle switches and is remembered after a reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#theme');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.click('#theme');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('version badge and changelog', () => {
  test('the badge shows the version on every page, in both themes', async ({ page }) => {
    const badge = page.locator('#version');
    await page.goto('/index.html');
    await expect(badge).toHaveText(`v${VERSION}`);
    await expect(badge).toHaveAttribute('href', '#/changelog');
    await open(page, tools[0].id);
    await expect(badge).toBeVisible();
    await page.click('#theme');
    await expect(badge).toBeVisible();
  });

  test('the version in the page matches package.json', async ({ page }) => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    await page.goto('/index.html');
    await expect(page.locator('#version')).toHaveText(`v${version}`);
  });

  test('clicking the badge opens the in-app changelog with the current version marked', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#version');
    await expect(page).toHaveURL(/#\/changelog$/);
    await expect(page).toHaveTitle('Changelog · Testing Toolbox');
    await expect(page.locator('main h2')).toHaveText('Changelog');
    const current = page.locator('.changelog h3.current-version');
    await expect(current).toContainText(`${VERSION} - `);
    await expect(current.locator('.pill')).toHaveText('you are here');
    await expect(page.locator('.changelog li').first()).toBeVisible();
    // the GitHub link is only a secondary option and opens safely in a new tab
    const github = page.locator('.changelog a', { hasText: 'View on GitHub' });
    await expect(github).toHaveAttribute('href', CHANGELOG_URL);
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('rel', /noopener/);
  });

  test('the home page links to the changelog', async ({ page }) => {
    await page.goto('/index.html');
    await page.click(`text=What's new in v${VERSION}`);
    await expect(page.locator('main h2')).toHaveText('Changelog');
  });

  test('the page copes with markup and dangerous links inside CHANGELOG.md', async ({ page }) => {
    await page.route('**/CHANGELOG.md', (route) =>
      route.fulfill({
        contentType: 'text/markdown',
        body: '# Changelog\n\n## 9.9.9 - 2026-01-01\n\n- [click](javascript:alert(1)) <img src=x onerror=alert(1)> <script>alert(1)</script>\n- [safe](https://example.com) and `code`\n',
      }),
    );
    await open(page, 'changelog');
    await expect(page.locator('.changelog li')).toHaveCount(2);
    await expect(page.locator('.changelog img, .changelog script')).toHaveCount(0);
    await expect(page.locator('.changelog a[href^="javascript"]')).toHaveCount(0);
    await expect(page.locator('.changelog li').first()).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('.changelog li a', { hasText: 'safe' })).toHaveAttribute('href', 'https://example.com');
  });

  test('if the changelog cannot be loaded the page says so and offers GitHub', async ({ page }) => {
    page.allowConsole.push(/Failed to load resource|404/);
    await page.route('**/CHANGELOG.md', (route) => route.fulfill({ status: 404, body: 'nope' }));
    await open(page, 'changelog');
    await expect(page.locator('.changelog .status.error')).toContainText('could not be loaded (HTTP 404)');
    await expect(page.locator('.changelog .status.error a')).toHaveAttribute('href', CHANGELOG_URL);
  });

  test('leaving the page before the changelog arrives does not paint it over another page', async ({ page }) => {
    await page.route('**/CHANGELOG.md', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({ contentType: 'text/markdown', body: '# Changelog\n\n## 9.9.9 - 2026-01-01\n\n- late arrival\n' });
    });
    await open(page, 'changelog');
    await page.click(`.nav-link:text-is("${tools[0].name}")`);
    await expect(page.locator('main h2')).toHaveText(tools[0].name);
    await page.waitForTimeout(900);
    await expect(page.locator('main')).not.toContainText('late arrival');
  });
});

test.describe('fits a 320 px wide phone without sideways scrolling', () => {
  test.use({ viewport: { width: 320, height: 800 } });
  for (const id of ['', 'changelog', ...tools.map((t) => t.id)]) {
    test(id || 'home', async ({ page }) => {
      await open(page, id);
      await expect(page.locator('main h2')).toBeVisible();
      await expect(page.locator('#version')).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }
});
