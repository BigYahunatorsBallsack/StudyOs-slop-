/* Skalierung und ungewöhnliche Importe: Datenstand nach vier Jahren Studium, kaputte Sicherungen, ICS- und Anki-Varianten */
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guard, nav, openData, stored } from './helpers.js';
import { choose } from './select.js';
import { bigData } from './grossdaten.js';

guard(test);

const tmpFile = (name, text) => { const f = join(mkdtempSync(join(tmpdir(), 'studyos-')), name); writeFileSync(f, text); return f; };
/* Zeit vom Klick bis zum nächsten gezeichneten Bild (in der Seite gemessen) */
const timed = (page, sel, text) => page.evaluate(([s, t]) => new Promise((res) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t));
  const t0 = performance.now(); el.click();
  requestAnimationFrame(() => setTimeout(() => res(performance.now() - t0), 0));
}), [sel, text]);

test('Vier Jahre Daten: lange Listen abschnittsweise, Bereiche wechseln ohne Hänger', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./');
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  await page.evaluate(async (d) => { await window.STUDYOS_ENV.save(d); }, bigData(today));
  await page.reload();
  await expect(nav(page, 'Heute')).toBeVisible();
  await nav(page, 'Lernen').click();
  await expect(page.getByRole('tab', { name: 'Lerneinheiten' })).toBeVisible(); /* Bereich wird nachgeladen */
  /* vorher baute dieser Wechsel 20000 Zeilen auf (gedrosselt über 30 s) */
  expect(await timed(page, '[role=tab]', 'Lerneinheiten')).toBeLessThan(3000);
  const logs = page.locator('ul.rows').first();
  await expect(logs.locator(':scope > li')).toHaveCount(100);
  await expect(page.getByText(/in 20000 Einheiten/)).toBeVisible();
  await page.getByRole('button', { name: /Weitere 100 anzeigen/ }).click();
  await expect(logs.locator(':scope > li')).toHaveCount(200);
  expect(await timed(page, '[role=tab]', 'Karteikarten')).toBeLessThan(3000);
  await expect(page.locator('ul.rows').last().locator(':scope > li')).toHaveCount(100);
  await expect(page.getByRole('button', { name: 'Weitere 100 anzeigen (noch 7900)' })).toBeVisible();
  /* Abfragen: eine Karte bewerten, sie wird gespeichert */
  await page.locator('button', { hasText: 'Lernen starten' }).click();
  await page.locator('button', { hasText: 'Antwort zeigen' }).click();
  const stage = await page.locator('.card-stage').innerText();
  await page.locator('button', { hasText: /^Gut/ }).click();
  const front = stage.split('\n')[0];
  await expect.poll(async () => (await stored(page)).cards.find((c) => c.front === front)?.lastReview, { timeout: 15000 }).toBe(today);
  await page.locator('button', { hasText: 'Sitzung beenden' }).click();
  for (const t of ['Mehr', 'Module', 'Woche', 'Heute']) expect(await timed(page, 'nav[aria-label="Hauptnavigation"] button', t)).toBeLessThan(3000);
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Wochenrückblick' }).click();
  await expect(page.getByText('Lernzeit pro Tag')).toBeVisible();
});

