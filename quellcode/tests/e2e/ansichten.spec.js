import { test, expect } from '@playwright/test';

/* Fehler und Tastaturbedienung in Lernen, Anhängen, Bild-Karten, Probeklausur und „Heute anpassen“ */
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
const card = (id, extra = {}) => ({ id, moduleId: 'ds', topicId: '', front: `Frage ${id}`, back: `Antwort ${id}`, tags: '', ease: 2.5, interval: 0, reps: 0, due: '2026-10-20', ...extra });
async function seed(page, extra) {
  await page.goto('./');
  await page.evaluate(async (x) => {
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [], ...x });
  }, extra);
  await page.reload();
}
const focusIn = (page, sel) => page.evaluate((s) => !!document.querySelector(s)?.contains(document.activeElement), sel);

test('Karteikarten mit der Tastatur: Fokus bleibt auf der Karte, Vollbild hält den Tabulator', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { cards: ['a', 'b', 'c'].map((id) => card(id)) });
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  const start = page.getByRole('button', { name: 'Lernen starten' });
  await start.focus();
  await page.keyboard.press('Enter');
  // der gedrückte Knopf ist weg: Fokus auf der Karte, nicht im Nichts
  await expect.poll(() => focusIn(page, '.card-stage')).toBe(true);
  await page.getByRole('button', { name: /Antwort zeigen/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Gut/ })).toBeVisible();
  expect(await focusIn(page, '.card-stage')).toBe(true);
  await page.keyboard.press('3');
  await expect(page.getByText('1 gelernt · 2 übrig')).toBeVisible();
  expect(await focusIn(page, '.card-stage')).toBe(true);
  // Vollbild: Tab und Umschalt + Tab verlassen die Abfrage nicht
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click();
  await expect(page.locator('.card-full')).toBeVisible();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await focusIn(page, '.card-full')).toBe(true); }
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); expect(await focusIn(page, '.card-full')).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-full')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vollbild', exact: true })).toBeFocused();
  // letzte Karten mit Leertaste und Ziffer
  await page.locator('.card-stage').focus();
  for (let i = 0; i < 2; i++) { await page.keyboard.press(' '); await page.keyboard.press('4'); }
  await expect(page.getByText(/Sitzung abgeschlossen: 3 Karten gelernt/)).toBeVisible();
});

test('Bild-Karte ohne Bereiche und ohne Bild: Abfrage läuft weiter', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { cards: [card('o', { front: 'Skizze', back: '', occ: { img: { id: 'fehltabcdef', type: 'image/png', w: 4, h: 3 }, target: 'x', mode: 'all' } }), card('b')] });
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  for (let i = 0; i < 2; i++) {
    if (await page.getByText('Skizze').count()) await expect(page.getByText('Das Bild liegt nur auf dem Gerät, auf dem die Karte angelegt wurde.')).toBeVisible();
    await page.getByRole('button', { name: /Antwort zeigen/ }).click();
    await page.getByRole('button', { name: /^Gut/ }).click();
  }
  await expect(page.getByText(/Sitzung abgeschlossen: 2 Karten gelernt/)).toBeVisible();
});

test('Anhänge: Objekt-URLs werden beim Entfernen und Schließen freigegeben', async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Set(), make = URL.createObjectURL.bind(URL), drop = URL.revokeObjectURL.bind(URL);
    window.__urls = { live, track: false };
    URL.createObjectURL = (b) => { const u = make(b); if (window.__urls.track) live.add(u); return u; };
    URL.revokeObjectURL = (u) => { live.delete(u); drop(u); };
  });
  await seed(page, { homework: [{ id: 'h', moduleId: 'ds', title: 'Blatt 3', due: '2026-12-01', status: 'ausgegeben' }] });
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  await page.evaluate(() => { window.__urls.track = true; });
  await page.getByText('Blatt 3').first().click();
  const dlg = page.getByRole('dialog', { name: /bearbeiten/ });
  await dlg.getByLabel('Datei anhängen').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 A') });
  await expect(dlg.getByRole('link', { name: 'a.pdf' })).toBeVisible();
  await dlg.getByLabel('Datei anhängen').setInputFiles({ name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('B') });
  await expect(dlg.getByRole('link', { name: 'b.txt' })).toBeVisible();
  const live = () => page.evaluate(() => window.__urls.live.size);
  await expect.poll(live).toBe(2);
  await dlg.getByRole('button', { name: 'a.pdf entfernen' }).click();
  await expect(dlg.getByRole('link', { name: 'a.pdf' })).toHaveCount(0);
  await expect.poll(live).toBe(1);
  await dlg.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(live).toBe(0);
});

test('Probeklausur: Fokus bleibt im Dialog, Restzeit wird mit Zeit vorgelesen', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { cards: ['a', 'b'].map((id) => card(id)), exams: [{ id: 'x', moduleId: 'ds', date: '2026-11-20' }] });
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  await page.getByRole('button', { name: 'Probeklausur' }).click();
  const dlg = page.getByRole('dialog', { name: /Probeklausur/ });
  await dlg.getByRole('button', { name: 'Starten' }).click();
  await expect(dlg.getByRole('timer')).toHaveAccessibleName(/^Restzeit \d+:\d\d$/);
  await dlg.getByRole('button', { name: 'Lösung zeigen' }).focus();
  await page.keyboard.press('Enter');
  expect(await focusIn(page, '[role=dialog]')).toBe(true);
  await dlg.getByRole('button', { name: 'Gewusst', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dlg.getByText('Karte 2 von 2')).toBeVisible();
  expect(await focusIn(page, '[role=dialog]')).toBe(true);
});

test('Heute anpassen: Pfeil bis ganz nach oben, der Fokus bleibt in der Zeile', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, {});
  await page.getByRole('button', { name: 'Heute anpassen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Heute anpassen' });
  await expect(dlg.getByRole('button', { name: 'Tagesplan ziehen' })).toHaveAttribute('tabindex', '-1');
  const up = dlg.getByRole('button', { name: 'Tagesplan nach oben' });
  await up.focus();
  for (let i = 0; i < 12 && await up.isEnabled(); i++) await page.keyboard.press('Enter');
  await expect(dlg.locator('.customize-row').first()).toContainText('Tagesplan');
  await expect(dlg.getByRole('button', { name: 'Tagesplan nach unten' })).toBeFocused();
});
