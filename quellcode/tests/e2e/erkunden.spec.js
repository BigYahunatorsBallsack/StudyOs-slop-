import { test, expect } from '@playwright/test';
import { guard, nav, start, stored } from './helpers.js';

/* Funde aus der Erkundung wie ein echter Nutzer (Randwerte, Datum, schmale Handys, Maus); jeder Test muss ohne Konsolenfehler laufen */
guard(test);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('Heute: Abschnitt zuklappen und mittendrin „Bewegung aus“ – der Abschnitt bleibt nicht halb zu hängen', async ({ page }) => {
  await start(page, (day) => ({ homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', due: day(2), status: 'ausgegeben' }] }));
  await page.addStyleTag({ content: '.group-closing { animation-duration: 20s !important; }' }); // Animation lang genug zum Dazwischengehen
  const toggle = page.locator('.group-toggle').first();
  const body = page.locator('#' + (await toggle.getAttribute('aria-controls')));
  await toggle.click();
  await expect(body).toHaveClass(/group-closing/);
  await expect.poll(() => body.evaluate((el) => el.getAnimations().some((a) => a.playState === 'running'))).toBe(true); // erst abbrechen, wenn sie wirklich läuft
  await page.evaluate(() => { document.documentElement.dataset.motion = 'off'; }); // bricht die Animation ab (animationcancel)
  await expect(body).toBeHidden();
  await expect(body).toHaveClass(/group-closed/);
});

test('Woche (Handy): Frist-Eintrag mit unsichtbarem Zusatztext macht die Seite nicht breiter', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-13T09:00:00') }); // Woche mit „Prüfungsanmeldung … endet“ am Freitag
  await start(page, (day) => ({ settings: { defaultsRev: 2, university: 'TUM' }, homework: [{ id: 'h1', moduleId: 'ds', title: 'Übungsblatt 12 (Wiederholung)', due: day(1), status: 'ausgegeben' }] }));
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await expect(page.locator('.allday .ad-uni').first()).toBeVisible();
  await expect(page.locator('.allday .ad-hw').first()).toBeVisible();
  expect(await fits(page)).toBe(true);
});

test('Woche (schmales Handy): langer Titel („Donnerstag,“, „vorlesungsfrei“) schiebt die Knöpfe nicht über den Rand', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.clock.install({ time: new Date('2026-12-31T09:00:00') }); // Donnerstag in einer vorlesungsfreien Woche
  await start(page, () => ({ settings: { defaultsRev: 2, university: 'TUM' } }));
  await nav(page, 'Woche').click();
  await page.getByRole('tab', { name: 'Raster' }).click();
  await expect(page.locator('main h2').first()).toContainText('vorlesungsfrei');
  expect(await fits(page)).toBe(true);
  await page.getByRole('tab', { name: 'Tag' }).click();
  await expect(page.locator('main h2').first()).toHaveText(/^Donnerstag, 31\.12\./);
  expect(await fits(page)).toBe(true);
  await page.getByRole('button', { name: 'Nächster Tag' }).click(); // ganz zu sehen und bedienbar
  await expect(page.locator('main h2').first()).toHaveText(/^Freitag, 01\.01\./);
});

test('lange Wörter (eingefügte Links) in Prüfungsnotizen, Prüfungsraum und Notiztitel machen die Seite nicht breiter', async ({ page }) => {
  await start(page, (day) => {
    const long = 'https://moodle.example.org/' + 'sehrlangerpfad'.repeat(20);
    return {
      exams: [{ id: 'e1', moduleId: 'ds', date: day(20), time: '09:00', room: long, notes: 'Hilfsmittel: ' + long }],
      notes: [{ id: 'n1', moduleId: 'ds', title: long, text: 'x', updated: new Date().toISOString() }],
    };
  });
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  await expect(page.getByText(/^Hilfsmittel: https/)).toBeVisible();
  expect(await fits(page)).toBe(true);
  await nav(page, 'Module').click();
  await page.locator('.tile').first().click();
  await page.getByRole('tab', { name: /^Notizen/ }).click();
  await expect(page.getByText(/^https:\/\/moodle/).first()).toBeVisible();
  expect(await fits(page)).toBe(true);
});

test.describe('mit Maus (PC)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  for (const [label, check] of [['Teilaufgaben (optional)', (h) => h.subtasks.map((s) => s.title)], ['Partner (optional)', (h) => h.partners]]) {
    test(`Hausaufgabe: nicht mit Enter übernommener Eintrag in „${label}“ – ein Klick auf Speichern speichert ihn mit`, async ({ page }) => {
      await start(page);
      await page.keyboard.press('h'); // neue Hausaufgabe
      const dlg = page.getByRole('dialog', { name: /Hausaufgabe/ });
      await dlg.getByLabel('Titel').fill('Blatt 7');
      await dlg.getByLabel('Abgabe').fill('2026-12-31');
      await dlg.getByLabel(label).fill('Aufgabe 1');
      await dlg.getByRole('button', { name: 'Speichern' }).click();
      await expect(dlg).toHaveCount(0);
      await expect.poll(async () => { const h = (await stored(page)).homework.find((x) => x.title === 'Blatt 7'); return h && check(h); }).toEqual(['Aufgabe 1']);
    });
  }
});
