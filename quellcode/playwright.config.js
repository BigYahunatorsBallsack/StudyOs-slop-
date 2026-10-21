import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${process.env.PORT || 4173}/`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    acceptDownloads: true,
    // Optional: eigenes Chromium verwenden (z. B. wenn `npx playwright install` nicht möglich ist)
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    // Volles Chromium statt „headless shell“: nur das hat Push-API und Notification (für die Erinnerungs-Tests)
    ...(process.env.PW_CHROMIUM ? {} : { channel: 'chromium' }),
  },
  projects: [
    { name: 'mobil', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Pixel 7'], userAgent: 'Mozilla/5.0 (X11; Linux x86_64) StudyOS-Test' } },
    // Screenshot-Vergleich (npm run test:visual); Referenzbilder neu erzeugen mit: npm run test:visual -- --update-snapshots
    { name: 'bilder', testMatch: 'visual/**/*.spec.js', use: { ...devices['Pixel 7'], userAgent: 'Mozilla/5.0 (X11; Linux x86_64) StudyOS-Test' } },
  ],
  webServer: { command: 'node tests/e2e/server.mjs', url: `http://localhost:${process.env.PORT || 4173}/`, reuseExistingServer: true },
});
