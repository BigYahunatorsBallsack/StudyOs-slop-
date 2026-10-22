/* Nutzerwege, die bisher kein E2E-Test abgedeckt hat: Module über das Formular, Modul löschen und aus dem Papierkorb
   zurückholen, Semester archivieren und zurückholen, Sicherung als JSON (Export, Fehler, Ersetzen), Wiederherstellungspunkt,
   Kalender-Export als .ics, eigene vorlesungsfreie Zeit, Prüfung im Modul eintragen, Hausaufgaben-Filter. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { choose } from './select.js';
import { guard, nav, openData, openGroup, start, stored } from './helpers.js';

guard(test);

test('Modul über das Formular anlegen, als bestanden benoten, Notenschnitt im Studienfortschritt', async ({ page }) => {
  await start(page, () => ({ modules: [] }));
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: 'Modul anlegen' }).first().click();
  const form = page.getByRole('dialog', { name: /Modul anlegen/ });
  await form.getByLabel('Name').fill('Lineare Algebra');
  await form.getByLabel('Modulnummer').fill('MA0901');
  await form.getByLabel('ECTS').fill('8');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).modules.map((m) => [m.name, m.code, Number(m.ects), m.status])).toEqual([['Lineare Algebra', 'MA0901', 8, 'belegt']]);

  // Bearbeiten: bestanden mit Note 1,7 (Komma-Eingabe)
  await page.getByRole('button', { name: /Lineare Algebra/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Lineare Algebra' })).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  const edit = page.getByRole('dialog', { name: /Modul bearbeiten/ });
  await choose(edit.getByLabel('Status'), 'bestanden');
  await edit.getByLabel('Note (optional)').fill('1,7');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByText('MA0901 · 8 ECTS · Semester 1 · bestanden · Note 1,7')).toBeVisible();

  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  const avg = page.locator('section', { has: page.getByRole('heading', { name: 'Notenschnitt (ECTS-gewichtet)' }) });
  await expect(avg).toContainText('1,70');
  await expect(avg).toContainText('aus 1 benoteten Modulen (8 ECTS)');
});

test('Modul inkl. Daten löschen und aus dem Papierkorb zurückholen, Notiz hängt wieder am Modul; Papierkorb leeren', async ({ page }) => {
  await start(page, (day) => ({
    homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 4', due: day(3), status: 'ausgegeben' }],
    sessions: [{ id: 's1', moduleId: 'ds', type: 'Vorlesung', date: day(2), start: '10:00', end: '12:00' }],
    notes: [{ id: 'n1', moduleId: 'ds', title: 'Graphen', text: 'Bäume' }],
  }));
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  const form = page.getByRole('dialog', { name: /Modul bearbeiten/ });
  await form.getByRole('button', { name: 'Löschen' }).click();
  await form.getByRole('button', { name: 'Modul inkl. Daten löschen?' }).click();
  await expect(page.getByText('Modul gelöscht.')).toBeVisible();
  await expect.poll(async () => { const d = await stored(page); return [d.modules.length, d.homework.length, d.sessions.length, d.notes[0]?.moduleId]; }).toEqual([0, 0, 0, '']);

  await openData(page, 'Papierkorb');
  const trash = page.locator('section', { has: page.getByRole('heading', { name: /^Papierkorb/ }) });
  await expect(trash).toContainText('Diskrete Strukturen');
  await expect(trash).toContainText('Modul mit 2 weiteren Einträgen');
  await trash.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText('„Diskrete Strukturen“ wiederhergestellt.')).toBeVisible();
  await expect(trash).toContainText('Leer.');
  await expect.poll(async () => { const d = await stored(page); return [d.modules.map((m) => m.id), d.homework.map((h) => h.id), d.sessions.map((s) => s.id), d.notes[0]?.moduleId]; })
    .toEqual([['ds'], ['h1'], ['s1'], 'ds']);

  // Eine Abgabe löschen und den Papierkorb endgültig leeren
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await page.getByRole('checkbox', { name: /Blatt 4/ }).click();
  await page.getByRole('toolbar', { name: 'Auswahl' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('1 Abgabe gelöscht.')).toBeVisible();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
  await openGroup(page, 'Papierkorb');
  await expect(trash).toContainText('Blatt 4');
  await trash.getByRole('button', { name: 'Papierkorb leeren' }).click();
  await trash.getByRole('button', { name: 'Endgültig löschen?' }).click();
  await expect(trash).toContainText('Leer.');
  await expect.poll(async () => (await stored(page)).meta.trash?.length ?? 0).toBe(0);
  await page.reload();
  await openData(page, 'Papierkorb');
  await expect(trash).toContainText('Leer.');
  expect((await stored(page)).homework).toEqual([]);
});

test('Semesterwechsel: altes Semester archivieren blendet es auf Heute aus, Zurückholen bringt es wieder', async ({ page }) => {
  await start(page, (day) => ({
    modules: [{ id: 'alt', name: 'Analysis 1', ects: 8, semester: 1, status: 'bestanden', grade: 2.3, color: '#f472b6' },
      { id: 'neu', name: 'Analysis 2', ects: 8, semester: 2, status: 'belegt', color: '#38bdf8' }],
    homework: [{ id: 'ha', moduleId: 'alt', title: 'Altes Blatt', due: day(1), status: 'ausgegeben' },
      { id: 'hn', moduleId: 'neu', title: 'Neues Blatt', due: day(1), status: 'ausgegeben' }],
  }));
  await expect(page.getByText('Altes Blatt').first()).toBeVisible();
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  const sem1 = page.locator('div.mb-3', { has: page.getByText(/^Semester 1/) });
  await sem1.getByRole('button', { name: 'Archivieren' }).click();
  await expect(sem1).toContainText('8 ECTS, archiviert');
  await expect.poll(async () => (await stored(page)).modules.map((m) => [m.id, !!m.archived])).toEqual([['alt', true], ['neu', false]]);

  await nav(page, 'Heute').click();
  await expect(page.getByText('Neues Blatt').first()).toBeVisible();
  await expect(page.getByText('Altes Blatt')).toHaveCount(0);
  await nav(page, 'Module').click();
  await expect(page.getByRole('heading', { name: /Archiv/ })).toBeVisible();
  await page.getByRole('button', { name: 'Anzeigen' }).click();
  await expect(page.getByRole('button', { name: /Analysis 1/ })).toBeVisible();

  // Zurückholen
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Studienfortschritt' }).click();
  await sem1.getByRole('button', { name: 'Zurückholen' }).click();
  await expect(sem1.getByRole('button', { name: 'Archivieren' })).toBeVisible();
  await nav(page, 'Heute').click();
  await expect(page.getByText('Altes Blatt').first()).toBeVisible();
  await nav(page, 'Module').click();
  await expect(page.getByRole('heading', { name: /Archiv/ })).toHaveCount(0);
});

test('Sicherung als JSON: herunterladen, ungültigen Text ablehnen, eingefügte Sicherung ersetzt die Daten', async ({ page }) => {
  await start(page, (day) => ({ notes: [{ id: 'n1', moduleId: 'ds', title: 'Vor der Sicherung', text: 'x' }], homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 1', due: day(2), status: 'ausgegeben' }] }));
  await openData(page, 'Sicherung');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als Datei herunterladen' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^studyos-backup-\d{4}-\d\d-\d\d\.json$/);
  const text = readFileSync(await download.path(), 'utf8');
  const backup = JSON.parse(text);
  expect(backup.notes.map((n) => n.title)).toEqual(['Vor der Sicherung']);
  await expect(page.getByText('Sicherung exportiert. Bewahre die Datei an einem zweiten Ort auf.')).toBeVisible();
  await expect.poll(async () => (await stored(page)).meta.lastBackup).toBe(backup.meta.lastBackup);

  // JSON anzeigen zeigt denselben Stand
  await page.getByRole('button', { name: 'JSON anzeigen' }).click();
  await expect(page.getByLabel('Exportierte Daten')).toHaveValue(/"Vor der Sicherung"/);
  await page.getByRole('button', { name: 'JSON ausblenden' }).click();

  // Nach der Sicherung ändert sich etwas
  await page.evaluate(async () => { const d = await window.STUDYOS_ENV.load(); d.notes = [...d.notes, { id: 'n2', moduleId: 'ds', title: 'Nach der Sicherung', text: 'y' }]; await window.STUDYOS_ENV.save(d); });
  await page.reload();
  await openData(page, 'Sicherung');

  const paste = page.getByLabel('JSON zum Import einfügen');
  await expect(page.getByRole('button', { name: 'Eingefügten Text prüfen' })).toBeDisabled();
  await paste.fill('{"modules": [');
  await page.getByRole('button', { name: 'Eingefügten Text prüfen' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Die Datei ist kein gültiges JSON.' })).toBeVisible();

  await paste.fill(text);
  await page.getByRole('button', { name: 'Eingefügten Text prüfen' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'kein gültiges JSON' })).toHaveCount(0);
  await expect(page.getByText(/^Gefunden: /)).toBeVisible();
  await page.getByRole('button', { name: 'Daten ersetzen' }).click();
  await page.getByRole('button', { name: 'Ja, alles ersetzen' }).click();
  await expect(page.getByText('Import abgeschlossen. Deine Daten werden gespeichert.')).toBeVisible();
  await expect(paste).toHaveValue('');
  await expect.poll(async () => (await stored(page)).notes.map((n) => n.title)).toEqual(['Vor der Sicherung']);
  await page.reload();
  expect((await stored(page)).homework.map((h) => h.title)).toEqual(['Blatt 1']);
});

test('Wiederherstellungspunkt auf dem Gerät erstellen und zurückspielen', async ({ page }) => {
  await start(page, () => ({ notes: [{ id: 'n1', moduleId: 'ds', title: 'Stand A', text: 'x' }] }));
  await openData(page, 'Sicherung');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Wiederherstellung auf diesem Gerät' }) });
  await card.getByRole('button', { name: 'Jetzt Wiederherstellungspunkt erstellen' }).click();
  await expect(card.getByText('Wiederherstellungspunkt auf diesem Gerät erstellt.')).toBeVisible();
  const point = card.getByRole('listitem').filter({ hasText: 'Manuelle Sicherung' });
  await expect(point).toHaveCount(1);

  // Danach geht etwas verloren: die Notiz wird gelöscht
  await page.evaluate(async () => { const d = await window.STUDYOS_ENV.load(); d.notes = []; await window.STUDYOS_ENV.save(d); });
  await page.reload();
  await openData(page, 'Sicherung');
  await point.getByRole('button', { name: 'Wiederherstellen' }).click();
  await point.getByRole('button', { name: 'Daten ersetzen?' }).click();
  await expect(card.getByText('Wiederherstellung gestartet. Die Daten werden gespeichert.')).toBeVisible();
  await expect.poll(async () => (await stored(page)).notes.map((n) => n.title)).toEqual(['Stand A']);
});

test('Kalender exportieren: Abgaben und Prüfungen als .ics, Lehrveranstaltungen nur auf Wunsch', async ({ page }) => {
  await start(page, (day) => ({
    homework: [{ id: 'h1', moduleId: 'ds', title: 'Blatt 7', due: day(4), dueTime: '23:59', status: 'ausgegeben' }, { id: 'h2', moduleId: 'ds', title: 'Schon abgegeben', due: day(5), status: 'abgegeben' }],
    exams: [{ id: 'x1', moduleId: 'ds', date: day(30), time: '09:00', kind: 'Klausur', room: 'MW 2001' }],
    sessions: [{ id: 's1', moduleId: 'ds', type: 'Übung', date: day(1), start: '14:00', end: '16:00', room: 'MI 00.08' }],
  }));
  await openData(page, 'Kalender');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Kalender exportieren' }) });
  const ics = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Kalenderdatei erstellen' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^studyos-kalender-\d{4}-\d\d-\d\d\.ics$/);
    return readFileSync(await dl.path(), 'utf8');
  };
  let text = await ics();
  await expect(card.getByRole('status')).toHaveText(/^Kalenderdatei erstellt/);
  expect(text).toMatch(/^BEGIN:VCALENDAR/);
  expect(text).toContain('Blatt 7');
  expect(text).not.toContain('Schon abgegeben');
  expect(text).toContain('MW 2001');
  expect(text).not.toContain('MI 00.08');
  expect(text).toContain('BEGIN:VALARM');

  await card.getByLabel('Anstehende Lehrveranstaltungen').check();
  await card.getByLabel('Offene Hausaufgaben und Abgaben').uncheck();
  text = await ics();
  expect(text).toContain('MI 00.08');
  expect(text).not.toContain('Blatt 7');

  // Nichts gewählt: Knopf aus
  await card.getByLabel('Prüfungen').uncheck();
  await card.getByLabel('Anstehende Lehrveranstaltungen').uncheck();
  await expect(card.getByRole('button', { name: 'Kalenderdatei erstellen' })).toBeDisabled();
});

test('Eigene vorlesungsfreie Zeit: Termine darin fallen aus, Zeitraum lässt sich wieder entfernen', async ({ page }) => {
  await start(page, (day) => ({ sessions: [{ id: 'drin', moduleId: 'ds', type: 'Vorlesung', date: day(8), start: '10:00', end: '12:00' },
    { id: 'raus', moduleId: 'ds', type: 'Vorlesung', date: day(15), start: '10:00', end: '12:00' }] }));
  const range = await page.evaluate(() => { const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }; return [day(7), day(9)]; });
  await openData(page, 'Studium');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Feiertage und vorlesungsfreie Zeit' }) });
  const add = card.getByRole('button', { name: 'Zeitraum hinzufügen' });
  await expect(add).toBeDisabled();
  await card.getByLabel('Vorlesungsfrei von').fill(range[0]);
  await card.getByLabel('bis', { exact: true }).fill(range[1]);
  await card.getByLabel('Bezeichnung').fill('Exkursion');
  await add.click();
  await expect(card.getByText(/^Exkursion: /)).toBeVisible();
  await expect(card.getByLabel('Vorlesungsfrei von')).toHaveValue('');
  const session = (id) => page.evaluate(async (i) => (await window.STUDYOS_ENV.load()).sessions.find((s) => s.id === i), id);
  await expect.poll(async () => (await session('drin'))?.cancelled).toBe(true);
  expect(await session('drin')).toMatchObject({ offReason: 'Exkursion' });
  expect((await session('raus')).cancelled).toBeFalsy();
  expect((await stored(page)).settings.breaks).toMatchObject([{ from: range[0], to: range[1], label: 'Exkursion' }]);

  await card.getByRole('button', { name: 'Exkursion entfernen' }).click();
  await expect(card.getByText(/^Exkursion: /)).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).settings.breaks).toEqual([]);
});

test('Prüfung im Modul eintragen: steht danach mit Abstand in Tagen in der Übersicht', async ({ page }) => {
  await start(page);
  const date = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 20); return d.toLocaleDateString('sv-SE'); });
  await nav(page, 'Module').click();
  await page.getByRole('button', { name: /Diskrete Strukturen/ }).first().click();
  await page.getByRole('button', { name: 'eintragen', exact: true }).click();
  const form = page.getByRole('dialog', { name: /Prüfung anlegen/ });
  await form.getByLabel('Datum').fill(date);
  await form.getByLabel('Raum').fill('MW 0001');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).exams.map((x) => [x.moduleId, x.date, x.room])).toEqual([['ds', date, 'MW 0001']]);
  await expect(page.getByText(/\(in 20 T\.\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'eintragen', exact: true })).toHaveCount(0);
});

test('Alle Hausaufgaben: Filter Offen, Erledigt und Alle', async ({ page }) => {
  await start(page, (day) => ({ homework: [
    { id: 'o', moduleId: 'ds', title: 'Offenes Blatt', due: day(2), status: 'ausgegeben' },
    { id: 'a', moduleId: 'ds', title: 'Abgegebenes Blatt', due: day(-2), status: 'abgegeben' },
  ] }));
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  const filter = page.getByRole('tablist', { name: 'Filter Hausaufgaben' });
  await expect(filter.getByRole('tab', { name: 'Offen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Offenes Blatt', { exact: true })).toBeVisible();
  await expect(page.getByText('Abgegebenes Blatt', { exact: true })).toHaveCount(0);
  await filter.getByRole('tab', { name: 'Erledigt' }).click();
  await expect(page.getByText('Abgegebenes Blatt', { exact: true })).toBeVisible();
  await expect(page.getByText('Offenes Blatt', { exact: true })).toHaveCount(0);
  await filter.getByRole('tab', { name: 'Alle' }).click();
  await expect(page.getByText('Offenes Blatt', { exact: true })).toBeVisible();
  await expect(page.getByText('Abgegebenes Blatt', { exact: true })).toBeVisible();
});
