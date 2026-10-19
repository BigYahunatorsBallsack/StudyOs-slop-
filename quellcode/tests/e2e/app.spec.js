import { test, expect } from '@playwright/test';
import { choose } from './select.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Fehler aus Konsole und Seite sammeln: jeder Test muss ohne laufen */
const pageErrors = new WeakMap();
const MENSA = { days: [0, 1, 2, 3, 4, 5, 6].map((n) => { const d = new Date(); d.setDate(d.getDate() + n); return { date: d.toLocaleDateString('sv-SE'), dishes: [{ name: 'Testpasta mit Tomaten', dish_type: 'Pasta', labels: ['VEGAN'], prices: { students: { base_price: 0, price_per_unit: 0.9, unit: '100g' } } }] }; }) };
test.beforeEach(async ({ page }) => {
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: MENSA }));
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Konsolenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
async function openData(page) {
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
}
async function loadDemo(page) {
  await page.goto('./');
  await openData(page);
  await page.getByRole('button', { name: 'Beispieldaten laden' }).click();
  await page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
}
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());

test('alle Bereiche laden ohne Fehler und ohne horizontales Scrollen', async ({ page }) => {
  await loadDemo(page);
  const subs = { Lernen: ['Timer', 'Lerneinheiten', 'Karteikarten', 'Prüfungen & Lernplan'], Mehr: ['Wochenrückblick', 'Erfolge', 'Alle Hausaufgaben', 'Studienfortschritt', 'Daten & Einstellungen'] };
  for (const tab of ['Heute', 'Module', 'Woche', 'Lernen', 'Mehr']) {
    await nav(page, tab).click();
    for (const sub of subs[tab] || [null]) {
      if (sub) await page.getByRole('tab', { name: sub }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tab}/${sub}`).toBe(true);
    }
  }
  await expect(page.getByText('Aktivität (20 Wochen)')).toHaveCount(0); // nicht im Datenbereich
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Wochenrückblick' }).click();
  await expect(page.getByText('Aktivität (20 Wochen)')).toBeVisible();
});

test('Daten bleiben nach dem Neuladen erhalten, Änderungen tragen Zeitstempel', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Heute').click();
  await page.keyboard.press('n'); // Tastenkürzel für eine neue Notiz
  await page.getByLabel('Titel').fill('Testnotiz');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(async () => (await stored(page))?.notes.some((n) => n.title === 'Testnotiz')).toBe(true);
  await page.reload();
  const d = await stored(page);
  const note = d.notes.find((n) => n.title === 'Testnotiz');
  expect(note.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('verschlüsselte Sicherung: Export, falsche und richtige Passphrase, Zusammenführen auf zweitem Gerät', async ({ page, browser }) => {
  await loadDemo(page);
  await openData(page);
  await page.getByLabel('Mit Passphrase verschlüsseln (AES-256)').check();
  await page.getByLabel('Passphrase', { exact: true }).fill('korrekt-pferd');
  await page.getByLabel('Passphrase wiederholen').fill('korrekt-pferd');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als Datei herunterladen' }).click()]);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('"studyosEncrypted":1');
  expect(text).not.toContain('Beispiel');

  // Zweites Gerät (eigener Browser-Kontext): eigene Notiz, dann Sicherung einspielen
  const ctx = await browser.newContext({ locale: 'de-DE', acceptDownloads: true });
  const b = await ctx.newPage();
  const errs = [];
  b.on('pageerror', (e) => errs.push(String(e)));
  await b.goto('./?aktion=notiz');
  await b.getByLabel('Titel').fill('Nur auf Gerät B');
  await b.getByRole('button', { name: 'Speichern' }).click();
  await openData(b);
  const file = join(mkdtempSync(join(tmpdir(), 'studyos-')), 'backup.json');
  writeFileSync(file, text);
  await b.locator('input[type=file][accept^=".json"]').setInputFiles(file);
  await b.getByLabel('Passphrase zum Entschlüsseln').fill('falsch');
  await b.getByRole('button', { name: 'Entschlüsseln' }).click();
  await expect(b.getByText('Falsche Passphrase oder beschädigte Datei.')).toBeVisible();
  await b.getByLabel('Passphrase zum Entschlüsseln').fill('korrekt-pferd');
  await b.getByRole('button', { name: 'Entschlüsseln' }).click();
  await b.getByRole('button', { name: 'Zusammenführen' }).click();
  await expect(b.getByText(/Zusammengeführt: \d+ neu/)).toBeVisible();
  await expect.poll(async () => {
    const d = await stored(b);
    return d && d.modules.length > 0 && d.notes.some((n) => n.title === 'Nur auf Gerät B');
  }).toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Zusammenführen nach "Alle Daten löschen" erklärt, warum nichts zurückkommt', async ({ page }) => {
  await loadDemo(page);
  await openData(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als Datei herunterladen' }).click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'studyos-')), 'backup.json');
  writeFileSync(file, readFileSync(await download.path(), 'utf8'));
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click();
  await page.getByRole('button', { name: 'Wirklich alles löschen?' }).click();
  await page.locator('input[type=file][accept^=".json"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Zusammenführen' }).click();
  await expect(page.getByText(/später gelöscht/)).toBeVisible();
  await page.locator('input[type=file][accept^=".json"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Daten ersetzen' }).click();
  await page.getByRole('button', { name: 'Ja, alles ersetzen' }).click();
  await expect.poll(async () => (await stored(page))?.modules.length).toBeGreaterThan(0);
});

test('Lückentext-Karte: Lücke verdeckt, nach dem Aufdecken sichtbar', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await page.getByRole('button', { name: '+ Karte' }).click();
  await page.getByLabel('Vorderseite (Frage)').fill('Mergesort läuft in {{c1::O(n log n)::Landau}}.');
  await page.getByLabel('Tags').fill('Sortieren, Klausur');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await choose(page.getByLabel('Tag filtern'), 'sortieren');
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await expect(page.getByText('[Landau]')).toBeVisible();
  await expect(page.getByText('O(n log n)')).toHaveCount(0);
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await expect(page.getByText('O(n log n)')).toBeVisible();
  await page.getByRole('button', { name: /^Gut/ }).click();
  await expect(page.getByText('Sitzung abgeschlossen: 1 Karten gelernt.')).toBeVisible();
});

test('Karten-CSV: Import mit Kopfzeile und Export', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await choose(page.getByLabel('Modul filtern'), { index: 1 });
  const file = join(mkdtempSync(join(tmpdir(), 'studyos-')), 'karten.csv');
  writeFileSync(file, 'Vorderseite;Rückseite;Tags\n"Was ist ein Graph?";"G = (V, E)";graphen\nOhne Antwort;\n');
  await page.locator('input[type=file][accept^=".csv"]').setInputFiles(file);
  await expect(page.getByText(/1 Karten importiert, 1 Zeilen übersprungen/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV exportieren/ }).click()]);
  expect(readFileSync(await download.path(), 'utf8')).toContain('"Was ist ein Graph?";"G = (V, E)";"graphen"');
});

test('Prüfung: Anmeldeschluss erscheint als Frist, Lernplan zeigt Minuten und freie Tage', async ({ page }) => {
  await loadDemo(page);
  const day = (n) => page.evaluate((n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }, n);
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  await page.getByRole('button', { name: '+ Prüfung' }).click();
  await page.getByLabel(/^Datum/).fill(await day(12));
  await page.getByLabel('Anmeldeschluss').fill(await day(3));
  await page.getByRole('group', { name: 'Lernfreie Tage im Lernplan' }).getByRole('button', { name: 'So' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await nav(page, 'Heute').click();
  await expect(page.locator('.todo-row', { hasText: 'anmelden' })).toContainText('Anmeldeschluss in 3 Tagen');
  await nav(page, 'Lernen').click();
  // Prüfungen sind nach Datum sortiert: die neue (in 12 Tagen) steht vor der Beispielprüfung (in 24 Tagen)
  await expect(page.getByText(/Anmeldung bis/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Lernplan anzeigen' }).first().click();
  await expect(page.getByText('Freier Tag').first()).toBeVisible();
  await expect(page.getByText('Gesamtwiederholung und Probeklausur unter Zeitdruck').last()).toBeVisible();
});

test('Hochschule und Studiengang im Kopf', async ({ page }) => {
  await loadDemo(page);
  await openData(page);
  await page.getByLabel('Hochschule').fill('LMU');
  await page.getByLabel('Studiengang', { exact: true }).fill('Informatik');
  await page.reload();
  await expect(page.locator('header')).toContainText('Informatik, LMU'); // auf Handybreite ausgeblendet, aber gesetzt
});

test('App-Verknüpfung öffnet direkt das Formular für eine Lerneinheit', async ({ page }) => {
  await loadDemo(page);
  await page.goto('./?aktion=lerneinheit');
  await expect(page.getByRole('dialog', { name: /Lerneinheit anlegen/ })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('Timer läuft nach dem Neuladen weiter, ohne die App ständig neu zu rendern', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Lernen').click();
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Zum Timer' })).toContainText(/Fokus 2[45]:\d\d/);
  // Der Seitenkopf darf sich nicht jede halbe Sekunde neu aufbauen: Element-Identität bleibt gleich
  await page.evaluate(() => { window.__h1 = document.querySelector('header h1'); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__h1 === document.querySelector('header h1'))).toBe(true);
  await expect(page).toHaveTitle(/Fokus · StudyOS/);
});

test('ICS-Import mit mehreren Wochentagen', async ({ page }) => {
  await loadDemo(page);
  await openData(page);
  const file = join(mkdtempSync(join(tmpdir(), 'studyos-')), 'plan.ics');
  writeFileSync(file, 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Algorithmen Vorlesung\r\nDTSTART:20261019T100000\r\nDTEND:20261019T113000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\r\nEXDATE:20261021T100000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
  await page.locator('input[type=file][accept^=".ics"]').setInputFiles(file);
  await choose(page.getByLabel('Modul für Algorithmen Vorlesung'), '__new');
  await page.getByRole('button', { name: 'Importieren', exact: true }).click();
  await expect(page.getByText('3 Termine importiert.').first()).toBeVisible();
});

test('Schnelleingabe legt eine Hausaufgabe an, mit Rückgängig', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Heute').click();
  await page.getByRole('button', { name: 'Schnelleingabe öffnen' }).click();
  await page.getByLabel('Was steht an?').fill('Blatt 9 Diskrete morgen');
  await expect(page.getByRole('radio', { name: 'Hausaufgabe' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.preview-chip', { hasText: 'Diskrete Strukturen' })).toBeVisible();
  await page.getByRole('button', { name: 'Hausaufgabe anlegen' }).click();
  await expect(page.getByText('Hausaufgabe angelegt.')).toBeVisible();
  await expect.poll(async () => (await stored(page))?.homework.some((h) => h.title === 'Blatt 9')).toBe(true);
  await page.getByRole('button', { name: 'Rückgängig' }).first().click();
  await expect.poll(async () => (await stored(page))?.homework.some((h) => h.title === 'Blatt 9')).toBe(false);
  // Ohne Modul geht es ins Formular weiter
  await page.keyboard.press('e');
  await page.getByLabel('Was steht an?').fill('Blatt 10 Fr');
  await expect(page.getByText('Modul fehlt')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter im Formular' }).click();
  await expect(page.getByRole('dialog', { name: /Hausaufgabe/ })).toBeVisible();
  await expect(page.getByLabel(/^Titel/)).toHaveValue('Blatt 10');
});

test('Tastenkürzel: Hilfe, Tabs, Timer, Listen-Navigation', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Heute').click();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Tastenkürzel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: /Woche \d+/ })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('1');
  await page.keyboard.press('j');
  const focused = await page.evaluate(() => !!document.activeElement.closest('main li'));
  expect(focused).toBe(true);
  // In Eingabefeldern greifen die Kürzel nicht
  await page.keyboard.press('e');
  await page.getByLabel('Was steht an?').fill('n');
  await expect(page.getByRole('dialog', { name: /Notiz/ })).toHaveCount(0);
});

test('Als-Nächstes-Karte zeigt die überfällige Abgabe und erledigt sie per Knopf', async ({ page }) => {
  // feste Uhrzeit ohne laufende Beispiel-Vorlesung (die hätte auf der Karte Vorrang)
  await page.clock.setFixedTime(new Date('2026-10-20T19:30:00+02:00'));
  await loadDemo(page);
  await nav(page, 'Heute').click();
  await page.getByRole('button', { name: 'Schnelleingabe öffnen' }).click();
  await page.getByLabel('Was steht an?').fill('Überfälliges Blatt Diskrete heute');
  await page.getByRole('button', { name: 'Hausaufgabe anlegen' }).click();
  const hero = page.getByRole('region', { name: 'Als Nächstes' });
  await expect(hero).toContainText('Überfälliges Blatt');
  await expect(hero).toContainText('Abgabe heute');
  await hero.getByRole('button', { name: 'Abgegeben' }).click();
  await expect(hero).not.toContainText('Überfälliges Blatt');
});

test('Wischen nach rechts markiert eine Abgabe als abgegeben', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  const row = page.locator('.swipe .row').filter({ hasText: 'Übungsblatt 1' }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' })); // nicht hinter der schwebenden Navigation
  const box = await row.boundingBox();
  const y = box.y + 18;
  await page.mouse.move(box.x + 30, y);
  await page.mouse.down();
  for (let x = 40; x <= 180; x += 20) await page.mouse.move(box.x + x, y);
  await page.mouse.up();
  await expect(page.getByText(/„Übungsblatt 1.*abgegeben\./)).toBeVisible();
});

test('Wochenraster zeigt heute und Termine als Blöcke', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await expect(page.locator('.grid-day.today')).toHaveCount(1);
  expect(await page.locator('.ev').count()).toBeGreaterThan(0);
  await page.locator('.ev').first().click();
  await expect(page.getByRole('dialog', { name: /Lehrveranstaltung bearbeiten/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Liste' }).click();
  await expect(page.locator('.row').first()).toBeVisible();
});

async function sessionToday(page, start, end) {
  await expect.poll(async () => (await page.evaluate(async () => (await window.STUDYOS_ENV.load())?.modules?.length || 0))).toBeGreaterThan(0);
  await page.evaluate(async ([start, end]) => {
    const d = await window.STUDYOS_ENV.load();
    const t = new Date().toLocaleDateString('sv-SE');
    d.sessions.push({ id: 'heute-' + start, moduleId: d.modules[0].id, type: 'Vorlesung', date: t, start, end, room: 'MI HS 1 / Interims I', prepared: false, attended: false, reviewed: false });
    await window.STUDYOS_ENV.save(d);
  }, [start, end]);
  await page.reload();
}
const session = (page, id) => page.evaluate(async (id) => (await window.STUDYOS_ENV.load()).sessions.find((s) => s.id === id), id);

test('Wochenraster: Maus kurz über Termin zeigt Karte, dort abhaken; Klick öffnet weiter das Formular', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await loadDemo(page);
  await sessionToday(page, '00:05', '00:06');
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  const ev = page.locator('.grid-col.today .ev').first();
  await ev.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await ev.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await expect(page.locator('.popover')).toHaveCount(0); // nicht sofort
  await expect(page.locator('.popover')).toBeVisible({ timeout: 2000 });
  const card = page.locator('.popover');
  await card.getByRole('button', { name: 'Nachbereitet' }).click();
  await expect(card.getByRole('button', { name: 'Nachbereitet' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Besucht' }).click();
  await expect.poll(async () => (await session(page, 'heute-00:05'))).toMatchObject({ reviewed: true, attended: true });
  await page.mouse.move(2, 2);
  await expect(page.locator('.popover')).toHaveCount(0);
  await ev.click();
  await expect(page.getByRole('dialog', { name: /Lehrveranstaltung bearbeiten/ })).toBeVisible();
  await ctx.close();
});

test('Wochenraster auf dem Handy: Antippen öffnet die Karte statt des Formulars', async ({ page }) => {
  await loadDemo(page);
  await sessionToday(page, '10:00', '12:00');
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await page.locator('.ev.ev-review, .ev').first().tap();
  await expect(page.locator('.popover')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /bearbeiten/ })).toHaveCount(0);
  await page.locator('.popover').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('dialog', { name: /Lehrveranstaltung bearbeiten/ })).toBeVisible();
});

test('Heute: Tagesplan mit Dreifach-Schalter und Checkliste zum Abhaken', async ({ page }) => {
  await loadDemo(page);
  await sessionToday(page, '00:05', '00:06');
  await nav(page, 'Heute').click();
  const row = page.locator('.tl-row').first();
  await expect(row).toContainText('MI HS 1 / Interims I');
  await row.getByRole('button', { name: 'Vorbereitet' }).click();
  await expect.poll(async () => (await session(page, 'heute-00:05')).prepared).toBe(true);
  // heutiger Termin erscheint nicht zusätzlich in der Checkliste
  await expect(page.locator('.todo-row', { hasText: 'Vorlesung vom' })).toHaveCount(0);
  const todo = page.locator('.todo-row', { hasText: 'Übungsblatt 1' }).first();
  await todo.getByRole('button', { name: /Erledigt/ }).click();
  await expect(page.getByText(/„Übungsblatt 1.*abgegeben\./)).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).first().click();
  await expect(page.locator('.todo-row', { hasText: 'Übungsblatt 1' })).toHaveCount(2);
});

test('Module zusammenführen: Vorschlag, Obermodul wählen, Rückgängig', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const t = new Date().toLocaleDateString('sv-SE');
    const mods = [['ds', 'Diskrete Strukturen'], ['ue', 'Übungen zu Diskrete Strukturen'], ['tu', 'Tutorübungen zu Diskrete Strukturen'], ['la', 'Lineare Algebra']]
      .map(([id, name], i) => ({ id, name, ects: 6, semester: 1, status: 'belegt', color: ['#38bdf8', '#34d399', '#fbbf24', '#fb7185'][i] }));
    const ses = mods.map((m, i) => ({ id: 's' + i, moduleId: m.id, type: 'Vorlesung', date: t, start: `1${i}:00`, end: `1${i}:30` }));
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: mods, sessions: ses, homework: [{ id: 'h', moduleId: 'tu', title: 'Blatt 1', due: t, status: 'ausgegeben' }], topics: [], logs: [], notes: [], cards: [], exams: [] });
  });
  await page.reload();
  await nav(page, 'Module').click();
  await expect(page.getByText('Gehören diese Module zusammen?')).toBeVisible();
  await page.getByRole('button', { name: 'Zusammenführen …' }).click();
  const dlg = page.getByRole('dialog', { name: 'Module zusammenführen' });
  await expect(dlg.getByRole('button', { name: 'Obermodul', exact: true })).toBeVisible();
  // Vorgeschlagen ist „Diskrete Strukturen“; der Nutzer wählt bewusst ein anderes und dann wieder das richtige
  await dlg.locator('.merge-row', { hasText: 'Tutorübungen' }).getByRole('button', { name: 'Als Obermodul' }).click();
  await expect(dlg.locator('.merge-row', { hasText: 'Tutorübungen' }).getByRole('button')).toHaveText('Obermodul');
  await dlg.locator('.merge-row').filter({ hasText: /^Diskrete Strukturen/ }).getByRole('button', { name: 'Als Obermodul' }).click();
  await expect(dlg.getByText(/In Diskrete Strukturen landen: 2 Termine, 1 Hausaufgabe/)).toBeVisible();
  await dlg.getByRole('button', { name: '3 Module zusammenführen' }).click();
  await expect(page.getByText('3 Module zu „Diskrete Strukturen“ zusammengeführt.')).toBeVisible();
  const state = () => page.evaluate(async () => { const d = await window.STUDYOS_ENV.load(); return { mods: d.modules.map((m) => m.name).sort(), ses: [...new Set(d.sessions.map((s) => s.moduleId))].sort(), hw: d.homework[0].moduleId }; });
  await expect.poll(state).toEqual({ mods: ['Diskrete Strukturen', 'Lineare Algebra'], ses: ['ds', 'la'], hw: 'ds' });
  await expect(page.getByText('Gehören diese Module zusammen?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).first().click();
  await expect.poll(async () => (await state()).mods.length).toBe(4);
});

test('Termin bearbeiten: Änderung auf alle folgenden gleichen Termine übertragen', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    const s = (id, n, extra = {}) => ({ id, moduleId: 'ds', type: 'Vorlesung', date: day(n), start: '10:15', end: '11:45', room: 'HS 1', feedKey: id + '|x', ...extra });
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [s('a', 1), s('b', 8, { prepared: true }), s('c', 15), s('d', 9)], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] });
  });
  await page.reload();
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Liste' }).click();
  // ersten Termin der nächsten Tage öffnen (ggf. in der nächsten Woche)
  for (let i = 0; i < 2 && !(await page.locator('.row-main', { hasText: 'Diskrete' }).count()); i++) await page.getByRole('button', { name: 'Nächste Woche' }).click();
  await page.locator('.row-main', { hasText: 'Diskrete' }).first().click();
  const dlg = page.getByRole('dialog', { name: /Lehrveranstaltung bearbeiten/ });
  await expect(dlg.getByText('Änderungen auf alle folgenden gleichen Termine übertragen (2 weitere)')).toBeVisible();
  await dlg.getByLabel('Raum').fill('Interims I');
  await dlg.getByText(/Änderungen auf alle folgenden/).click();
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Auch 2 folgende Termine geändert.')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Object.fromEntries((await window.STUDYOS_ENV.load()).sessions.map((s) => [s.id, [s.room, !!s.prepared, (s.locked || []).join()]])))).toEqual({ a: ['Interims I', false, 'room'], b: ['Interims I', true, 'room'], c: ['Interims I', false, 'room'], d: ['HS 1', false, ''] });
});

const seed = (page, extraFn) => page.evaluate(async (src) => {
  const extra = new Function('return ' + src)();
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const base = { version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399', bonusPct: 50 }],
    sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] };
  const d = { ...base, ...extra(day) };
  await window.STUDYOS_ENV.save(d);
}, extraFn.toString());

test('Blatt-Serie anlegen, Bonus-Prognose und Workload im Modul', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399', bonusPct: 50, semesterStart: day(-14) }],
      sessions: [], homework: [], topics: [], logs: [{ id: 'l', moduleId: 'ds', date: day(-1), minutes: 120 }], notes: [], cards: [], exams: [] });
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Als Nächstes' })).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('h');
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Titel').fill('Blatt 1');
  await dlg.getByLabel('Maximale Punkte').fill('20');
  await dlg.getByLabel('Abgabe').fill(await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toLocaleDateString('sv-SE'); }));
  const until = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString('sv-SE'); });
  await dlg.getByLabel('Jede Woche ein neues Blatt bis (optional)').fill(until);
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText(/Blätter angelegt\./)).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).homework.length)).toBeGreaterThanOrEqual(4);
  const titles = await page.evaluate(async () => (await window.STUDYOS_ENV.load()).homework.map((h) => h.title));
  expect(titles.slice(0, 3)).toEqual(['Blatt 1', 'Blatt 2', 'Blatt 3']);
  expect(titles.length).toBeGreaterThanOrEqual(4);

  await nav(page, 'Module').click();
  await page.getByText('Diskrete Strukturen').first().click();
  await expect(page.getByText('Notenbonus (Hausaufgaben)')).toBeVisible();
  await expect(page.getByText('Arbeitsaufwand')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Altklausuren eintragen und im Lernplan', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ exams: [{ id: 'x', moduleId: 'ds', date: day(10), kind: 'Klausur' }] }));
  await page.reload();
  await page.goto('./?aktion=pruefungen');
  await page.getByRole('button', { name: /Altklausuren eintragen/ }).click();
  await page.getByLabel('Neue Altklausur').fill('WS 2024/25');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: 'Lernplan anzeigen' }).click();
  await expect(page.getByText('Altklausur rechnen: WS 2024/25').first()).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Status WS 2024/25' }).getByRole('radio', { name: 'Gerechnet' }).click();
  await page.getByLabel('Punkte WS 2024/25', { exact: true }).fill('45');
  await page.getByLabel('Maximalpunkte WS 2024/25').fill('90');
  await expect(page.getByRole('button', { name: /Altklausuren \(1 von 1 gerechnet, ⌀ 50 %\)/ })).toBeVisible();
  await expect(page.getByText('Altklausur rechnen: WS 2024/25')).toHaveCount(0);
});

test('Karteikarten aus einer Notiz erzeugen', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ notes: [{ id: 'n', moduleId: 'ds', title: 'Graphen', date: day(0), text: 'Was ist ein Baum? :: Ein zusammenhängender, kreisfreier Graph\nEin {{c1::Blatt}} hat Grad 1.' }] }));
  await page.reload();
  await nav(page, 'Module').click();
  await page.getByText('Diskrete Strukturen').first().click();
  await page.getByRole('tab', { name: /Notizen/ }).click();
  await page.getByText('Graphen').first().click();
  await page.getByRole('button', { name: '2 Karteikarten erzeugen' }).click();
  await expect(page.getByText('2 Karteikarten aus „Graphen“ erzeugt.')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).cards.map((c) => c.front).sort())).toEqual(['Ein {{c1::Blatt}} hat Grad 1.', 'Was ist ein Baum?']);
});

test('Studienplan übernehmen und Semester archivieren', async ({ page }) => {
  await page.goto('./');
  await seed(page, () => ({ modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 0, semester: 1, status: 'belegt', color: '#34d399' }] }));
  await page.reload();
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: 'Aus Studienplan übernehmen …' }).click();
  const dlg = page.getByRole('dialog', { name: 'Studienplan übernehmen' });
  await dlg.getByRole('region', { name: 'Semester 1' }).getByRole('button', { name: '2 anlegen' }).click();
  await expect(page.getByText('Semester 1: 2 Module angelegt, 1 ergänzt.')).toBeVisible();
  await dlg.getByRole('region', { name: 'Semester 2' }).getByRole('button', { name: '5 anlegen' }).click();
  await dlg.getByRole('button', { name: /Schließen/ }).click();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).modules.length)).toBe(8);
  const mods = await page.evaluate(async () => (await window.STUDYOS_ENV.load()).modules);
  expect(mods.find((m) => m.id === 'ds')).toMatchObject({ code: 'IN0015', ects: 8 });
  expect(mods.find((m) => m.code === 'MA0901').status).toBe('geplant');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Semester 1 archivieren → aus der Hauptliste ins Archiv
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  await page.getByRole('button', { name: 'Archivieren' }).first().click();
  await nav(page, 'Module').click();
  await expect(page.getByRole('heading', { name: /Archiv/ })).toBeVisible();
});

test('Mensa, GOP-Karte, Raum-Link und FSRS-Vorschau', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ settings: { university: 'TUM' },
    modules: [{ id: 'ds', name: 'Diskrete Strukturen', code: 'IN0015', ects: 8, semester: 1, status: 'bestanden', grade: 2.0, color: '#34d399', liveUrl: 'https://live.rbg.tum.de/old/course/2026/W/ds' },
      { id: 'era', name: 'Rechnerarchitektur', code: 'IN0004', ects: 8, semester: 1, status: 'belegt', color: '#38bdf8' }],
    sessions: [{ id: 's', moduleId: 'ds', type: 'Vorlesung', date: day(0), start: '00:00', end: '23:59', room: 'MI HS 1 (5602.EG.001)' }],
    cards: [{ id: 'c', moduleId: 'ds', front: 'Was ist ein Graph?', back: 'G=(V,E)', tags: '', ease: 2.5, interval: 0, reps: 0, due: day(0) }] }));
  await page.reload();
  // Mensa auf Heute
  await expect(page.getByRole('region', { name: 'Mensa' }).getByText('Testpasta mit Tomaten')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mensa' }).getByText('0,90 €/100g')).toBeVisible();
  // Raum und Aufzeichnung im Tagesplan
  await expect(page.getByRole('link', { name: 'Raum finden: MI HS 1 (5602.EG.001) in NavigaTUM öffnen' }).first()).toHaveAttribute('href', 'https://nav.tum.de/room/5602.EG.001');
  await expect(page.getByRole('link', { name: 'Aufzeichnung ↗' }).first()).toHaveAttribute('href', /live\.rbg\.tum\.de/);
  // GOP
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  await expect(page.getByText('Es fehlen noch')).toBeVisible();
  await expect(page.getByText('Reicht zum Beispiel: Rechnerarchitektur', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Was wäre wenn/ }).click();
  await page.getByLabel('Erwartete Note Rechnerarchitektur').fill('1,0');
  await page.getByLabel('Erwartete Note Rechnerarchitektur').blur();
  await expect(page.getByText(/Ø 1,50/)).toBeVisible();
  // FSRS: neue Karte, Vorschau der Intervalle
  await page.goto('./?aktion=karten');
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await expect(page.getByRole('button', { name: /Gut.*3 Tage/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Leicht.*16 Tage/ })).toBeVisible();
  await page.getByRole('button', { name: /Gut.*3 Tage/ }).click();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).cards[0].stability)).toBeCloseTo(3.173, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Formeln und eingefärbter Code in Notizen', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ notes: [{ id: 'n', moduleId: 'ds', title: 'Summen', date: day(0), text: 'Gauß: $\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$\n\n$$\\int_0^1 x^2\\,dx$$\n\n```java\nint x = 42; // Antwort\n```' }] }));
  await page.reload();
  await nav(page, 'Module').click();
  await page.getByText('Diskrete Strukturen').first().click();
  await page.getByRole('tab', { name: /Notizen/ }).click();
  await page.getByText('Summen').first().click();
  const dlg = page.getByRole('dialog', { name: 'Summen' });
  await expect(dlg.locator('.math-inline .katex')).toHaveCount(1);
  await expect(dlg.locator('.math-block .katex-display')).toHaveCount(1);
  await expect(dlg.locator('code.hljs .hljs-number')).toHaveText('42');
  await expect(dlg.locator('code.hljs .hljs-comment')).toHaveText('// Antwort');
  await expect(dlg.locator('.code-lang')).toHaveText('java');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.katex')).fontFamily)).toContain('KaTeX');
});

test('Lernblöcke vorschlagen, im Tagesplan, Timer starten; Was jetzt?', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T08:00:00') });
  await page.goto('./');
  await seed(page, () => ({ sessions: [
      { id: 'a', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-19', start: '10:00', end: '12:00' },
      { id: 'b', moduleId: 'ds', type: 'Übung', date: '2026-10-19', start: '14:00', end: '16:00' }],
    homework: [{ id: 'h', moduleId: 'ds', title: 'Blatt 3', due: '2026-10-20', status: 'ausgegeben' }] }));
  await page.reload();
  await nav(page, 'Woche').click();
  await page.getByRole('button', { name: 'Lernblöcke vorschlagen' }).click();
  await expect(page.getByText('Mo 12:15–13:45')).toBeVisible();
  await page.getByRole('button', { name: 'Lernblock Mo 12:15 übernehmen' }).click();
  await expect(page.getByText('1 Lernblock eingeplant.')).toBeVisible();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await expect(page.locator('.ev-block')).toHaveCount(1);
  await nav(page, 'Heute').click();
  await expect(page.locator('.tl-block')).toContainText('Vorlesung nachbereiten');
  await page.locator('.tl-block').getByRole('button', { name: 'Timer starten' }).click();
  await expect(page.getByRole('tab', { name: 'Timer', selected: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('studyos-timer-v1') || '{}').length)).toBe(90);
  // Was jetzt?
  await nav(page, 'Heute').click();
  await page.getByRole('button', { name: 'Was jetzt?' }).click();
  const dlg = page.getByRole('dialog', { name: 'Was jetzt?' });
  await dlg.getByRole('radio', { name: '60 min' }).click();
  await expect(dlg.getByRole('region', { name: 'Vorschlag' })).toContainText('Blatt 3');
  await expect(dlg.getByRole('region', { name: 'Vorschlag' })).toContainText('morgen fällig');
  await dlg.getByRole('button', { name: '50 Minuten starten' }).click();
  await expect(page.getByRole('tab', { name: 'Timer', selected: true })).toBeVisible();
});

test('Anhang an eine Hausaufgabe (lokal) und Probeklausur', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ homework: [{ id: 'h', moduleId: 'ds', title: 'Blatt 3', due: day(3), status: 'ausgegeben' }],
    exams: [{ id: 'x', moduleId: 'ds', date: day(20) }],
    cards: [1, 2, 3].map((i) => ({ id: 'c' + i, moduleId: 'ds', front: 'Frage ' + i, back: 'Antwort ' + i, tags: i === 3 ? 'graphen' : 'mengen', ease: 2.5, interval: 0, reps: 0, due: day(5) })) }));
  await page.reload();
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  await page.getByText('Blatt 3').first().click();
  const dlg = page.getByRole('dialog', { name: /bearbeiten/ });
  await dlg.getByLabel('Datei anhängen').setInputFiles({ name: 'blatt3.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 Test') });
  await expect(dlg.getByRole('link', { name: 'blatt3.pdf' })).toBeVisible();
  await expect(dlg.getByText(/nur auf diesem Gerät/)).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).homework[0].files?.[0]?.name)).toBe('blatt3.pdf');
  await dlg.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByText('1 Anhang')).toBeVisible();
  // Probeklausur
  await page.goto('./?aktion=pruefungen');
  await page.getByRole('button', { name: 'Probeklausur' }).click();
  const mock = page.getByRole('dialog', { name: /Probeklausur/ });
  await mock.getByRole('button', { name: 'Starten' }).click();
  for (let i = 0; i < 3; i++) {
    await mock.getByRole('button', { name: 'Lösung zeigen' }).click();
    const front = await mock.locator('.surface').innerText();
    await mock.getByRole('button', { name: front.includes('Frage 3') ? 'Nicht gewusst' : 'Gewusst', exact: true }).click();
  }
  const res = page.getByRole('dialog', { name: 'Auswertung' });
  await expect(res.getByText('67 %')).toBeVisible();
  await expect(res.getByText('graphen')).toBeVisible();
  await res.getByRole('button', { name: '1 unsichere Karten heute wiederholen' }).click();
  await expect.poll(() => page.evaluate(async () => (await window.STUDYOS_ENV.load()).cards.find((c) => c.id === 'c3').due)).toBe(await page.evaluate(() => new Date().toLocaleDateString('sv-SE')));
});

