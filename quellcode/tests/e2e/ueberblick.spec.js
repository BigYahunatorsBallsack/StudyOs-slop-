import { test, expect } from '@playwright/test';

/* Überblick: Wochensumme, „als Nächstes“ in der Modulliste mit Sortierung, Punkte pro Blatt */
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Konsolenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
/* Daten mit Tagen relativ zu heute (day(0) = heute) */
const seed = (page, extraFn) => page.evaluate(async (src) => {
  const extra = new Function('return ' + src)();
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  await window.STUDYOS_ENV.save({ version: 3, settings: { mensa: '', commute: null }, meta: {}, modules: [], sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [], ...extra(day) });
}, extraFn.toString());
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('Wochensumme im Wochenkopf und Stunden je Tag in Raster und Liste', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') }); /* Dienstag */
  await page.goto('./');
  await seed(page, (day) => ({
    modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
    sessions: [
      { id: 'a', moduleId: 'ds', type: 'Vorlesung', date: day(-1), start: '10:00', end: '12:00' },
      { id: 'b', moduleId: 'ds', type: 'Übung', date: day(0), start: '14:00', end: '15:30' },
      { id: 'c', moduleId: 'ds', type: 'Vorlesung', date: day(1), start: '08:15', end: '09:45', cancelled: true },
      { id: 'd', moduleId: 'ds', type: 'Vorlesung', date: day(7), start: '08:00', end: '18:00' },
    ],
    logs: [{ id: 'l', moduleId: 'ds', date: day(0), minutes: 90 }],
    homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', due: day(3), status: 'offen' }, { id: 'h2', moduleId: 'ds', title: 'Blatt 2', due: day(3), status: 'abgegeben' }],
  }));
  await page.reload();
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  const sum = page.locator('.week-sum');
  await expect(sum).toHaveText('3,5 h Termine1,5 h gelernt2 Abgaben');
  const head = page.locator('.grid-head');
  await expect(head.locator('.grid-day').nth(0).locator('.grid-sum')).toHaveText('2h2 h Termine');
  await expect(head.locator('.grid-day').nth(1).locator('.grid-sum [aria-hidden]')).toHaveText('1,5h');
  await expect(head.locator('.grid-day').nth(2).locator('.grid-sum')).toHaveCount(0); /* ausgefallen zählt nicht */
  expect(await noSideScroll(page)).toBe(true);
  /* eine Zeile am Handy: die Teile brechen nicht in sich um */
  const lines = await sum.evaluate((el) => new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size);
  expect(lines).toBe(1);

  await page.getByRole('tab', { name: 'Liste' }).click();
  await expect(sum).toHaveText('3,5 h Termine1,5 h gelernt2 Abgaben');
  await expect(page.getByRole('region', { name: /^Montag/ }).locator('.day-sum')).toHaveText('2 h Termine');
  await expect(page.getByRole('region', { name: /^Dienstag/ }).locator('.day-sum')).toHaveText('1,5 h Termine · 1,5 h gelernt');

  await page.getByRole('button', { name: 'Nächste Woche' }).click();
  await expect(sum).toHaveText('10 h Termine');
  await page.getByRole('tab', { name: 'Monat' }).click();
  await expect(sum).toHaveCount(0);
});

test('Modulliste zeigt das Nächste und sortiert nach Dringlichkeit (pro Gerät gemerkt)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00') }); /* Mittwoch */
  await page.goto('./');
  await seed(page, (day) => ({
    modules: [
      { id: 'a', name: 'Analysis', ects: 9, semester: 1, status: 'belegt', color: '#34d399' },
      { id: 'b', name: 'Betriebssysteme', ects: 8, semester: 3, status: 'belegt', color: '#60a5fa' },
      { id: 'c', name: 'Chemie', ects: 5, semester: 2, status: 'belegt', color: '#f472b6' },
    ],
    homework: [{ id: 'h', moduleId: 'a', title: 'Blatt 2', due: day(2), status: 'offen' }, { id: 'h2', moduleId: 'c', title: 'Protokoll', due: day(1), status: 'offen' }],
    exams: [{ id: 'e', moduleId: 'b', date: day(40), result: 'offen' }],
  }));
  await page.reload();
  await nav(page, 'Module').click();
  const tiles = page.locator('.tiles .tile');
  await expect(tiles.locator('.tile-name')).toHaveText(['Analysis', 'Chemie', 'Betriebssysteme']);
  await expect(page.getByRole('button', { name: /Analysis.*Abgabe „Blatt 2“ am Freitag/ })).toBeVisible();
  await expect(tiles.nth(0).locator('.tile-next [aria-hidden]')).toHaveText('Abgabe Fr');
  await expect(tiles.nth(1).locator('.tile-next')).toHaveClass(/tile-next-urgent/);
  await expect(tiles.nth(2).locator('.tile-next [aria-hidden]')).toHaveText('Prüfung in 40 Tagen');

  const sort = page.getByRole('tablist', { name: 'Sortierung' });
  await sort.getByRole('tab', { name: 'Dringlichkeit' }).click();
  await expect(tiles.locator('.tile-name')).toHaveText(['Chemie', 'Analysis', 'Betriebssysteme']);
  await page.reload();
  await nav(page, 'Module').click();
  await expect(page.getByRole('tablist', { name: 'Sortierung' }).getByRole('tab', { name: 'Dringlichkeit' })).toHaveAttribute('aria-selected', 'true');
  await expect(tiles.locator('.tile-name')).toHaveText(['Chemie', 'Analysis', 'Betriebssysteme']);
  expect(await noSideScroll(page)).toBe(true);
});

test('Punkte pro Blatt als Balken mit Bonusgrenze, als Tabelle lesbar', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({
    modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399', bonusPct: 50 }],
    homework: [
      { id: 'b1', moduleId: 'ds', title: 'Blatt 1', due: day(-14), status: 'bewertet', points: 9, maxPoints: 10 },
      { id: 'b2', moduleId: 'ds', title: 'Blatt 2', due: day(-7), status: 'bewertet', points: 4, maxPoints: 10 },
      { id: 'b3', moduleId: 'ds', title: 'Blatt 3', due: day(7), status: 'offen', maxPoints: 10 },
      { id: 'b4', moduleId: 'ds', title: 'Blatt 4', due: day(14), status: 'offen', maxPoints: 10 },
    ],
  }));
  await page.reload();
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  const chart = page.getByRole('img', { name: /^Punkte pro Blatt/ });
  await expect(chart).toHaveAccessibleName('Punkte pro Blatt. Blatt 1: 9 von 10; Blatt 2: 4 von 10; Blatt 3: offen, 10 möglich; Blatt 4: offen, 10 möglich. Bonusgrenze 50 %. auf den offenen Blättern im Schnitt 35 % nötig');
  await expect(chart.locator('.sheetbar')).toHaveCount(4);
  await expect(chart.locator('.sheetbar-low')).toHaveCount(1); /* Blatt 2 unter der Grenze */
  await expect(chart.locator('.sheetbar-need')).toHaveCount(2);
  await page.getByText('Als Tabelle').click();
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /Blatt 2/ })).toContainText('4 / 10');
  await expect(table.getByRole('row', { name: /Blatt 3/ })).toContainText('nötig 35 %');
});
