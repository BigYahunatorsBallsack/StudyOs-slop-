import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    acceptDownloads: true,
    // Optional: eigenes Chromium verwenden (z. B. wenn `npx playwright install` nicht möglich ist)
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'mobil', use: { ...devices['Pixel 7'], userAgent: 'Mozilla/5.0 (X11; Linux x86_64) StudyOS-Test' } },
  ],
  webServer: { command: 'node tests/e2e/server.mjs', url: 'http://localhost:4173/', reuseExistingServer: true },
});
