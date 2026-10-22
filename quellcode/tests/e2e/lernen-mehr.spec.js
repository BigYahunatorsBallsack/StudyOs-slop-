/* Wege in Lernen und Mehr, die bisher kein E2E-Test abgedeckt hat: Probeklausur bis zur Auswertung (auch mit
   abgelaufener Zeit und mit der Tastatur), Zielschnitt-Rechner, Wochenrückblick mit Lernzeit-Kalender, Erfolge samt
   Meldung beim Freischalten, Fokus-Timer (Anzeige, Knöpfe, Beenden & eintragen) und Reiter mit den Pfeiltasten. */
import { test, expect } from '@playwright/test';
import { guard, nav, start, stored } from './helpers.js';

guard(test);

const focusIn = (page, sel) => page.evaluate((s) => !!document.querySelector(s)?.contains(document.activeElement), sel);
/* Datenstand direkt setzen (start() aus helpers.js reicht nur eine Funktion als Text weiter, ohne die Hilfen hier) */
async function startWith(page, extra) {
  await page.goto('./');
  await page.evaluate(async (x) => {
    await window.STUDYOS_ENV.save({ version: 3, settings: { defaultsRev: 2 }, meta: { lastBackup: new Date().toISOString() },
      modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [], ...x });
  }, extra);
  await page.reload();
  await expect(nav(page, 'Heute')).toBeVisible();
}
const card = (id, extra = {}) => ({ id, moduleId: 'ds', topicId: '', front: `Frage ${id}`, back: `Antwort ${id}`, tags: '', ease: 2.5, interval: 0, reps: 0, due: '2026-10-20', ...extra });

