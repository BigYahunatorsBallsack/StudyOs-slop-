import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Barrierefreiheit (WCAG 2.1 A/AA) mit axe-core: alle Bereiche mit Beispieldaten, dunkel und hell. */
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const SUBS = { Lernen: ['Timer', 'Lerneinheiten', 'Karteikarten', 'Prüfungen & Lernplan'], Mehr: ['Wochenrückblick', 'Alle Hausaufgaben', 'Studienfortschritt', 'Daten & Einstellungen'] };

async function check(page, where) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = res.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.slice(0, 8).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || '').slice(0, 140)).join('\n    ')}`);
  return found;
}

for (const theme of ['retro']) {
  test(`axe: keine Verstöße (${theme})`, async ({ page }) => {
    test.setTimeout(90000);
    // feste Uhrzeit: Dienstag 19:30, die Beispiel-Termine des Tages sind vorbei (prüft auch die abgeblendete Darstellung)
    await page.clock.setFixedTime(new Date('2026-10-20T19:30:00+02:00'));
    await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
    await page.goto('./');
    await nav(page, 'Mehr').click();
    await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
    await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
    await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
    await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length ?? 0)).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const all = [];
    for (const tab of ['Heute', 'Module', 'Woche', 'Lernen', 'Mehr']) {
      await nav(page, tab).click();
      for (const sub of SUBS[tab] || [null]) {
        if (sub) await page.getByRole('tab', { name: sub }).click();
        await page.waitForTimeout(150);
        all.push(...await check(page, sub ? `${tab}/${sub}` : tab));
      }
    }
    expect(all, all.join('\n')).toEqual([]);
  });
}
