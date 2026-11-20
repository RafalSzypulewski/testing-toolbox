import { test as base, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Every test fails if the page logs a console error or throws, because that has hidden real
 * bugs before. A test that expects one can allow it with `page.allowConsole.push(/pattern/)`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.allowConsole = [];
    const note = (text) => {
      if (!page.allowConsole.some((re) => re.test(text))) problems.push(text);
    };
    page.on('console', (m) => m.type() === 'error' && note(m.text()));
    page.on('pageerror', (e) => note(e.message));
    await use(page);
    expect(problems, 'console errors or uncaught exceptions').toEqual([]);
  },
});

export { expect };

export const open = (page, id = '') => page.goto(`/index.html#/${id}`);

/** Sets a (possibly huge) value directly. Playwright's fill() types big texts very slowly. */
export const setText = (locator, text) =>
  locator.evaluate((el, t) => {
    el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);

export const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

export const hasCommand = (command) => spawnSync('which', [command]).status === 0;

/** Clicks something that starts a download and returns what was saved. */
export async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), path, data: readFileSync(path) };
}

export const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
