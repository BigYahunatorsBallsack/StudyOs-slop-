import { test, expect } from '@playwright/test';

/* Zwei Tabs derselben App (gemeinsame Datenbank): Speichert der eine, während der andere noch ungespeicherte
   Änderungen hat, gehen diese nicht verloren. */
async function addNote(page, title) {
  await page.goto('./?aktion=notiz');
  await page.getByLabel('Titel').fill(title);
  await page.getByRole('button', { name: 'Speichern' }).click();
}
const stored = (page) => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.notes.map((n) => n.title).sort() ?? []);

test('zwei Tabs: ungespeicherte Änderung bleibt, wenn der andere Tab speichert', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  await context.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await context.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
  const A = await context.newPage(), B = await context.newPage();
  const errors = [];
  for (const p of [A, B]) p.on('pageerror', (e) => errors.push(String(e)));

  await addNote(A, 'Erste Notiz');
  await expect.poll(() => stored(A)).toEqual(['Erste Notiz']);

  /* B: Speichern zurückhalten, damit seine Änderung noch nicht in der Datenbank ist */
  await B.goto('./?aktion=notiz');
  await B.evaluate(() => {
    const env = window.STUDYOS_ENV, save = env.save;
    const gate = new Promise((r) => { window.__release = r; });
    env.save = async (d) => { await gate; return save(d); };
  });
  await B.getByLabel('Titel').fill('Notiz aus Tab B');
  await B.getByRole('button', { name: 'Speichern' }).click();
  await B.waitForTimeout(600);

  /* A speichert inzwischen etwas anderes; B bekommt die Nachricht, während seine Notiz noch ungespeichert ist */
  await addNote(A, 'Notiz aus Tab A');
  await expect.poll(() => stored(A)).toEqual(['Erste Notiz', 'Notiz aus Tab A']);
  await B.waitForTimeout(500);

  /* B darf jetzt speichern: am Ende sind alle drei Notizen gespeichert, in beiden Tabs */
  await B.evaluate(() => window.__release());
  await expect.poll(() => stored(B), { timeout: 10000 }).toEqual(['Erste Notiz', 'Notiz aus Tab A', 'Notiz aus Tab B']);
  await A.goto('./?aktion=notiz');
  await expect.poll(() => stored(A)).toEqual(['Erste Notiz', 'Notiz aus Tab A', 'Notiz aus Tab B']);
  expect(errors).toEqual([]);
  await context.close();
});