test('Probeklausur: Felder lassen sich leeren und neu tippen, Zeit läuft ab, Auswertung, noch eine Runde mit Enter', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00') });
  await startWith(page, ({ cards: ['a', 'b', 'c', 'd', 'e'].map((id) => card(id, { topicId: id < 'c' ? 't1' : 't2' })),
    topics: [{ id: 't1', moduleId: 'ds', title: 'Graphen', state: 'offen' }, { id: 't2', moduleId: 'ds', title: 'Mengen', state: 'offen' }],
    exams: [{ id: 'x', moduleId: 'ds', date: '2026-11-20' }] }));
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  await page.getByRole('button', { name: 'Probeklausur' }).click();
  const dlg = page.getByRole('dialog', { name: /Probeklausur/ });

  // Rücktaste und neu tippen: aus „5“ wird „3“ (früher sprang das leere Feld auf 1, getippt wurde dann „13“)
  const n = dlg.getByLabel(/Karten \(von 5\)/), min = dlg.getByLabel('Zeit (Minuten)');
  await expect(n).toHaveValue('5');
  await n.click(); await page.keyboard.press('End'); await page.keyboard.press('Backspace');
  await expect(n).toHaveValue('');
  await page.keyboard.type('3');
  await expect(n).toHaveValue('3');
  await min.click(); await page.keyboard.press('End'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await page.keyboard.type('1');
  await expect(min).toHaveValue('1');
  // Zu große Werte werden beim Verlassen begrenzt
  await n.fill('99');
  await min.focus();
  await expect(n).toHaveValue('5');
  await n.fill('3');
  await dlg.getByRole('button', { name: 'Starten' }).click();
  await expect(dlg.getByText('Karte 1 von 3')).toBeVisible();
  await expect(dlg.getByRole('timer')).toHaveAccessibleName('Restzeit 1:00');

  // Eine Karte gewusst, dann läuft die Minute ab: Auswertung mit den nicht geschafften Karten
  await dlg.getByRole('button', { name: 'Lösung zeigen' }).click();
  await dlg.getByRole('button', { name: 'Gewusst', exact: true }).click();
  await expect(dlg.getByText('Karte 2 von 3')).toBeVisible();
  await page.clock.runFor(61000);
  const res = page.getByRole('dialog', { name: 'Auswertung' });
  await expect(res.getByText('33 %')).toBeVisible();
  await expect(res).toContainText('1 von 3');
  await expect(res).toContainText('2 nicht geschafft');
  // Der Fokus bleibt im Fenster, Tab springt nicht auf die Seite dahinter
  expect(await focusIn(page, '[role=dialog]')).toBe(true);
  await page.keyboard.press('Tab');
  expect(await focusIn(page, '[role=dialog]')).toBe(true);

  // Noch eine Runde: Einstellungen wie zuletzt, Enter startet
  await res.getByRole('button', { name: 'Noch eine Runde' }).click();
  await expect(dlg.getByLabel(/Karten \(von 5\)/)).toHaveValue('3');
  expect(await focusIn(page, '[role=dialog]')).toBe(true);
  await dlg.getByLabel('Zeit (Minuten)').press('Enter');
  await expect(dlg.getByText('Karte 1 von 3')).toBeVisible();
  // Abgeben ohne Antwort: 0 %, alle drei als unsicher; „heute wiederholen“ setzt sie fällig, der Lernstand bleibt sonst gleich
  await dlg.getByRole('button', { name: 'Abgeben' }).click();
  await expect(res.getByText('0 %', { exact: true })).toBeVisible();
  await res.getByRole('button', { name: '3 unsichere Karten heute wiederholen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).cards.filter((c) => c.due === '2026-10-21').length).toBe(3);
  expect((await stored(page)).cards.every((c) => c.reps === 0 && c.interval === 0)).toBe(true);
});

test('Probeklausur nach Themen ausgewertet, ohne Karten nur ein Hinweis', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00') });
  await startWith(page, ({ modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }, { id: 'la', name: 'Lineare Algebra', ects: 8, semester: 1, status: 'belegt', color: '#60a5fa' }],
    cards: ['a', 'b'].map((id) => card(id, { topicId: id === 'a' ? 't1' : 't2' })),
    topics: [{ id: 't1', moduleId: 'ds', title: 'Graphen', state: 'offen' }, { id: 't2', moduleId: 'ds', title: 'Mengen', state: 'offen' }],
    exams: [{ id: 'x', moduleId: 'ds', date: '2026-11-20' }, { id: 'y', moduleId: 'la', date: '2026-11-25' }] }));
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Prüfungen & Lernplan' }).click();
  // Lineare Algebra hat keine Karten: kein Knopf
  await expect(page.getByRole('button', { name: 'Probeklausur' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Probeklausur' }).click();
  const dlg = page.getByRole('dialog', { name: /Probeklausur/ });
  await dlg.getByRole('button', { name: 'Starten' }).click();
  for (let i = 0; i < 2; i++) {
    await dlg.getByRole('button', { name: 'Lösung zeigen' }).click();
    const front = await dlg.locator('.surface').innerText();
    await dlg.getByRole('button', { name: front.includes('Frage a') ? 'Gewusst' : 'Teilweise', exact: true }).click();
  }
  const res = page.getByRole('dialog', { name: 'Auswertung' });
  await expect(res.getByText('75 %')).toBeVisible();
  await expect(res).toContainText('1,5 von 2');
  await expect(res.getByRole('listitem')).toHaveCount(2);
  await expect(res.getByRole('listitem').first()).toContainText('Mengen');
  await expect(res.getByRole('listitem').first()).toContainText('50 %');
  await res.getByRole('button', { name: 'Schließen' }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Zielschnitt-Rechner: nötiger Schnitt im Rest, nicht erreichbar, sicher, ungültige Eingabe', async ({ page }) => {
  await start(page, () => ({ modules: [
    { id: 'a', name: 'Analysis', ects: 10, semester: 1, status: 'bestanden', grade: 2, color: '#34d399' },
    { id: 'b', name: 'Programmieren', ects: 5, semester: 1, status: 'bestanden', grade: 1, color: '#60a5fa' },
    { id: 'c', name: 'Seminar', ects: 5, semester: 2, status: 'bestanden', color: '#f472b6' }, /* unbenotet */
    { id: 'd', name: 'Algorithmen', ects: 8, semester: 2, status: 'belegt', color: '#fbbf24' },
  ] }));
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'ECTS', exact: true }) })).toContainText('20 / 180 bestanden');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Notenschnitt (ECTS-gewichtet)' }) });
  /* (10·2 + 5·1) / 15 = 1,67; Rest 160 ECTS. Ziel 2,0: (2·175 − 25) / 160 = 2,03 */
  await expect(card).toContainText('1,67');
  await expect(card).toContainText('aus 2 benoteten Modulen (15 ECTS)');
  const goal = card.getByLabel('Zielschnitt');
  await expect(goal).toHaveValue('2,0');
  await expect(card).toContainText('Benötigt im Rest (160 ECTS): Ø 2,03');
  await goal.fill('1,3');
  await expect(card).toContainText('Ø 1,27');
  await goal.fill('1');
  await expect(card).toContainText('Nicht mehr erreichbar');
  await goal.fill('4.0');
  await expect(card).toContainText('Sicher erreichbar, auch mit 4,0.');
  await goal.fill('sehr gut');
  await expect(card.getByText('–', { exact: true })).toBeVisible();
  await goal.fill('6');
  await expect(card.getByText('–', { exact: true })).toBeVisible();
});

