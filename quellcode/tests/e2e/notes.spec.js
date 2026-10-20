import { test, expect } from '@playwright/test';

/* Notizen: Checklisten, Anheften, Karte aus markiertem Text; schwere Karten */
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
const card = (id, extra = {}) => ({ id, moduleId: 'ds', topicId: '', front: `Frage ${id}`, back: `Antwort ${id}`, tags: '', ease: 2.5, interval: 3, reps: 1, due: '2026-10-25', ...extra });
const NOTE_TEXT = 'Vorbereitung:\n- [ ] Blatt 3 rechnen\n- [x] Skript lesen\n- [ ] Was ist ein Baum? :: Ein kreisfreier zusammenhängender Graph\n\nEin Graph heißt bipartit, wenn sich die Knoten in zwei Mengen teilen lassen.';
async function seed(page, { notes = [], cards = [] } = {}) {
  await page.goto('./');
  await page.evaluate(async ({ notes, cards }) => {
    await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes, cards, exams: [] });
  }, { notes, cards });
  await page.reload();
}
async function openNotes(page) {
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  await page.getByRole('tab', { name: /Notizen/ }).click();
}

test('Notiz: Kästchen abhaken speichert den Text, Karten aus der Notiz bleiben', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  const fromNote = card('k1', { front: 'Was ist ein Baum?', back: 'Ein kreisfreier zusammenhängender Graph', fromNote: 'n1' });
  await seed(page, { notes: [{ id: 'n1', moduleId: 'ds', title: 'Graphen', text: NOTE_TEXT, updated: '2026-10-19' }], cards: [fromNote] });
  await openNotes(page);
  await page.getByRole('button', { name: /Graphen/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Graphen' });
  const box = dlg.getByRole('checkbox', { name: 'Blatt 3 rechnen' });
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(dlg.getByRole('checkbox', { name: 'Skript lesen' })).toHaveAttribute('aria-checked', 'true');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await stored(page)).notes[0].text).toBe(NOTE_TEXT.replace('- [ ] Blatt 3', '- [x] Blatt 3'));
  // keine neuen Karten angeboten, die vorhandene bleibt unverändert
  await expect(dlg.getByRole('button', { name: /erzeugen/ })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(async () => (await stored(page)).cards.map((c) => [c.id, c.front])).toEqual([['k1', 'Was ist ein Baum?']]);
});

test('Notiz anheften: steht oben, mit Symbol und beim Modul', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { notes: [
    { id: 'n1', moduleId: 'ds', title: 'Alte Notiz', text: 'a', updated: '2026-10-01T10:00:00.000Z' },
    { id: 'n2', moduleId: 'ds', title: 'Neue Notiz', text: 'b', updated: '2026-10-19T10:00:00.000Z' },
  ] });
  await openNotes(page);
  const titles = page.locator('.rows li p.text-sm');
  await expect(titles).toHaveText(['Neue Notiz', 'Alte Notiz']);
  await page.getByRole('button', { name: /Alte Notiz/ }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Anheften' }).click();
  await expect(titles).toHaveText(['Angeheftet:Alte Notiz', 'Neue Notiz']);
  await expect.poll(async () => (await stored(page)).notes.find((n) => n.id === 'n1').pinned).toBe(true);
  await page.getByRole('tab', { name: 'Übersicht' }).click();
  await expect(page.locator('section').filter({ hasText: 'Angeheftet' }).getByText('Alte Notiz')).toBeVisible();
  // in der Notiz wieder lösen
  await page.locator('section').filter({ hasText: 'Angeheftet' }).getByRole('button', { name: /Alte Notiz/ }).click();
  await page.getByRole('dialog', { name: 'Alte Notiz' }).getByRole('button', { name: 'Lösen' }).click();
  await expect.poll(async () => (await stored(page)).notes.find((n) => n.id === 'n1').pinned).toBe(false);
});

test('Notiz: markierten Text als Karte anlegen, in der Ansicht und im Editor', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { notes: [{ id: 'n1', moduleId: 'ds', title: 'Graphen', text: NOTE_TEXT, updated: '2026-10-19' }] });
  await openNotes(page);
  await page.getByRole('button', { name: /Graphen/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Graphen' });
  await expect(page.getByRole('button', { name: 'Karte daraus' })).toHaveCount(0);
  await dlg.locator('.md p', { hasText: 'bipartit' }).evaluate((el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.getByRole('button', { name: 'Karte daraus' }).click();
  const form = page.getByRole('dialog', { name: 'Karteikarte anlegen' });
  await expect(form.getByLabel(/Rückseite/)).toHaveValue('Ein Graph heißt bipartit, wenn sich die Knoten in zwei Mengen teilen lassen.');
  await form.getByLabel(/Vorderseite/).fill('Wann ist ein Graph bipartit?');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(form).toHaveCount(0);
  await expect(dlg).toBeVisible();
  await expect.poll(async () => (await stored(page)).cards.map((c) => [c.moduleId, c.front, c.back.slice(0, 20)])).toEqual([['ds', 'Wann ist ein Graph bipartit?', 'Ein Graph heißt bipa']]);

  // im Editor: „Frage :: Antwort“ markieren, Esc schließt nur das obere Fenster
  await dlg.getByRole('button', { name: 'Bearbeiten' }).click();
  const editor = page.getByRole('dialog', { name: 'Notiz bearbeiten' });
  const area = editor.getByLabel('Inhalt');
  await area.evaluate((el, needle) => { const i = el.value.indexOf(needle); el.focus(); el.setSelectionRange(i, i + needle.length); el.dispatchEvent(new Event('select', { bubbles: true })); }, 'Was ist ein Baum? :: Ein kreisfreier zusammenhängender Graph');
  await editor.getByRole('button', { name: 'Karte daraus' }).click();
  const form2 = page.getByRole('dialog', { name: 'Karteikarte anlegen' });
  await expect(form2.getByLabel(/Vorderseite/)).toHaveValue('Was ist ein Baum?');
  await expect(form2.getByLabel(/Rückseite/)).toHaveValue('Ein kreisfreier zusammenhängender Graph');
  await page.keyboard.press('Escape');
  await expect(form2).toHaveCount(0);
  await expect(editor).toBeVisible();
});

test('Schwere Karten: beim Abfragen markieren, in der Liste sehen, „Nur schwere“ abfragen', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00') });
  await seed(page, { cards: [card('a', { due: '2026-10-20' }), card('b'), card('c', { hard: true })] });
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Karteikarten' }).click();
  await expect(page.locator('.rows .hard-mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lernen starten' }).click();
  const flag = page.getByRole('button', { name: 'Als schwer markieren' });
  await expect(flag).toHaveAttribute('aria-pressed', 'false');
  await flag.click();
  await expect(flag).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await stored(page)).cards.find((c) => c.id === 'a').hard).toBe(true);
  await page.getByRole('button', { name: 'Sitzung beenden' }).click();
  await expect(page.locator('.rows .hard-mark')).toHaveCount(2);
  // nicht fällige schwere Karte kommt trotzdem dran
  await page.getByRole('button', { name: 'Nur schwere (2)' }).click();
  await expect(page.getByText('0 gelernt · 2 übrig')).toBeVisible();
});
