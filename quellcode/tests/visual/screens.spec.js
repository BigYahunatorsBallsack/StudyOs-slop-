import { test, expect } from '@playwright/test';

/* Screenshot-Vergleich der wichtigsten Ansichten, dunkel und hell. Damit die Bilder auf jedem Rechner gleich
   aussehen: feste Uhrzeit, Beispieldaten, nur die mitgelieferte Schrift, keine Animationen. */
const NOW = new Date('2026-10-20T09:30:00+02:00'); // Dienstag
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const STABLE = `*, *::before, *::after { font-family: "Bricolage Grotesque", sans-serif !important; animation: none !important; transition: none !important; caret-color: transparent !important; }`;

async function setup(page, theme) {
  await page.clock.setFixedTime(NOW);
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.goto('./');
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
  await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
  await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(async (t) => { const d = await window.STUDYOS_ENV.load(); d.settings.theme = t; d.meta.lastBackup = new Date().toISOString(); await window.STUDYOS_ENV.save(d); }, theme);
  await page.reload();
  await page.addStyleTag({ content: STABLE });
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ['dark', 'light']) {
  for (const [view, tab] of [['heute', 'Heute'], ['woche', 'Woche'], ['module', 'Module']]) {
    test(`${view} (${theme === 'dark' ? 'dunkel' : 'hell'})`, async ({ page }) => {
      await setup(page, theme);
      await nav(page, tab).click();
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`${view}-${theme}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.02, mask: [page.getByText(/^StudyOS \d/)] });
    });
  }
}