test('Wochenraster zeigt Samstag/Sonntag, wenn dort eine Abgabe liegt', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T09:00:00') }); /* Mittwoch */
  await page.goto('./');
  await seed(page, () => ({ sessions: [{ id: 'a', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-21', start: '10:00', end: '12:00' }],
    homework: [{ id: 'h', moduleId: 'ds', title: 'Blatt 3', due: '2026-10-24', status: 'ausgegeben' }] }));
  await page.reload();
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await expect(page.locator('.grid-day')).toHaveText(['Mo19', 'Di20', 'Mi21', 'Do22', 'Fr23', 'Sa24']);
  await expect(page.getByRole('button', { name: /Abgabe Blatt 3/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Teilen-Ziel: geteilte PDF wird zur Notiz mit Anhang', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // jetzt steuert der Service Worker die Seite
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const received = await page.evaluate(async () => {
    const fd = new FormData();
    fd.append('title', 'Skript Kapitel 3');
    fd.append('text', 'Bitte bis Freitag lesen');
    fd.append('url', 'https://www.moodle.tum.de/course/1');
    fd.append('files', new File(['%PDF-1.4 Testinhalt'], 'skript.pdf', { type: 'application/pdf' }));
    await fetch('./teilen-ziel', { method: 'POST', body: fd });
    const inbox = await (await caches.open('studyos-share-inbox')).match('./geteilt.json');
    return inbox ? (await inbox.json()).files.map((f) => f.name) : null;
  });
  expect(received).toEqual(['skript.pdf']); // vom Service Worker angenommen
  await page.goto('./?aktion=geteilt');
  await expect(page.getByText('Als Notiz mit 1 Anhang gespeichert.')).toBeVisible();
  const dlg = page.getByRole('dialog', { name: /bearbeiten/ });
  await expect(dlg.getByLabel('Titel')).toHaveValue('Skript Kapitel 3');
  await expect(dlg.getByText('skript.pdf')).toBeVisible();
  await expect.poll(async () => (await stored(page))?.notes?.map((n) => [n.title, n.text, n.files?.length])).toEqual([['Skript Kapitel 3', 'Bitte bis Freitag lesen\n\nhttps://www.moodle.tum.de/course/1', 1]]);
  // ein zweites Öffnen legt nichts doppelt an
  await page.goto('./?aktion=geteilt');
  await page.waitForTimeout(500);
  expect((await stored(page)).notes.length).toBe(1);
});

test('Retro ist das einzige Farbschema: alle Bereiche ohne horizontales Scrollen', async ({ page }) => {
  await loadDemo(page);
  await openData(page);
  await expect(page.getByRole('tablist', { name: 'Darstellung' })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'retro');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d0221');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#0d0221');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).borderRadius)).toBe('0px');
  const subs = { Lernen: ['Timer', 'Lerneinheiten', 'Karteikarten', 'Prüfungen & Lernplan'], Mehr: ['Wochenrückblick', 'Alle Hausaufgaben', 'Studienfortschritt', 'Daten & Einstellungen'], Woche: ['Raster', 'Liste'] };
  for (const tab of ['Heute', 'Module', 'Woche', 'Lernen', 'Mehr']) {
    await nav(page, tab).click();
    for (const sub of subs[tab] || [null]) {
      if (sub) await page.getByRole('tab', { name: sub }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Retro ${tab}/${sub}`).toBe(true);
    }
  }
  await nav(page, 'Module').click();
  await page.locator('.tile').first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Retro Modul').toBe(true);
  // Pixel-Schriften sind geladen, Bricolage wird im Retro-Theme nicht gebraucht
  expect(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).sort(); })).toEqual(expect.arrayContaining(['JetBrains Mono', 'Silkscreen']));
  // auch ein alter Datenstand mit „Hell“ bleibt Retro
  await page.evaluate(async () => { const d = await window.STUDYOS_ENV.load(); d.settings.theme = 'light'; await window.STUDYOS_ENV.save(d); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'retro');
});

test('Knopf auf „Als Nächstes“ bleibt nach dem Antippen in der Modulfarbe (kein hängendes Hover)', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T13:00:00+02:00')); // vor der Vorlesung um 14 Uhr
  await loadDemo(page);
  await nav(page, 'Heute').click();
  const btn = page.locator('.hero .btn-solid');
  const before = await btn.evaluate((e) => getComputedStyle(e).backgroundColor);
  await btn.hover(); // so verhält sich ein Touch-Gerät nach dem Antippen: :hover bleibt stehen
  await btn.click();
  await expect(btn).toHaveText('Vorbereitet ✓');
  expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(before);
});

test('Heute: Aufzeichnung direkt aus der Nachbereitung, Abschnitte einklappen; Retro-Animationen umschalten', async ({ page }) => {
  await loadDemo(page);
  await expect.poll(async () => (await stored(page))?.modules?.length ?? 0).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const d = await window.STUDYOS_ENV.load();
    d.modules = d.modules.map((m) => ({ ...m, liveUrl: 'https://live.rbg.tum.de/?kurs=' + m.id }));
    d.settings.mensa = 'mensa-garching';
    await window.STUDYOS_ENV.save(d);
  });
  await page.reload();
  await nav(page, 'Heute').click();
  const review = page.locator('.todo-row', { hasText: 'Nachbereiten:' }).first();
  await expect(review.getByRole('link', { name: /^Aufzeichnung von .+ öffnen/ })).toHaveAttribute('href', /^https:\/\/live\.rbg\.tum\.de\//);
  await expect(page.locator('.todo-row', { hasText: 'Abgabe' }).first().getByRole('link', { name: /Aufzeichnung/ })).toHaveCount(0);
  // Einklappen: nur die Überschrift bleibt, auch nach dem Neuladen
  const toggle = page.getByRole('button', { name: /^Zu erledigen/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.todo-row').first()).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Zu erledigen/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.todo-row').first()).toBeHidden();
  await page.getByRole('button', { name: /^Zu erledigen/ }).click();
  await expect(page.locator('.todo-row').first()).toBeVisible();
  // Retro: drei Animationsvarianten plus Aus; im Retro-Theme schließt sich ein Abschnitt erst nach seiner Animation
  await openData(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'pixel');
  for (const [name, key] of [['Neon', 'neon'], ['Scan', 'scan'], ['Aus', 'off'], ['Pixel', 'pixel']]) {
    await page.getByRole('tablist', { name: 'Retro-Animationen' }).getByRole('tab', { name }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', key);
  }
  await expect.poll(async () => (await stored(page)).settings.retroMotion).toBe('pixel');
  await nav(page, 'Heute').click();
  await page.getByRole('button', { name: /^Tagesplan/ }).click();
  await expect(page.locator('#heute-plan')).toBeHidden();
  await page.getByRole('button', { name: /^Tagesplan/ }).click();
  await expect(page.locator('#heute-plan')).toBeVisible();
  // Darüberfahren lässt die Knopffarbe stehen (vorher wurde der farbige Knopf auf „Als Nächstes“ dunkel)
  const solid = page.locator('.hero .btn-solid').first();
  const bgOf = () => solid.evaluate((el) => getComputedStyle(el).backgroundColor);
  const bgBefore = await bgOf();
  await solid.hover();
  expect(await bgOf()).toBe(bgBefore);
  // Mensa lässt sich genauso einklappen
  await page.getByRole('button', { name: 'Mensa', exact: true }).click();
  await expect(page.locator('#heute-mensa')).toBeHidden();
  await page.getByRole('button', { name: 'Mensa', exact: true }).click();
  await expect(page.locator('#heute-mensa')).toBeVisible();
  // gespeicherte Varianten aus 2.7.x gelten weiter (glitch → scan)
  await page.evaluate(async () => { const d = await window.STUDYOS_ENV.load(); d.settings.retroMotion = 'glitch'; await window.STUDYOS_ENV.save(d); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'scan');
});

test('neuer Nutzer: keine fremden Vorgaben, Studienplan Pharmazeutische Bioprozesstechnik mit GOP in zwei Stufen', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: 'Aus Studienplan' }).click();
  const dlg = page.getByRole('dialog', { name: 'Studienplan übernehmen' });
  await choose(dlg.getByLabel('Studiengang'), 'tum-bsc-pbt-2022');
  await dlg.getByRole('region', { name: 'Semester 1' }).getByRole('button', { name: '6 anlegen' }).click();
  await dlg.getByRole('button', { name: /Schließen/ }).click();
  await expect.poll(async () => (await stored(page))?.modules?.length ?? 0).toBe(6);
  const d = await stored(page);
  expect(d.settings).toMatchObject({ curriculum: 'tum-bsc-pbt-2022', program: 'Pharmazeutische Bioprozesstechnik', mensa: '', commute: null });
  expect(d.modules.filter((m) => m.gop).map((m) => m.code).sort()).toEqual(['LS30040', 'MA9615', 'PH9035', 'WZ5322']);
  await nav(page, 'Heute').click();
  await expect(page.getByRole('button', { name: 'Mensa', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Weg zur Uni/ })).toHaveCount(0);
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  await expect(page.getByText('0 / 10 ECTS aus GOP-Modulen bestanden')).toBeVisible();
  await expect(page.getByText('26 ECTS bis Ende des 3. Semesters')).toBeVisible();
  await expect(page.getByText(/Es fehlen noch 10 ECTS bis Ende des 2\. Semesters/)).toBeVisible();
});

test('Pixel-Extras: Wochenziel, Münze und Abschuss, Timer-Begleiter, Schwachstellen, Erfolge', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    localStorage.setItem('studyos-erfolge-gesehen', '[]');
    await window.STUDYOS_ENV.save({ version: 3, settings: { university: 'TUM', mensa: '', defaultsRev: 2 }, meta: { lastBackup: new Date().toISOString() },
      modules: [{ id: 'm', name: 'Analysis', ects: 8, semester: 1, status: 'belegt', color: '#34d399', weeklyGoal: 1 }], sessions: [], topics: [], notes: [], exams: [],
      homework: [{ id: 'h', moduleId: 'm', title: 'Blatt 1', due: day(3), status: 'ausgegeben' }],
      logs: [{ id: 'l', date: day(0), minutes: 75, moduleId: 'm' }],
      cards: [{ id: 'k', moduleId: 'm', front: 'Was ist {{c1::Stetigkeit}}?', back: 'ε-δ', tags: 'grenzwerte', due: day(5), reps: 2, lapses: 3, difficulty: 8, stability: 2 }] });
  });
  await page.reload();
  // erstes Abzeichen meldet sich
  await expect(page.getByText('Abzeichen freigeschaltet: „Erster Schritt“')).toBeVisible();
  const goals = page.locator('#heute-ziele');
  await expect(goals.getByText('1 h 15 min von 1 h')).toBeVisible();
  await expect(page.locator('.streak')).toHaveAttribute('data-tier', '1');
  // letzte Aufgabe abhaken: Münze springt, Invader wird abgeschossen
  await page.getByRole('button', { name: 'Erledigt: Blatt 1' }).click();
  await expect(page.locator('.px-burst')).toHaveCount(1);
  await expect(page.locator('#heute-todo .px-shot')).toBeVisible();
  await expect(page.locator('.px-burst')).toHaveCount(0);
  // nach einem Bereichswechsel nicht noch einmal
  await nav(page, 'Woche').click();
  await nav(page, 'Heute').click();
  await expect(page.getByText('Alles erledigt.')).toBeVisible();
  await expect(page.locator('.px-shot')).toHaveCount(0);
  // Timer-Begleiter
  await nav(page, 'Lernen').click();
  await expect(page.locator('.px-buddy')).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect(page.locator('.px-buddy')).toHaveAttribute('data-state', 'run');
  await page.getByRole('button', { name: 'Pausieren' }).click();
  // Schwachstellen üben, obwohl die Karte nicht fällig ist
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await expect(page.getByText('3× vergessen')).toBeVisible();
  await expect(page.getByText(/Am häufigsten: #grenzwerte \(1\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Schwachstellen üben (1)' }).click();
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await page.getByRole('button', { name: /^Gut/ }).click();
  await expect.poll(async () => (await stored(page)).cards[0].reviews).toBe(3);
  // Erfolge
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Erfolge' }).click();
  await expect(page.getByText(/von 13 Abzeichen freigeschaltet/)).toBeVisible();
  await expect(page.locator('.badge-done').filter({ hasText: 'Erster Schritt' })).toBeVisible();
  await expect(page.locator('.badge-locked').filter({ hasText: 'Kartenstapler' })).toContainText('3 / 100');
});

test('Timer: Musik in der Fokusphase, Signalton ausschalten, Pixel-Ring', async ({ page }) => {
  // Web Audio mitschreiben statt abspielen
  await page.addInitScript(() => {
    const log = window.__audio = { made: 0, closed: 0, osc: 0, loops: 0 };
    const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() {}, stop() {} });
    window.AudioContext = class {
      constructor() { log.made++; this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
      createGain() { return node(); }
      createBiquadFilter() { return node(); }
      createOscillator() { log.osc++; return node(); }
      createBufferSource() { const n = node(); Object.defineProperty(n, 'loop', { set(v) { if (v) log.loops++; } }); return n; }
      createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
      resume() { return Promise.resolve(); }
      close() { log.closed++; return Promise.resolve(); }
    };
  });
  await page.goto('./');
  await nav(page, 'Lernen').click();
  await expect(page.locator('.px-ring rect')).toHaveCount(40);
  await page.getByRole('tab', { name: '8-Bit' }).click();
  await expect(page.getByLabel('Lautstärke')).toBeVisible();
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.osc)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pausieren' }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.closed)).toBe(1);
  // Regen spielt zwei Rauschschleifen; aus = keine Musik
  await page.getByRole('tab', { name: 'Regen' }).click();
  await page.getByRole('button', { name: /^(Starten|Fortsetzen)$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.loops)).toBe(2);
  await page.getByRole('tab', { name: 'Aus', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.closed)).toBe(2);
  await expect(page.getByLabel('Lautstärke')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pausieren' }).click();
  // Signalton direkt am Timer ausschalten
  await page.getByLabel('Signalton und Vibration am Ende einer Phase').uncheck();
  await expect.poll(async () => (await stored(page)).settings.sound).toBe(false);
});

test('Aufzeichnung: „angeschaut bis“ eintragen, Stand erscheint bei Zu erledigen', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399', liveUrl: 'https://live.rbg.tum.de/old/course/2026/W/ds' }],
    sessions: [{ id: 's', moduleId: 'ds', type: 'Vorlesung', date: day(-1), start: '10:00', end: '11:30', room: 'MI HS 1' }] }));
  await page.reload();
  await page.getByRole('button', { name: /Nachbereiten: Vorlesung/ }).click();
  const dlg = page.getByRole('dialog', { name: /Lehrveranstaltung bearbeiten/ });
  await dlg.getByLabel(/Aufzeichnung angeschaut bis/).fill('7:99');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg.getByText(/bitte als 47:12/)).toBeVisible();
  await dlg.getByLabel(/Aufzeichnung angeschaut bis/).fill('45');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Geschaut bis 45:00 (50 %)').first()).toBeAttached();
  await expect(page.locator('.todo-row .watch-bar > span')).toHaveAttribute('style', /width: 50%/);
  await expect.poll(async () => (await stored(page)).sessions[0].watchedTo).toBe('45');
  // neu angeschaute Minuten zählen als Lernzeit fürs Modul
  await expect.poll(async () => (await stored(page)).logs.map((l) => [l.moduleId, l.kind, l.minutes])).toEqual([['ds', 'Aufzeichnung', 45]]);
});

test('Auswahlfelder und Kästchen im Pixel-Stil: Tastatur, Screenreader-Rollen, Tippen', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Lernen').click();
  const len = page.getByRole('combobox', { name: 'Fokusdauer' });
  await expect(len).toHaveAttribute('data-value', '25');
  // Tastatur: Pfeil öffnet, Ende springt zur letzten Option, Enter übernimmt
  await len.focus();
  await page.keyboard.press('ArrowDown');
  await expect(len).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('listbox', { name: 'Fokusdauer' });
  await expect(list.getByRole('option', { name: '25 min' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(len).toHaveAttribute('data-value', '90');
  await expect(len).toBeFocused();
  // Escape schließt nur die Liste, Antippen daneben auch
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(len).toHaveAttribute('data-value', '90');
  await len.click();
  await page.getByRole('option', { name: '45 min' }).click();
  await expect(len).toHaveAttribute('data-value', '45');
  await len.click();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  // Kästchen sind eigene Pixel-Kästchen, aber weiter echte Checkboxen
  await openData(page);
  const box = page.getByRole('checkbox').first();
  expect(await box.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
});

test('Timer: Lernnotiz nach der Fokusphase, Lerntagebuch und ECTS-Soll im Modul', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await page.goto('./');
  await seed(page, () => ({ sessions: [{ id: 's', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-13', start: '10:00', end: '12:00' }] }));
  await page.reload();
  await nav(page, 'Lernen').click();
  await choose(page.getByLabel('Modul', { exact: true }), 'ds');
  await expect(page.getByText(/hinter dem ECTS-Soll/)).toBeVisible();
  await choose(page.getByLabel('Fokusdauer'), '15');
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.clock.fastForward('15:05');
  const dlg = page.getByRole('dialog', { name: 'Fokusphase geschafft' });
  await expect(dlg).toContainText('15 min eingetragen für Diskrete Strukturen');
  // schon gespeichert, bevor die Notiz dazukommt
  await expect.poll(async () => (await stored(page)).logs.map((l) => [l.moduleId, l.minutes])).toEqual([['ds', 15]]);
  await dlg.getByLabel(/Was hast du gemacht/).fill('Blatt 2, Aufgabe 3 gerechnet');
  await dlg.getByLabel(/Was hast du gemacht/).press('Enter');
  await expect(dlg).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).logs[0].note).toBe('Blatt 2, Aufgabe 3 gerechnet');
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  await expect(page.locator('section').filter({ hasText: 'Lerntagebuch' }).getByText('Blatt 2, Aufgabe 3 gerechnet')).toBeVisible();
  await page.getByRole('tab', { name: 'Lernzeit' }).click();
  await expect(page.getByRole('region', { name: 'Lerntagebuch' })).toContainText('Blatt 2, Aufgabe 3 gerechnet');
  await expect(page.getByText(/hinter dem Soll/)).toBeVisible();
  await page.getByRole('button', { name: 'Als Wochenziel übernehmen' }).click();
  await expect.poll(async () => (await stored(page)).modules[0].weeklyGoal).toBeGreaterThan(0);
  await nav(page, 'Mehr').click();
  await expect(page.getByRole('heading', { name: 'Lernzeit gegen ECTS-Soll' })).toBeVisible();
});

test('Timer: „Nicht eintragen“ verwirft die Fokusphase', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await page.goto('./');
  await nav(page, 'Lernen').click();
  await choose(page.getByLabel('Fokusdauer'), '15');
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.clock.fastForward('15:05');
  await expect.poll(async () => (await stored(page))?.logs.length).toBe(1);
  await page.getByRole('dialog', { name: 'Fokusphase geschafft' }).getByRole('button', { name: 'Nicht eintragen' }).click();
  await expect.poll(async () => (await stored(page)).logs.length).toBe(0);
  await expect(page.getByText('Eintrag gelöscht.')).toBeVisible();
});
