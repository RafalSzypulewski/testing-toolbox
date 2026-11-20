import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1200, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    // Only for sandboxes whose browser is not where Playwright expects it.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://localhost:${PORT}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
