import { test, expect } from '@playwright/test';

/* Karteikarten abfragen: Wischen, Lernzeit, Vollbild */
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Konsolenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());
const card = (id) => ({ id, moduleId: 'ds', topicId: '', front: `Frage ${id}`, back: `Antwort ${id}`, tags: '', ease: 2.5, interval: 0, reps: 0, due: '2026-10-20' });
async function seedCards(page, ids) {
  await page.goto('./');
  await page.evaluate(async (cards) => {
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards, exams: [] });
  }, ids.map(card));
  await page.reload();
  await nav(page, 'Lernen').click();
}
const openCards = (page) => page.getByRole('tab', { name: 'Karteikarten' }).click();

test('Karteikarten: Wischen bewertet, Lernzeit wird eingetragen, Ziffern wechseln nicht den Bereich', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seedCards(page, ['a', 'b']);
  await openCards(page);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (dir) => {
    const b = await page.locator('.card-stage').boundingBox();
    const y = b.y + b.height / 2, x1 = b.x + b.width / 2, x2 = x1 + dir * 150;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  // vor dem Aufdecken bewegt Wischen nichts, auch nicht den Bereich
  await swipe(-1);
  await expect(page.getByText('0 gelernt · 2 übrig')).toBeVisible();
  await expect(nav(page, 'Lernen')).toHaveAttribute('aria-current', 'page');
  await page.clock.fastForward(90000);
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await swipe(1); // gewusst
  await expect(page.getByText('1 gelernt · 1 übrig')).toBeVisible();
  await expect(nav(page, 'Lernen')).toHaveAttribute('aria-current', 'page');
  await page.clock.fastForward(10 * 60000); // lange Pause zählt nur zwei Minuten
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await swipe(-1); // nicht gewusst: die Karte kommt wieder
  await expect(page.getByText('1 gelernt · 1 übrig')).toBeVisible();
  await page.clock.fastForward(30000);
  await page.keyboard.press(' ');
  await page.keyboard.press('3');
  await expect(page.getByText(/Sitzung abgeschlossen: 2 Karten gelernt\. 4 min als Lernzeit eingetragen\./)).toBeVisible();
  await expect(nav(page, 'Lernen')).toHaveAttribute('aria-current', 'page');
  await expect.poll(async () => (await stored(page)).logs.filter((l) => l.auto === 'karten')).toEqual([expect.objectContaining({ moduleId: 'ds', kind: 'Karteikarten', minutes: 4, date: '2026-10-20' })]);
});

test('Karteikarten: kein Eintrag, solange der Fokus-Timer läuft', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seedCards(page, ['a']);
  await page.getByRole('button', { name: 'Starten' }).click();
  await openCards(page);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await page.clock.fastForward(100000);
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await page.getByRole('button', { name: /^Gut/ }).click();
  await expect(page.getByText('Sitzung abgeschlossen: 1 Karten gelernt.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).cards[0].reviews).toBe(1);
  expect((await stored(page)).logs.filter((l) => l.auto === 'karten')).toEqual([]);
});

test('Karteikarten: Beim Verlassen der Abfrage wird die Zeit gespeichert', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seedCards(page, ['a', 'b']);
  await openCards(page);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await page.clock.fastForward(100000);
  await page.getByRole('button', { name: /Antwort zeigen/ }).click();
  await page.getByRole('button', { name: /^Gut/ }).click(); // 1 min gesichert, 40 s offen
  await page.clock.fastForward(20000);
  await nav(page, 'Heute').click(); // 60 s offen → noch 1 min
  await expect.poll(async () => (await stored(page)).logs.filter((l) => l.auto === 'karten').map((l) => l.minutes)).toEqual([2]);
});

test('Karteikarten im Vollbild: Esc beendet, die Wahl bleibt gemerkt', async ({ page }) => {
  await seedCards(page, ['a']);
  await openCards(page);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await expect(page.locator('.card-full')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click();
  await expect(page.locator('.card-full')).toContainText('Frage a');
  await expect(page.getByRole('button', { name: 'Vollbild beenden' })).toBeFocused();
  // Kopfzeile und Navigation liegen darunter
  const covered = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.card-full'); }, sel);
  expect(await covered('.tabbar')).toBe(true);
  expect(await covered('.appbar')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-full')).toHaveCount(0);
  await expect(page.getByText('Frage a')).toBeVisible();
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click();
  await page.getByRole('button', { name: 'Sitzung beenden' }).click();
  await page.reload();
  await nav(page, 'Lernen').click();
  await openCards(page);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  await expect(page.locator('.card-full')).toBeVisible();
  await page.getByRole('button', { name: 'Vollbild beenden' }).click();
  await expect(page.locator('.card-full')).toHaveCount(0);
});
