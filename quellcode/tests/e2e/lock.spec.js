import { test, expect } from '@playwright/test';

/* App-Sperre (WebAuthn über den virtuellen Authenticator von Chromium) und Aufräumen in den Einstellungen */
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
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());
async function openData(page) {
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
}
async function seed(page, extra = {}) {
  await page.goto('./');
  await page.evaluate(async (extra) => {
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [], ...extra });
  }, extra);
  await page.reload();
}
/* Hintergrund simulieren: visibilityState umschalten und das Ereignis auslösen */
const setVisible = (page, visible) => page.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
  document.dispatchEvent(new Event('visibilitychange'));
}, visible);

test('App-Sperre: ohne Fingerabdruck/Face ID nicht angeboten', async ({ page }) => {
  await seed(page);
  await openData(page);
  await expect(page.getByRole('heading', { name: /^Papierkorb/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'App-Sperre' })).toHaveCount(0);
});

test('App-Sperre: einschalten, beim Öffnen und nach 5 Minuten im Hintergrund gesperrt, Abbruch heißt nochmal', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page);
  await openData(page);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'App-Sperre' }) });
  await expect(card).toContainText('keine Verschlüsselung');
  await card.getByRole('button', { name: 'Einschalten' }).click();
  await expect(card.getByRole('button', { name: 'Ausschalten' })).toBeVisible();
  expect((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials).toHaveLength(1);

  // beim Öffnen gesperrt, Inhalt unsichtbar
  await page.reload();
  const lock = page.getByRole('dialog', { name: 'StudyOS gesperrt' });
  await expect(lock).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
  // Tastenkürzel öffnen nichts dahinter
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toHaveCount(1);

  // Prüfung scheitert: bleibt gesperrt, erneut versuchen geht
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await lock.getByRole('button', { name: 'Entsperren' }).click();
  await expect(lock.getByRole('alert')).toContainText('Nochmal versuchen');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await lock.getByRole('button', { name: 'Entsperren' }).click();
  await expect(lock).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();

  // kurz im Hintergrund: bleibt offen; nach 5 Minuten: gesperrt
  await setVisible(page, false);
  await page.clock.fastForward('02:00');
  await setVisible(page, true);
  await expect(lock).toHaveCount(0);
  await setVisible(page, false);
  await page.clock.fastForward('05:00');
  await setVisible(page, true);
  await expect(lock).toBeVisible();
  await lock.getByRole('button', { name: 'Entsperren' }).click();
  await expect(lock).toHaveCount(0);

  // ausschalten (nur entsperrt möglich): beim nächsten Öffnen keine Sperre
  await openData(page);
  await card.getByRole('button', { name: 'Ausschalten' }).click();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  await expect(lock).toHaveCount(0);
});

test('Aufräumen: doppelte Termine, Karten und leere Notizen löschen, mit Rückgängig und Papierkorb', async ({ page }) => {
  const ses = (id, extra = {}) => ({ id, moduleId: 'ds', date: '2026-10-20', start: '10:00', end: '12:00', type: 'Vorlesung', ...extra });
  await seed(page, {
    sessions: [ses('s1', { attended: true }), ses('s2'), ses('s3', { type: 'Übung' })],
    notes: [{ id: 'n1', moduleId: 'ds', sessionId: 's2', title: 'Mitschrift', text: 'a' }, { id: 'n2', moduleId: 'ds', sessionId: '', title: '', text: '' }],
    cards: [{ id: 'c1', moduleId: 'ds', front: 'Was ist ein Baum?', back: 'Graph', ease: 2.5, interval: 0, reps: 0, due: '2026-10-20' }, { id: 'c2', moduleId: 'ds', front: 'Was ist ein Baum?', back: 'Graph', ease: 2.5, interval: 3, reps: 2, due: '2026-10-25' }],
  });
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('studyos-files-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => { const tx = r.result.transaction('files', 'readwrite'); tx.objectStore('files').put(new Blob(['x'.repeat(2048)], { type: 'application/pdf' }), 'waise123'); tx.oncomplete = () => { r.result.close(); res(); }; };
  }));
  await openData(page);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Aufräumen' }) });
  await expect(card).toContainText('Doppelte Termine (1)');
  await expect(card).toContainText('Vorlesung · Diskrete Strukturen (2×)');
  await expect(card).toContainText('Doppelte Karteikarten (1)');
  await expect(card).toContainText('Leere Notizen (1)');
  await expect(card).toContainText('Verwaiste Anhänge (1, 2 KB)');

  const group = (name) => card.getByRole('listitem').filter({ hasText: name }).first();
  await group('Doppelte Termine').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('1 doppelter Termin gelöscht.')).toBeVisible();
  await expect.poll(async () => (await stored(page)).sessions.map((s) => s.id)).toEqual(['s1', 's3']);
  expect((await stored(page)).notes.find((n) => n.id === 'n1').sessionId).toBe('s1');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(async () => (await stored(page)).sessions.map((s) => s.id)).toEqual(['s1', 's2', 's3']);

  await group('Doppelte Karteikarten').getByRole('button', { name: 'Löschen' }).click();
  await expect.poll(async () => (await stored(page)).cards.map((c) => c.id)).toEqual(['c2']);
  await group('Leere Notizen').getByRole('button', { name: 'Löschen' }).click();
  await expect.poll(async () => (await stored(page)).notes.map((n) => n.id)).toEqual(['n1']);
  const trash = page.locator('section', { has: page.getByRole('heading', { name: /^Papierkorb/ }) });
  await expect(trash).toContainText('Leere Notizen');
  await expect(trash).toContainText('Doppelte Karteikarten');

  await group('Verwaiste Anhänge').getByRole('button', { name: 'Löschen' }).click();
  await group('Verwaiste Anhänge').getByRole('button', { name: 'Endgültig?' }).click();
  await expect(card).toContainText('Doppelte Termine (1)');
  await expect(card).not.toContainText('Verwaiste Anhänge');
});
