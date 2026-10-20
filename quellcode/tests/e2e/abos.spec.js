import { test, expect } from '@playwright/test';

/* Modulseite und Abgaben: Aufzeichnungs-Rückstand, übliche Bearbeitungszeit, volle Abgabetage, Link zur Aufgabe */
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] })); /* Wetter: nie ins Netz */
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Seitenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });

test('Rückstand, Bearbeitungszeit, volle Abgabetage und Link zur Aufgabe', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    const ses = (id, n, extra = {}) => ({ id, moduleId: 'ds', type: 'Vorlesung', date: day(n), start: '10:00', end: '11:30', cancelled: false, prepared: false, attended: false, reviewed: false, ...extra });
    const hw = (id, title, due, status = 'ausgegeben', extra = {}) => ({ id, moduleId: 'ds', title, due: day(due), status, ...extra });
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [ses('a', -7), ses('b', -14, { watchedTo: '60:00' }), ses('c', -21, { attended: true })],
      homework: [hw('h1', 'Blatt 1', -14, 'abgegeben'), hw('h2', 'Blatt 2', -7, 'abgegeben'), hw('h3', 'Blatt 3', 3, 'ausgegeben', { feedKey: 'moodle|1@m', source: 'moodle', url: 'https://moodle.example/mod/assign/view.php?id=3' }), hw('x1', 'Andere 1', 3), hw('x2', 'Andere 2', 3)],
      logs: [{ id: 'l1', moduleId: 'ds', date: day(-15), minutes: 110, kind: 'Übung/Hausaufgabe', homeworkId: 'h1' }, { id: 'l2', moduleId: 'ds', date: day(-8), minutes: 130, kind: 'Übung/Hausaufgabe', note: 'Blatt 2' }],
      topics: [], notes: [], cards: [], exams: [] });
  });
  await page.reload();
  await expect(page.getByText(/: 3 Abgaben/).first()).toBeVisible();

  await nav(page, 'Module').click();
  await page.getByText('Diskrete Strukturen').first().click();
  const backlog = page.getByRole('button', { name: '2 Aufzeichnungen offen · 2 h' });
  await expect(backlog).toBeVisible();
  await backlog.click();
  await expect(backlog).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rows').first().locator('.row-title')).toHaveCount(2);

  await page.getByRole('tab', { name: /Hausaufgaben/ }).click();
  await expect(page.getByText('meist ~2 h').first()).toBeVisible();
  const link = page.getByRole('link', { name: /In Moodle öffnen/ });
  await expect(link).toHaveAttribute('href', 'https://moodle.example/mod/assign/view.php?id=3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