test('Wochenrückblick: Kennzahlen gegen die Vorwoche, Lernzeit pro Tag und Modul, Kalender mit Tastatur', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T18:00:00') }); /* Mittwoch */
  await startWith(page, ({
    logs: [
      { id: 'l1', moduleId: 'ds', date: '2026-10-21', minutes: 60, kind: 'Nacharbeiten' },
      { id: 'l2', moduleId: 'ds', date: '2026-10-19', minutes: 30, kind: 'Nacharbeiten' },
      { id: 'l3', moduleId: 'ds', date: '2026-10-10', minutes: 45, kind: 'Nacharbeiten' },
    ],
    sessions: [
      { id: 's1', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-19', start: '10:00', end: '12:00', reviewed: true, reviewedAt: '2026-10-20' },
      { id: 's2', moduleId: 'ds', type: 'Übung', date: '2026-10-20', start: '10:00', end: '12:00', reviewed: false },
      { id: 's3', moduleId: 'ds', type: 'Vorlesung', date: '2026-10-12', start: '10:00', end: '12:00', reviewed: true, reviewedAt: '2026-10-12' },
      { id: 's4', moduleId: 'ds', type: 'Übung', date: '2026-10-13', start: '10:00', end: '12:00', reviewed: true, reviewedAt: '2026-10-13' },
    ],
    homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', due: '2026-10-22', status: 'abgegeben', doneAt: '2026-10-18' }],
    cards: [card('a', { lastReview: '2026-10-21', due: '2026-10-24' }), card('b', { lastReview: '2026-10-01', due: '2026-10-24' })],
  }));
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Wochenrückblick' }).click();
  await expect(page.getByText('Letzte 7 Tage (15.10.2026 – 21.10.2026) im Vergleich zur Vorwoche')).toBeVisible();
  const stat = (label) => page.locator('.stat', { has: page.getByText(label, { exact: true }) });
  await expect(stat('Lernzeit')).toContainText('1 h 30 min');
  await expect(stat('Lernzeit')).toContainText('Vorwoche 45 min');
  await expect(stat('Termine nachbereitet')).toContainText('1');
  await expect(stat('Termine nachbereitet')).toContainText('−1 zur Vorwoche');
  await expect(stat('Hausaufgaben erledigt')).toContainText('+1 zur Vorwoche');
  await expect(stat('Karten wiederholt')).toContainText('1');
  await expect(page.getByRole('img', { name: /^Lernzeit pro Tag: / })).toHaveAccessibleName(/Mo 30 Minuten, Di 0 Minuten, Mi 60 Minuten$/);
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Nachbereitungsquote der Woche' }) })).toContainText('1/2');
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Lernzeit pro Modul' }) })).toContainText('Diskrete Strukturen1 h 30 min');

  // Lernzeit-Kalender: Wintersemester, heute ist per Tab erreichbar, Pfeile wandern, Antippen zeigt Summe und Module
  const cal = page.locator('section', { has: page.getByRole('heading', { name: 'Lernzeit-Kalender' }) });
  await expect(cal).toContainText('Wintersemester 2026/27: 2 h 15 min an 3 Tagen');
  const today = cal.getByRole('button', { name: 'Mi, 21.10.: 1 h' });
  await expect(today).toHaveAttribute('tabindex', '0');
  await today.focus();
  await page.keyboard.press('ArrowUp'); /* einen Tag zurück */
  await page.keyboard.press('ArrowUp');
  const mon = cal.getByRole('button', { name: 'Mo, 19.10.: 30 min' });
  await expect(mon).toBeFocused();
  await expect(mon).toHaveAttribute('aria-pressed', 'true');
  await expect(cal.getByRole('status')).toContainText('Mo, 19.10. 30 min');
  await expect(cal.getByRole('status')).toContainText('Diskrete Strukturen');
  // Voriges Semester: Sommersemester, ohne Lernzeit; zurück geht es nicht über heute hinaus
  await cal.getByRole('button', { name: 'Voriges Semester' }).click();
  await expect(cal).toContainText('Sommersemester 2026: 0 min an 0 Tagen');
  await expect(cal.getByRole('status')).toHaveCount(0);
  await cal.getByRole('button', { name: 'Nächstes Semester' }).click();
  await expect(cal.getByRole('button', { name: 'Nächstes Semester' })).toBeDisabled();
});