test('Kaputte Sicherung (null, Zahlen, fehlende Felder): nach dem Import kein leeres Bild', async ({ page }) => {
  await page.goto('./');
  await expect(nav(page, 'Heute')).toBeVisible();
  const day = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const backup = { version: 3, settings: null, meta: null,
    modules: [{ id: 'm1' }, { id: 'm2', name: 'Analysis', ects: '6', semester: 1, status: 'belegt' }],
    sessions: [{ id: 's1', moduleId: 'm2' }, { id: 's2', moduleId: 'm2', date: day, start: null, end: null, type: null }, { id: 's3', moduleId: 'm2', date: '2026-13-45', start: '10:00', end: '12:00', type: 'Vorlesung' }],
    homework: [{ id: 'h1', moduleId: 'm2' }, { id: 'h2', moduleId: 'm2', title: 3, due: 20261022, status: null }],
    topics: [{ id: 't1', moduleId: 'm2' }], logs: [{ id: 'l1' }, { id: 'l2', moduleId: 'm2', date: day, minutes: '45' }],
    notes: [{ id: 'n1', moduleId: 'm2', title: null, text: null }], cards: [{ id: 'c1', moduleId: 'm2', front: null, due: null }],
    exams: [{ id: 'e1', moduleId: 'm2' }], blocks: [{ id: 'b1', moduleId: 'm2', date: day, start: 9 }] };
  await openData(page, 'Sicherung');
  await page.locator('input[type=file][accept^=".json"]').setInputFiles(tmpFile('alt.json', JSON.stringify(backup)));
  await page.getByRole('button', { name: 'Daten ersetzen' }).click();
  await page.getByRole('button', { name: 'Ja, alles ersetzen' }).click();
  await expect.poll(async () => (await stored(page))?.modules.length).toBe(2);
  for (const t of ['Heute', 'Module', 'Woche', 'Lernen', 'Mehr']) {
    await nav(page, t).click();
    await expect(nav(page, t)).toHaveAttribute('aria-current', 'page');
  }
  await nav(page, 'Lernen').click();
  for (const t of ['Lerneinheiten', 'Karteikarten', 'Prüfungen & Lernplan']) await page.getByRole('tab', { name: t }).click();
  await nav(page, 'Module').click();
  await page.locator('.tile', { hasText: 'Analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
  /* auch nach dem Neuladen (vorher bei jedem Start leer) */
  await page.reload();
  await expect(nav(page, 'Heute')).toBeVisible();
});

test('ICS: Blockkurs als tägliche Serie mit DURATION, Kleinschreibung', async ({ page }) => {
  await page.goto('./');
  await expect(nav(page, 'Heute')).toBeVisible();
  await openData(page, 'Kalender');
  const ics = ['begin:vcalendar', 'BEGIN:VEVENT', 'SUMMARY:Blockkurs Rust', 'DTSTART;TZID=Europe/Berlin:20261102T090000', 'DURATION:PT7H30M',
    'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=5', 'END:VEVENT', 'end:vcalendar'].join('\r\n');
  await page.locator('input[type=file][accept^=".ics"]').setInputFiles(tmpFile('block.ics', ics));
  await choose(page.getByLabel('Modul für Blockkurs Rust'), '__new');
  await page.getByRole('button', { name: 'Importieren', exact: true }).click();
  await expect(page.getByText('5 Termine importiert.').first()).toBeVisible();
  await expect.poll(async () => ((await stored(page))?.sessions || []).map((s) => `${s.date} ${s.start}-${s.end}`).sort()).toEqual(
    ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => `${d} 09:00-16:30`));
});

test('Karten-CSV: Anki „Notizen als Klartext“ mit Kopfzeilen und HTML', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => { await window.STUDYOS_ENV.save({ version: 3, settings: { defaultsRev: 2 }, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt' }] }); });
  await page.reload();
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await choose(page.getByLabel('Modul filtern'), 'ds');
  const anki = '#separator:tab\n#html:true\n#tags column:3\nWas ist ein <b>Baum</b>?\tZusammenhängend<br>und kreisfrei\tgraphen klausur\n';
  await page.locator('input[type=file][accept^=".csv"]').setInputFiles(tmpFile('anki.txt', anki));
  await expect(page.getByRole('main').getByText('1 Karten importiert.', { exact: true })).toBeVisible();
  await expect.poll(async () => ((await stored(page))?.cards || []).map((c) => [c.front, c.back, c.tags])).toEqual([['Was ist ein Baum?', 'Zusammenhängend\nund kreisfrei', 'graphen, klausur']]);
});
