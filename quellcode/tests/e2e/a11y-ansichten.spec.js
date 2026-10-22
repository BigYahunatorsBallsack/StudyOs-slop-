import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Barrierefreiheit über die Hauptbereiche hinaus: jede Einstellungsgruppe, Karteikarten-Abfrage (auch Vollbild),
   Probeklausur, Altklausuren und Lernplan, Dialoge auf Heute und bei den Modulen. axe-core mit WCAG 2.1 A/AA. */
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
}
async function check(page, where, include) {
  await settle(page);
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (include) b = b.include(include);
  const res = await b.analyze();
  return res.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.slice(0, 8).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || n.all[0]?.message || '').slice(0, 140)).join('\n    ')}`);
}

async function demo(page) {
  await page.clock.setFixedTime(new Date('2026-10-20T10:30:00+02:00'));
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
  await page.goto('./');
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
  await page.locator('.settings-toggle', { hasText: /^Zurücksetzen/ }).click();
  await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
  await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length ?? 0)).toBeGreaterThan(0);
}

test('axe: alle Einstellungsgruppen', async ({ page }) => {
  test.setTimeout(90000);
  await demo(page);
  const all = [];
  const toggles = page.locator('.settings-toggle');
  const n = await toggles.count();
  for (let i = 0; i < n; i++) {
    const t = toggles.nth(i);
    const name = (await t.textContent()).trim();
    if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(100);
    all.push(...await check(page, `Einstellungen/${name}`));
  }
  // Sicherung: JSON anzeigen, verschlüsseln, Import-Vorschau
  await page.locator('.settings-toggle', { hasText: /^Sicherung & Daten/ }).click();
  await page.getByRole('button', { name: 'JSON anzeigen' }).click();
  await page.getByText('Mit Passphrase verschlüsseln').click();
  await page.getByRole('textbox', { name: 'JSON zum Import einfügen' }).fill(JSON.stringify({ version: 3, modules: [] }));
  await page.getByRole('button', { name: 'Eingefügten Text prüfen' }).click();
  await expect(page.getByText(/^Gefunden:/)).toBeVisible();
  all.push(...await check(page, 'Einstellungen/Sicherung erweitert'));
  expect(all, all.join('\n')).toEqual([]);
});

test('axe: Karteikarten-Abfrage, Vollbild, Probeklausur, Lernplan', async ({ page }) => {
  test.setTimeout(90000);
  await demo(page);
  const all = [];
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  all.push(...await check(page, 'Abfrage'));
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  all.push(...await check(page, 'Abfrage aufgedeckt'));
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click();
  all.push(...await check(page, 'Abfrage Vollbild'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sitzung beenden' }).click();

  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  await page.getByRole('button', { name: 'Lernplan anzeigen' }).first().click();
  await page.getByRole('button', { name: /^Altklausuren/ }).first().click();
  await page.getByRole('textbox', { name: 'Neue Altklausur' }).fill('WS 2024/25');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  all.push(...await check(page, 'Prüfungen'));
  await page.getByRole('button', { name: 'Probeklausur' }).first().click();
  const dlg = page.getByRole('dialog');
  all.push(...await check(page, 'Probeklausur Start', '[role=dialog]'));
  await dlg.getByRole('button', { name: 'Starten' }).click();
  all.push(...await check(page, 'Probeklausur läuft', '[role=dialog]'));
  await dlg.getByRole('button', { name: 'Lösung zeigen' }).click();
  all.push(...await check(page, 'Probeklausur Lösung', '[role=dialog]'));
  await dlg.getByRole('button', { name: 'Abgeben' }).click();
  all.push(...await check(page, 'Probeklausur Auswertung', '[role=dialog]'));
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Timer' }).click();
  all.push(...await check(page, 'Timer'));
  expect(all, all.join('\n')).toEqual([]);
});

test('axe: Dialoge auf Heute, bei Modulen und Notizen', async ({ page }) => {
  test.setTimeout(90000);
  await demo(page);
  const all = [];
  await nav(page, 'Heute').click();
  await page.getByRole('button', { name: 'Was jetzt?' }).click();
  all.push(...await check(page, 'Was jetzt?', '[role=dialog]'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Heute anpassen' }).click();
  all.push(...await check(page, 'Heute anpassen', '[role=dialog]'));
  await page.keyboard.press('Escape');
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: 'Aus Studienplan übernehmen …' }).click();
  all.push(...await check(page, 'Studienplan', '[role=dialog]'));
  await page.keyboard.press('Escape');
  const merge = page.getByRole('button', { name: /^(Module )?[Zz]usammenführen …$/ }).first();
  if (await merge.count()) {
    await merge.click();
    all.push(...await check(page, 'Zusammenführen', '[role=dialog]'));
    await page.keyboard.press('Escape');
  }
  await nav(page, 'Mehr').click();
  for (const sub of ['Erfolge', 'Studienfortschritt', 'Wochenrückblick']) {
    await page.getByRole('tab', { name: sub }).click();
    all.push(...await check(page, `Mehr/${sub}`));
  }
  await page.getByRole('button', { name: 'Suchen (Strg + K)', exact: true }).click();
  await page.getByRole('combobox', { name: 'Suchbegriff' }).fill('Beispiel');
  all.push(...await check(page, 'Suche', '[role=dialog]'));
  await page.keyboard.press('Escape');
  expect(all, all.join('\n')).toEqual([]);
});
