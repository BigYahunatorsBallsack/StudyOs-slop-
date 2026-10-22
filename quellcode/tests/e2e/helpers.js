/* Gemeinsame Hilfen für neue E2E-Specs: Fehlerwächter, Navigation, Einstellungsgruppen, Datenstand setzen/lesen.
   Ältere Specs bringen ihre eigenen Kopien mit; neue Tests nehmen diese hier. */
import { expect } from '@playwright/test';

/* Fehler aus Konsole und Seite sammeln und Netzzugriffe auf Mensa/Wetter abfangen: jeder Test muss ohne Fehler laufen */
export function guard(test) {
  const errors = new WeakMap();
  test.beforeEach(async ({ page }) => {
    await page.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
    await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
    const list = [];
    errors.set(page, list);
    page.on('pageerror', (e) => list.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  });
  test.afterEach(async ({ page }) => { expect(errors.get(page), 'Konsolenfehler').toEqual([]); });
}

export const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });

/* Daten & Einstellungen öffnen, optional mit aufgeklappter Gruppe (Titel-Anfang, z. B. 'Sicherung') */
export async function openData(page, group) {
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
  if (group) await openGroup(page, group);
}
export async function openGroup(page, group) {
  const t = page.locator('.settings-toggle', { hasText: new RegExp('^' + group) });
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  await expect(t).toHaveAttribute('aria-expanded', 'true');
}

export const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());

/* Datenstand setzen: ein Modul „Diskrete Strukturen“ (id ds) und leere Sammlungen; extraFn(day) ergänzt/überschreibt.
   day(n) = Datum in n Tagen als JJJJ-MM-TT. Danach neu laden, damit die App den Stand übernimmt. */
export async function seed(page, extraFn = () => ({})) {
  await page.evaluate(async (src) => {
    const extra = new Function('return ' + src)();
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    const base = { version: 3, settings: { defaultsRev: 2 }, meta: { lastBackup: new Date().toISOString() },
      modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] };
    await window.STUDYOS_ENV.save({ ...base, ...extra(day) });
  }, extraFn.toString());
}

/* Seite öffnen, Daten setzen, neu laden und warten, bis die App den Stand anzeigt */
export async function start(page, extraFn) {
  await page.goto('./');
  await seed(page, extraFn);
  await page.reload();
  await expect(nav(page, 'Heute')).toBeVisible();
}