test('Erfolge: Fortschritt der Abzeichen, neues Abzeichen über den Timer meldet sich und führt zu den Erfolgen', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00') });
  await start(page, () => ({ logs: [
    { id: 'l1', moduleId: 'ds', date: '2026-10-19', minutes: 50, kind: 'Nacharbeiten' },
    { id: 'l2', moduleId: 'ds', date: '2026-10-20', minutes: 70, kind: 'Nacharbeiten' },
  ] }));
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Erfolge' }).click();
  await expect(page.getByText(/^1 von \d+ Abzeichen freigeschaltet$/)).toBeVisible();
  const badge = (title) => page.locator('.badge', { has: page.getByText(title, { exact: true }) });
  await expect(badge('Erster Schritt')).toContainText('Freigeschaltet');
  await expect(badge('Warmgelaufen')).toContainText('2 / 3');
  await expect(badge('Zehn Stunden')).toContainText('2 / 10');
  await expect(badge('Warmgelaufen').getByRole('progressbar')).toHaveCount(1);

  // Heute 25 min Fokus: dritter Tag in Folge → „Warmgelaufen“ wird gemeldet
  await page.keyboard.press('t');
  await expect(page.getByRole('tab', { name: 'Timer', selected: true })).toBeVisible();
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.clock.fastForward(25 * 60 * 1000 + 1000);
  await expect.poll(async () => (await stored(page)).logs.length).toBe(3);
  await page.clock.runFor(1500); /* Abzeichen werden im Leerlauf gerechnet */
  await expect(page.getByText('Abzeichen freigeschaltet: „Warmgelaufen“')).toBeVisible();
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ansehen' }).click();
  await expect(page.getByRole('tab', { name: 'Erfolge', selected: true })).toBeVisible();
  await expect(badge('Warmgelaufen')).toContainText('Freigeschaltet');
  await expect(page.getByText(/^2 von \d+ Abzeichen freigeschaltet$/)).toBeVisible();
});

test('Fokus-Timer: Restzeit und Ring laufen, Knöpfe wechseln, Beenden & eintragen schreibt die Minuten', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00') });
  await start(page);
  await nav(page, 'Lernen').click();
  await page.getByRole('tab', { name: 'Timer' }).click();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText('25:00');
  await expect(page.getByRole('button', { name: 'Beenden & eintragen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect(page.getByRole('button', { name: 'Pausieren' })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(timer).toHaveText('24:58');
  await expect(timer).toHaveAccessibleName('24 Minuten 58 Sekunden verbleibend');
  await expect(page.getByRole('button', { name: 'Beenden & eintragen' })).toBeVisible();
  // Nach 1/40 der Zeit ist der erste Block des Rings gefüllt
  const filled = () => page.locator('.px-ring rect').evaluateAll((rs) => rs.filter((r) => !r.style.fill.includes('--hm0')).length);
  expect(await filled()).toBe(0);
  await page.clock.runFor(38000);
  await expect(timer).toHaveText('24:20');
  await expect.poll(filled).toBe(1);
  // Leertaste pausiert (nicht in Feldern), dann steht die Zeit
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(timer).toHaveText('24:20');
  // Die Kopfzeile zeigt den Timer, solange er nicht zurückgesetzt ist
  await expect(page.getByRole('button', { name: 'Zum Timer' })).toContainText('Fokus 24:20');
  await page.keyboard.press(' ');
  await page.clock.runFor(60000);
  await expect(timer).toHaveText('23:20');
  await page.getByRole('button', { name: 'Beenden & eintragen' }).click();
  await expect(timer).toHaveText('25:00');
  await expect(page.getByRole('button', { name: 'Starten' })).toBeVisible();
  await expect.poll(async () => (await stored(page)).logs.map((l) => [l.minutes, l.date])).toEqual([[2, '2026-10-21']]);
});

test('Reiter mit den Pfeiltasten: links/rechts, Pos1 und Ende wählen und fokussieren', async ({ page }) => {
  await start(page);
  await nav(page, 'Mehr').click();
  const first = page.getByRole('tab', { name: 'Wochenrückblick' });
  await first.click();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const erfolge = page.getByRole('tab', { name: 'Erfolge' });
  await expect(erfolge).toHaveAttribute('aria-selected', 'true');
  await expect(erfolge).toBeFocused();
  await expect(page.getByText(/Abzeichen freigeschaltet/)).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Was ist neu' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Was ist neu' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); /* am Ende bleibt es stehen */
  await expect(page.getByRole('tab', { name: 'Was ist neu' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(first).toHaveAttribute('aria-selected', 'true');
});
