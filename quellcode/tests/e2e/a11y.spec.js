import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Barrierefreiheit (WCAG 2.1 A/AA) mit axe-core: alle Bereiche mit Beispieldaten, dunkle Standardpalette und helles Papier. */
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const SUBS = { Lernen: ['Timer', 'Lerneinheiten', 'Karteikarten', 'Prüfungen & Lernplan'], Mehr: ['Wochenrückblick', 'Alle Hausaufgaben', 'Studienfortschritt', 'Daten & Einstellungen', 'Was ist neu'] };

async function check(page, where) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = res.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.slice(0, 8).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || '').slice(0, 140)).join('\n    ')}`);
  return found;
}

for (const [theme, palette] of [['retro', 'synthwave'], ['retro', 'papier']]) {
  test(`axe: keine Verstöße (${theme}, ${palette})`, async ({ page }) => {
    test.setTimeout(90000);
    // feste Uhrzeit: Dienstag 19:30, die Beispiel-Termine des Tages sind vorbei (prüft auch die abgeblendete Darstellung)
    await page.clock.setFixedTime(new Date('2026-10-20T19:30:00+02:00'));
    await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
    await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
    await page.goto('./');
    await nav(page, 'Mehr').click();
    await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
    await page.locator('.settings-toggle', { hasText: /^Zurücksetzen/ }).click();
    await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
    await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
    await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length ?? 0)).toBeGreaterThan(0);
    await page.evaluate(async (p) => { const d = await window.STUDYOS_ENV.load(); d.settings.retroPalette = p; await window.STUDYOS_ENV.save(d); }, palette);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (palette !== 'synthwave') await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
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

/* Tastatur und Screenreader: Dialoge halten den Fokus, Esc schließt und gibt ihn zurück, Suche als Combobox,
   Meldungen in einer Live-Region, Navigation und Tabs melden ihren Zustand */
test('Tastatur: Dialoge, Fokus, Live-Region', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
  await page.goto('./');
  await expect(nav(page, 'Heute')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.toast-pos')).toHaveAttribute('role', 'status');
  const inDialog = () => page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement));
  for (const name of ['Schnelleingabe (E)', 'Suchen (Strg + K)']) {
    const opener = page.getByRole('button', { name, exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await inDialog()).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await inDialog()).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await inDialog()).toBe(true);
    /* Einblend-Animationen abwarten, sonst misst axe den Kontrast mitten im Überblenden */
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
    const found = (await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => v.id);
    expect(found, name).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  // sichtbarer Fokusrahmen auf Knöpfen
  await nav(page, 'Woche').focus();
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  // Suche: Pfeiltasten wählen die Option, das Suchfeld zeigt sie per aria-activedescendant an
  await page.getByRole('button', { name: 'Suchen (Strg + K)', exact: true }).click();
  const box = page.getByRole('combobox', { name: 'Suchbegriff' });
  await expect(box).toBeFocused();
  await box.fill('heute');
  await box.press('ArrowDown');
  const id = await box.getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  await expect(page.locator(`#${id}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  // Unterseiten-Tabs melden die Auswahl
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await expect(page.getByRole('tab', { name: 'Karteikarten' })).toHaveAttribute('aria-selected', 'true');
  await expect(nav(page, 'Lernen')).toHaveAttribute('aria-current', 'page');
});
