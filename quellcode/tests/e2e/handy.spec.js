import { test, expect } from '@playwright/test';

/* Bedienung am Handy: Zurück-Geste, Fenster wegwischen, Reiter nochmal antippen, Unterreiter wischen */
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] })); /* Wetter: nie ins Netz */
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Konsolenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const back = (page) => page.evaluate(() => history.back());
async function seed(page) {
  await page.goto('./');
  await page.evaluate(async () => {
    const notes = [{ id: 'n1', moduleId: 'ds', title: 'Bäume', text: 'Ein Baum ist ein Graph.', updated: '2026-10-01' }];
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes, cards: [], exams: [] });
  });
  await page.reload();
}
/* echte Touch-Gesten über das DevTools-Protokoll */
async function toucher(page) {
  const cdp = await page.context().newCDPSession(page);
  return async (x1, y1, x2, y2, steps = 6) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

test('Zurück schließt das offene Fenster, dann geht es auf „Heute“', async ({ page }) => {
  await seed(page);
  await nav(page, 'Woche').click();
  await page.getByRole('button', { name: 'Schnelleingabe (E)' }).click();
  await expect(page.getByRole('dialog', { name: 'Schnelleingabe' })).toBeVisible();
  await back(page);
  await expect(page.getByRole('dialog', { name: 'Schnelleingabe' })).toHaveCount(0);
  await expect(nav(page, 'Woche')).toHaveAttribute('aria-current', 'page');

  /* per ✕ geschlossen: der Eintrag verschwindet wieder, das nächste Zurück verlässt erst die Woche */
  await page.getByRole('button', { name: 'Suchen (Strg + K)' }).click();
  await expect(page.getByRole('dialog', { name: 'Suchen' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Suchen' }).getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state && history.state.studyosBack)).toBe(1);
  await back(page);
  await expect(nav(page, 'Heute')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => page.evaluate(() => (history.state && history.state.studyosBack) || 0)).toBe(0);
});

test('Zurück aus einem Modul führt zur Modulliste, aus einer Notiz zurück ins Modul', async ({ page }) => {
  await seed(page);
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  await page.getByRole('tab', { name: /Notizen/ }).click();
  await page.getByText('Bäume').first().click();
  await expect(page.getByRole('dialog', { name: 'Bäume' })).toBeVisible();
  await back(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Notizen/ })).toHaveAttribute('aria-selected', 'true');
  await back(page);
  await expect(page.getByRole('button', { name: '← Alle Module' })).toHaveCount(0);
  await expect(nav(page, 'Module')).toHaveAttribute('aria-current', 'page');
  await back(page);
  await expect(nav(page, 'Heute')).toHaveAttribute('aria-current', 'page');
});

test('Fenster nach unten wegwischen: kurz schnappt zurück, weit schließt', async ({ page }) => {
  await seed(page);
  const touch = await toucher(page);
  await page.getByRole('button', { name: 'Schnelleingabe (E)' }).click();
  const dlg = page.getByRole('dialog', { name: 'Schnelleingabe' });
  await expect(dlg).toBeVisible();
  const b = await dlg.boundingBox();
  const title = await dlg.locator('h2').boundingBox();
  await touch(b.x + b.width / 2, title.y + 4, b.x + b.width / 2, title.y + 40, 8);
  await expect(dlg).toBeVisible();
  await expect.poll(() => dlg.evaluate((el) => el.style.transform)).toBe('');
  await touch(b.x + b.width / 2, title.y + 4, b.x + b.width / 2, title.y + 320, 10);
  await expect(dlg).toHaveCount(0);
  /* der Verlaufseintrag des Fensters ist wieder weg */
  await expect.poll(() => page.evaluate(() => (history.state && history.state.studyosBack) || 0)).toBe(0);
});

test('aktiven Reiter nochmal antippen: nach oben, die Woche springt auf heute', async ({ page }) => {
  await seed(page);
  await nav(page, 'Woche').click();
  await page.getByRole('button', { name: 'Nächste Woche' }).click();
  await page.getByRole('button', { name: 'Nächste Woche' }).click();
  const today = page.getByRole('main').getByRole('button', { name: 'Heute', exact: true });
  await expect(today).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 400));
  await nav(page, 'Woche').click();
  await expect(today).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('auf der Modulseite wechselt seitliches Wischen die Unterreiter, am Rand passiert nichts', async ({ page }) => {
  await seed(page);
  const touch = await toucher(page);
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  const tab = (name) => page.getByRole('tab', { name });
  await expect(tab('Übersicht')).toHaveAttribute('aria-selected', 'true');
  const y = (await page.getByRole('heading', { name: 'Diskrete Strukturen' }).boundingBox()).y + 10;
  await touch(100, y, 320, y); /* nach rechts am ersten Reiter: nichts, auch kein Bereichswechsel */
  await expect(tab('Übersicht')).toHaveAttribute('aria-selected', 'true');
  await expect(nav(page, 'Module')).toHaveAttribute('aria-current', 'page');
  await touch(320, y, 100, y);
  await expect(tab(/Termine/)).toHaveAttribute('aria-selected', 'true');
  await touch(320, y, 100, y);
  await expect(tab(/Hausaufgaben/)).toHaveAttribute('aria-selected', 'true');
  await touch(100, y, 320, y);
  await expect(tab(/Termine/)).toHaveAttribute('aria-selected', 'true');
  await expect(nav(page, 'Module')).toHaveAttribute('aria-current', 'page');
});
