import { test, expect } from '@playwright/test';
import { choose } from './select.js';

/* Links pro Modul, Gruppenabgaben, Inhaltsverzeichnis in Notizen */
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
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());
const seed = async (page, extraFn) => {
  await page.goto('./');
  await page.evaluate(async (src) => {
    const extra = new Function('return ' + src)();
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    const base = { version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] };
    await window.STUDYOS_ENV.save({ ...base, ...extra(day) });
  }, extraFn.toString());
  await page.reload();
};
const openModule = async (page) => {
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
};

test('Links pro Modul: anlegen, Name erkannt, Artemis-Kurs aus dem Abo, neuer Tab', async ({ page }) => {
  await seed(page, () => ({ settings: { artemisFeeds: [{ id: 'f', moduleId: 'ds', url: 'https://artemis.tum.de/api/core/calendar/courses/417/calendar-events-ics?token=x', label: 'DS', dismissed: [], lastSync: new Date().toISOString() }] } }));
  await openModule(page);
  await expect(page.getByRole('link', { name: 'Artemis ↗' })).toHaveAttribute('href', 'https://artemis.tum.de/courses/417');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: '+ Link' }).click();
  await dlg.getByLabel('Adresse von Link 1').fill('zulip.in.tum.de/#narrow/stream/ds');
  await expect(dlg.getByLabel('Name von Link 1')).toHaveAttribute('placeholder', 'Zulip');
  await dlg.getByRole('button', { name: '+ Link' }).click();
  await dlg.getByLabel('Name von Link 2').fill('Skript');
  await dlg.getByLabel('Adresse von Link 2').fill('kaputt');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg.getByRole('alert')).toContainText('keine gültige Adresse');
  await dlg.getByLabel('Adresse von Link 2').fill('https://www.cit.tum.de/ds/skript.pdf');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  const zulip = page.getByRole('link', { name: 'Zulip ↗' });
  await expect(zulip).toHaveAttribute('href', 'https://zulip.in.tum.de/#narrow/stream/ds');
  await expect(zulip).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'Skript ↗' })).toBeVisible();
  await expect.poll(async () => (await stored(page)).modules[0].links?.map((l) => l.name)).toEqual(['Zulip', 'Skript']);
});

test('Gruppenabgabe: Team vom letzten Blatt, Zuständige je Teilaufgabe, „mit Max“ in der Zeile', async ({ page }) => {
  await seed(page, (day) => ({ homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', issued: day(-8), due: day(-1), created: day(-8), status: 'abgegeben', partners: ['Max'] }] }));
  await openModule(page);
  await page.getByRole('tab', { name: /Hausaufgaben/ }).click();
  await expect(page.locator('.swipe .row').filter({ hasText: 'Blatt 1' }).getByText('mit Max')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('h');
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Titel').fill('Blatt 2');
  await dlg.locator('#f-due').fill(await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toLocaleDateString('sv-SE'); }));
  await expect(dlg.locator('.partner-chip')).toHaveText(['Max✕']);
  await dlg.getByLabel('Partner (optional)').fill('Lea');
  await dlg.getByLabel('Partner (optional)').press('Enter');
  await dlg.getByLabel('Teilaufgaben (optional)').fill('a-c');
  await dlg.getByLabel('Teilaufgaben (optional)').press('Enter');
  await choose(dlg.getByLabel('Zuständig für a'), 'Max');
  await choose(dlg.getByLabel('Zuständig für b'), 'Lea');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(async () => (await stored(page)).homework.find((h) => h.title === 'Blatt 2')?.subtasks?.map((s) => s.by || '')).toEqual(['Max', 'Lea', '']);
  expect((await stored(page)).homework.find((h) => h.title === 'Blatt 2').partners).toEqual(['Max', 'Lea']);
  const row = page.locator('.swipe .row').filter({ hasText: 'Blatt 2' });
  await expect(row.getByText('mit Max und Lea')).toBeVisible();
  await row.getByRole('button', { name: /Teilaufgaben/ }).click();
  await expect(row.locator('.subtask-by')).toHaveText(['Max', 'Lea', 'ich']);
});

test('Lange Notiz: Inhaltsverzeichnis einklappbar, Antippen springt zur Überschrift', async ({ page }) => {
  const filler = Array.from({ length: 40 }, (_, i) => `Zeile ${i} mit etwas Text, damit die Notiz lang wird.`).join('\n\n');
  await seed(page, () => ({ notes: [{ id: 'n', moduleId: 'ds', title: 'Graphen', text: '' }] }));
  await page.evaluate(async (text) => { const d = await window.STUDYOS_ENV.load(); d.notes[0].text = text; await window.STUDYOS_ENV.save(d); }, `# Grundbegriffe\n${filler}\n## Bäume\n${filler}\n## Färbungen\nEnde`);
  await page.reload();
  await openModule(page);
  await page.getByRole('tab', { name: /Notizen/ }).click();
  await page.getByText('Graphen').first().click();
  const dlg = page.getByRole('dialog', { name: 'Graphen' });
  const toggle = dlg.getByRole('button', { name: /Inhalt/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const toc = dlg.getByRole('navigation', { name: 'Inhaltsverzeichnis' });
  await expect(toc.getByRole('button')).toHaveText([/Inhalt/, 'Grundbegriffe', 'Bäume', 'Färbungen']);
  const target = dlg.getByRole('heading', { name: 'Färbungen' });
  await expect(target).not.toBeInViewport();
  await toc.getByRole('button', { name: 'Färbungen' }).click();
  await expect(target).toBeInViewport();
  await expect(target).toBeFocused();
});
