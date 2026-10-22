import { test, expect } from '@playwright/test';

/* Fehler im Bedienverhalten (Zustände, Aufräumen von Timern und Listenern, Fokus); jeder Test muss ohne Konsolenfehler laufen */
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  const list = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'Konsolenfehler').toEqual([]); });

const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());
const seed = (page, extraFn) => page.evaluate(async (src) => {
  const extra = new Function('return ' + src)();
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const base = { version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
    sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] };
  await window.STUDYOS_ENV.save({ ...base, ...extra(day) });
}, extraFn.toString());

test('Fokusphase, die bei geschlossener App abgelaufen ist, wird nach dem Laden eingetragen und nichts geht verloren', async ({ page }) => {
  await page.goto('./');
  await seed(page, (day) => ({ homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', due: day(3), status: 'ausgegeben' }] }));
  await page.evaluate(() => localStorage.setItem('studyos-timer-v1', JSON.stringify({ mode: 'focus', length: 25, brk: 5, running: true, endAt: Date.now() - 60000, remaining: 0, moduleId: 'ds', topicId: '', note: 'Blatt 1' })));
  await page.reload();
  const dlg = page.getByRole('dialog', { name: 'Fokusphase geschafft' });
  await expect(dlg).toContainText('25 min eingetragen für Diskrete Strukturen');
  await expect.poll(async () => (await stored(page)).logs.map((l) => [l.moduleId, l.minutes, l.note])).toEqual([['ds', 25, 'Blatt 1']]);
  // die übrigen Daten sind noch da (nicht vom leeren Anfangsstand überschrieben)
  expect((await stored(page)).homework.map((h) => h.id)).toEqual(['h1']);
});

test('Wochenraster: Termin-Karte schließt beim Wechsel in die nächste Woche (Tastatur)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T09:00:00') });
  await page.goto('./');
  await seed(page, () => ({ sessions: [
    { id: 'a', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-21', start: '12:00', end: '14:00' },
    { id: 'b', moduleId: 'ds', type: 'Übung', date: '2026-10-28', start: '12:00', end: '14:00' },
  ] }));
  await page.reload();
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await page.keyboard.press('Tab'); // ab jetzt Tastatur: Fokus ist sichtbar (:focus-visible)
  await page.getByRole('button', { name: /Vorlesung Diskrete Strukturen, 12:00 bis 14:00/ }).focus();
  const card = page.getByRole('dialog', { name: 'Diskrete Strukturen, Vorlesung' });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Nächste Woche' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Übung Diskrete Strukturen, 12:00 bis 14:00/ })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('Wochenkarte: in einer Woche ausgeblendet, in der nächsten wieder da (App bleibt offen)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T10:00:00') }); // Montag: Karte zur Vorwoche
  await page.goto('./');
  await seed(page, () => ({ logs: [
    { id: 'l1', moduleId: 'ds', date: '2026-10-14', minutes: 60, kind: 'Nacharbeiten' },
    { id: 'l2', moduleId: 'ds', date: '2026-10-20', minutes: 90, kind: 'Nacharbeiten' },
  ] }));
  await page.reload();
  const card = page.locator('.week-card');
  await expect(card).toContainText('Letzte Woche');
  await card.getByRole('button', { name: 'Ausblenden' }).click();
  await expect(card).toHaveCount(0);
  // Sonntag derselben Woche: die laufende Woche ist eine andere, ihre Karte erscheint ohne Neuladen
  await page.clock.fastForward(144 * 3600 * 1000);
  await expect(card).toContainText('Deine Woche');
});

test('Wischen hält sich an „Vibration aus“ und hakt trotzdem ab', async ({ page }) => {
  await page.addInitScript(() => { window.__buzz = []; navigator.vibrate = (ms) => { window.__buzz.push(ms); return true; }; localStorage.setItem('studyos-vibration', 'aus'); });
  await page.goto('./');
  await seed(page, (day) => ({ homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 7', issued: day(-2), due: day(4), status: 'ausgegeben' }] }));
  await page.reload();
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  const row = page.locator('.swipe .row').filter({ hasText: 'Blatt 7' }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await row.boundingBox();
  const y = box.y + 18;
  await page.mouse.move(box.x + 30, y);
  await page.mouse.down();
  for (let x = 40; x <= 180; x += 20) await page.mouse.move(box.x + x, y);
  await page.mouse.up();
  await expect(page.getByText(/„Blatt 7“ abgegeben\./)).toBeVisible();
  expect(await page.evaluate(() => window.__buzz)).toEqual([]);
});
