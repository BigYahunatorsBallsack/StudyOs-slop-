import { test, expect } from '@playwright/test';

/* Cloud-Sync mit zwei simulierten Geräten. Das Backend liegt im Testprozess und verhält sich wie
   die Supabase-Tabelle (eine Zeile pro Nutzer, Versionsnummer für Konflikterkennung). */
function createBackend() {
  const rows = new Map();
  const push = new Map(); /* user → { subscriptions, deadlines, tz } */
  const pushRow = (uid) => { if (!push.has(uid)) push.set(uid, { subscriptions: [], deadlines: [], tz: '' }); return push.get(uid); };
  return {
    rows, push, tests: 0, shares: new Map(),
    async handle(op, ...args) {
      if (op === 'sendCode') return true;
      if (op === 'push.vapid') return 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
      if (op === 'push.saveSubscription') { const r = pushRow(args[0]); r.subscriptions = [...r.subscriptions.filter((x) => x.endpoint !== args[1].endpoint), args[1]]; r.tz = args[2]; return true; }
      if (op === 'push.removeSubscription') { const r = pushRow(args[0]); r.subscriptions = r.subscriptions.filter((x) => x.endpoint !== args[1]); return true; }
      if (op === 'push.saveDeadlines') { const r = pushRow(args[0]); r.deadlines = args[1]; r.tz = args[2]; return true; }
      if (op === 'push.setCalToken') { pushRow(args[0]).cal_token = args[1]; return true; }
      if (op === 'push.test') { this.tests++; return { devices: pushRow(args[0]).subscriptions.length, sent: pushRow(args[0]).subscriptions.length }; }
      if (op === 'shares.create') { this.shares.set(args[1], { owner: args[0], blob: args[2] }); return true; }
      if (op === 'shares.get') return this.shares.get(args[0])?.blob ?? null;
      if (op === 'shares.remove') { if (this.shares.get(args[1])?.owner === args[0]) this.shares.delete(args[1]); return true; }
      if (op === 'ics') return this.ics ? this.ics(args[1]) : { error: 'kein Kalender' };
      if (op === 'verifyCode') return args[1] === '123456';
      const [uid, payload, version] = args;
      if (op === 'get') return rows.get(uid) ?? null;
      if (op === 'insert') { if (rows.has(uid)) return false; rows.set(uid, { version: 1, payload }); return true; }
      if (op === 'update') { const r = rows.get(uid); if (!r || r.version !== version) return false; rows.set(uid, { version: version + 1, payload }); return true; }
      if (op === 'remove') { rows.delete(uid); return true; }
      throw new Error('unbekannte Operation ' + op);
    },
  };
}

async function newDevice(browser, backend) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'de-DE', permissions: ['notifications'] });
  /* Push-Dienst des Browsers durch eine Attrappe ersetzen (Headless-Chromium erreicht keinen echten Push-Dienst) */
  await context.addInitScript(() => {
    let sub = null;
    const make = (key) => ({ endpoint: 'https://push.example.org/' + Math.random().toString(36).slice(2), key,
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BKey', auth: 'Auth' } }; }, async unsubscribe() { sub = null; return true; } });
    if (window.PushManager) {
      PushManager.prototype.getSubscription = async function () { return sub; };
      PushManager.prototype.subscribe = async function (opts) { if (!opts || !opts.applicationServerKey) throw new Error('kein Schlüssel'); sub = make(opts.applicationServerKey); return sub; };
    }
    if (window.Notification) Notification.requestPermission = async () => 'granted';
  });
  await context.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.exposeFunction('__studyosFakeCloud', (...a) => backend.handle(...a));
  await page.goto('./');
  return { context, page, errors };
}
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
async function openData(page) {
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
}
async function addNote(page, title) {
  await page.goto('./?aktion=notiz');
  await page.getByLabel('Titel').fill(title);
  await page.getByRole('button', { name: 'Speichern' }).click();
}
async function login(page, mail = 'waltuh@example.org') {
  await openData(page);
  await page.getByLabel('E-Mail-Adresse').fill(mail);
  await page.getByRole('button', { name: 'Code senden' }).click();
  await page.getByLabel('Code aus der E-Mail').fill('123456');
  await page.getByRole('button', { name: 'Anmelden' }).click();
}
const notes = (page) => page.evaluate(async () => (await window.STUDYOS_ENV.load())?.notes.map((n) => n.title).sort() ?? []);

test('zwei Geräte: anmelden, Passphrase, gegenseitig synchronisieren, falsche Passphrase', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  const B = await newDevice(browser, backend);

  // Gerät A: Notiz anlegen, anmelden, Passphrase festlegen → lädt hoch
  await addNote(A.page, 'Notiz von A');
  await login(A.page);
  await expect(A.page.getByText('Lege eine Sync-Passphrase fest.')).toBeVisible();
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect.poll(() => backend.rows.size, { timeout: 15000 }).toBe(1);
  expect(JSON.stringify([...backend.rows.values()])).not.toContain('Notiz von A');

  // Gerät B: hat eigene Daten, meldet sich an; falsche Passphrase wird abgelehnt
  await addNote(B.page, 'Notiz von B');
  await login(B.page);
  await expect(B.page.getByText('In der Cloud liegen schon Daten.')).toBeVisible();
  await B.page.getByLabel('Sync-Passphrase', { exact: true }).fill('falsch-falsch');
  await B.page.getByRole('button', { name: 'Entsperren und synchronisieren' }).click();
  await expect(B.page.getByText(/Falsche Passphrase/)).toBeVisible();
  await B.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await B.page.getByRole('button', { name: 'Entsperren und synchronisieren' }).click();
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toEqual(['Notiz von A', 'Notiz von B']);

  // Gerät A holt sich B's Notiz
  await openData(A.page);
  await A.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect.poll(() => notes(A.page), { timeout: 15000 }).toEqual(['Notiz von A', 'Notiz von B']);

  // Änderung auf A kommt automatisch (entprellt) in der Cloud an und dann bei B
  await addNote(A.page, 'Spätere Notiz');
  await expect.poll(() => backend.rows.values().next().value.version, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
  await B.page.reload();
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toContain('Spätere Notiz');

  // Schlüssel überlebt Neuladen: kein erneutes Passphrase-Feld
  await openData(B.page);
  await expect(B.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible();
  await expect(B.page.getByText(/Angemeldet als waltuh@example.org/)).toBeVisible();

  // Abmelden lässt lokale Daten stehen
  await B.page.getByRole('button', { name: 'Abmelden' }).click();
  await B.page.getByRole('button', { name: 'Auf diesem Gerät abmelden?' }).click();
  await expect(B.page.getByRole('button', { name: 'Code senden' })).toBeVisible();
  expect(await notes(B.page)).toContain('Notiz von A');

  expect(A.errors).toEqual([]);
  expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('echte Supabase-Anbindung: verständliche Meldung, wenn der Server nicht erreichbar ist', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // Supabase-Anfragen gezielt scheitern lassen (wie offline oder pausiertes Projekt)
  await page.route('**/*.supabase.co/**', (route) => route.abort('internetdisconnected'));
  await page.goto('./');
  await openData(page);
  await page.getByLabel('E-Mail-Adresse').fill('waltuh@example.org');
  await page.getByRole('button', { name: 'Code senden' }).click();
  await expect(page.getByText(/Keine Verbindung zu Supabase/)).toBeVisible();
  expect(pageErrors).toEqual([]);
  await context.close();
});

test('Erinnerungen: einschalten, Fristen hochladen, Testnachricht, ausschalten', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  // Beispieldaten: enthalten Abgaben und eine Prüfung
  await openData(A.page);
  await A.page.getByRole('button', { name: 'Beispieldaten laden' }).click();
  await A.page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });

  await A.page.getByRole('button', { name: 'Erinnerungen einschalten' }).click();
  await expect(A.page.getByText('Erinnerungen sind auf diesem Gerät eingeschaltet.')).toBeVisible();
  const uid = [...backend.push.keys()][0];
  expect(backend.push.get(uid).subscriptions).toHaveLength(1);
  expect(backend.push.get(uid).tz).toBeTruthy();
  const kinds = () => backend.push.get(uid).deadlines.map((x) => x.kind);
  expect(kinds()).toContain('homework');
  expect(kinds()).toContain('exam');
  expect(backend.push.get(uid).deadlines.find((x) => x.kind === 'exam').module).toBe('Diskrete Strukturen (Beispiel)');

  // Neue Frist wird automatisch nachgereicht
  await A.page.keyboard.press('e');
  await A.page.getByLabel('Was steht an?').fill('Blatt 8 Diskrete übermorgen');
  await A.page.getByRole('button', { name: 'Hausaufgabe anlegen' }).click();
  await expect.poll(() => backend.push.get(uid).deadlines.map((x) => x.title), { timeout: 15000 }).toContain('Blatt 8');

  // Testnachricht und Ausschalten
  await A.page.getByRole('button', { name: 'Testnachricht schicken' }).click();
  await expect(A.page.getByText('Testnachricht an 1 Gerät geschickt.')).toBeVisible();
  expect(backend.tests).toBe(1);
  await A.page.getByRole('button', { name: 'Auf diesem Gerät ausschalten' }).click();
  await expect(A.page.getByRole('button', { name: 'Erinnerungen einschalten' })).toBeVisible();
  expect(backend.push.get(uid).subscriptions).toHaveLength(0);
  expect(A.errors).toEqual([]);
  await A.context.close();
});

test('Stundenplan-Abo: einrichten, Änderungen übernehmen, neue Veranstaltung zuordnen', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const day = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString('sv-SE').replace(/-/g, ''); };
  const vevent = (uid, summary, n, extra = '') => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:${day(n)}T101500\r\nDTEND:${day(n)}T114500\r\nLOCATION:MI HS 1\r\n${extra}END:VEVENT\r\n`;
  let calendar = `BEGIN:VCALENDAR\r\n${vevent('a1', 'Analysis für Informatik VO', 1)}${vevent('a2', 'Analysis für Informatik VO', 8)}END:VCALENDAR\r\n`;
  const urls = [];
  backend.ics = (url) => { urls.push(url); return { text: calendar }; };
  const A = await newDevice(browser, backend);
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });

  await A.page.getByLabel('TUMonline-Kalender-Link').fill('https://campus.tum.de/tumonline/ical?pToken=abc');
  await A.page.getByRole('button', { name: 'Abrufen', exact: true }).first().click();
  await expect(A.page.getByText('2 Termine in 1 Veranstaltungen gefunden.')).toBeVisible();
  await expect(A.page.getByLabel('Modul für Analysis für Informatik VO')).toHaveValue('__new');
  await A.page.getByRole('button', { name: 'Abonnieren' }).click();
  await expect(A.page.getByText('Abonniert: 2 Termine übernommen.')).toBeVisible();
  const sessions = () => A.page.evaluate(async () => ((await window.STUDYOS_ENV.load()) || { sessions: [] }).sessions.map((s) => `${s.room}|${!!s.cancelled}`).sort());
  await expect.poll(sessions).toEqual(['MI HS 1|false', 'MI HS 1|false']);
  await expect.poll(() => A.page.evaluate(async () => ((await window.STUDYOS_ENV.load()) || { modules: [] }).modules.map((m) => m.name))).toEqual(['Analysis für Informatik']);

  // TUMonline ändert etwas: Raumänderung, Absage, neue Übung
  calendar = `BEGIN:VCALENDAR\r\n${vevent('a1', 'Analysis für Informatik VO', 1).replace('MI HS 1', 'Interims I')}${vevent('a2', 'Analysis für Informatik VO', 8, 'STATUS:CANCELLED\r\n')}${vevent('u1', 'Diskrete Strukturen UE', 2)}END:VCALENDAR\r\n`;
  await A.page.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(A.page.getByText('Abgerufen: 0 neu, 1 geändert, 1 abgesagt, 0 entfernt.')).toBeVisible();
  await expect.poll(sessions).toEqual(['Interims I|false', 'MI HS 1|true']);
  await expect(A.page.getByText('1 neue Veranstaltung im Kalender')).toBeVisible();
  await A.page.getByRole('button', { name: 'Zuordnung übernehmen' }).click();
  await expect(A.page.getByText('Zugeordnet: 1 Termine übernommen.')).toBeVisible();
  expect(urls.every((u) => u.includes('pToken=abc'))).toBe(true);
  expect(A.errors).toEqual([]);
  await A.context.close();
});

test('Erinnerungen: verständliche Meldung, wenn der Push-Dienst des Browsers streikt', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  await A.context.addInitScript(() => {
    if (window.PushManager) PushManager.prototype.subscribe = async () => { throw new DOMException('Registration failed - push service error', 'AbortError'); };
  });
  await A.page.reload();
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await A.page.getByRole('button', { name: 'Erinnerungen einschalten' }).click();
  await expect(A.page.getByText(/konnte sich nicht beim Push-Dienst anmelden.*Brave/)).toBeVisible();
  await expect(A.page.getByRole('button', { name: 'Erinnerungen einschalten' })).toBeEnabled();
  await A.context.close();
});

test('Stundenplan-Abo legt Vorlesung, Übung und Tutorübung als ein Modul an', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE').replace(/-/g, '');
  const ve = (uid, summary, n, h) => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:${day(n)}T${h}0000\r\nDTEND:${day(n)}T${h + 1}3000\r\nEND:VEVENT\r\n`;
  backend.ics = () => ({ text: `BEGIN:VCALENDAR\r\n${ve('a', 'Diskrete Strukturen', 1, 10)}${ve('b', 'Übungen zu Diskrete Strukturen', 2, 12)}${ve('c', 'Tutorübungen zu Diskrete Strukturen', 3, 14)}END:VCALENDAR\r\n` });
  const A = await newDevice(browser, backend);
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });
  await A.page.getByLabel('TUMonline-Kalender-Link').fill('https://campus.tum.de/x.ics');
  await A.page.getByRole('button', { name: 'Abrufen', exact: true }).first().click();
  await A.page.getByRole('button', { name: 'Abonnieren' }).click();
  await expect(A.page.getByText('Abonniert: 3 Termine übernommen.')).toBeVisible();
  await expect.poll(() => A.page.evaluate(async () => { const x = (await window.STUDYOS_ENV.load()) || { modules: [], sessions: [] }; return { mods: x.modules.map((m) => m.name), types: x.sessions.map((s) => s.type).sort() }; }))
    .toEqual({ mods: ['Diskrete Strukturen'], types: ['Tutorium', 'Vorlesung', 'Übung'] });
  await A.context.close();
});

test('Karteikarten teilen: Link erzeugen, ohne Konto öffnen und importieren', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  await openData(A.page);
  await A.page.getByRole('button', { name: 'Beispieldaten laden' }).click();
  await A.page.getByRole('button', { name: 'Aktuelle Daten ersetzen?' }).click();
  await expect.poll(() => A.page.evaluate(async () => (await window.STUDYOS_ENV.load())?.cards?.length ?? 0)).toBeGreaterThan(0);
  await login(A.page);
  const { moduleId, front, n } = await A.page.evaluate(async () => {
    const d = await window.STUDYOS_ENV.load(); const c = d.cards[0];
    return { moduleId: c.moduleId, front: c.front, n: d.cards.filter((x) => x.moduleId === c.moduleId).length };
  });
  await nav(A.page, 'Lernen').click();
  await A.page.getByRole('tab', { name: 'Karteikarten' }).click();
  await A.page.getByLabel('Modul filtern').selectOption(moduleId);
  await A.page.getByRole('button', { name: `Link erstellen (${n})` }).click();
  const link = await A.page.getByLabel('Link zum Stapel').inputValue();
  expect(link).toMatch(/\?teilen=[\w-]+#k=[\w-]+$/);
  expect([...backend.shares.values()][0].blob).not.toContain(front.slice(0, 12));

  const B = await newDevice(browser, backend);
  await B.page.goto(link.replace(/^https?:\/\/[^/]+\/?/, './'));
  await expect(B.page.getByRole('dialog', { name: 'Geteilte Karteikarten' })).toBeVisible();
  await expect(B.page.getByText(`${n} Karten`, { exact: false }).first()).toBeVisible();
  await B.page.getByRole('button', { name: `${n} Karten übernehmen` }).click();
  await expect.poll(() => B.page.evaluate(async () => (await window.STUDYOS_ENV.load())?.cards.length ?? 0)).toBe(n);
  expect(new URL(B.page.url()).search).toBe('');

  // Link löschen → nicht mehr abrufbar
  await A.page.getByRole('button', { name: 'Link löschen' }).click();
  await expect.poll(() => backend.shares.size).toBe(0);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('Moodle-Abgaben abonnieren und Fristen als Kalender-Link', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const stamp = (n, hm) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString('sv-SE').replace(/-/g, '') + 'T' + hm; };
  const ev = (uid, summary, n, course) => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:${stamp(n, '120000')}\r\nCATEGORIES:${course}\r\nEND:VEVENT\r\n`;
  const calendar = `BEGIN:VCALENDAR\r\n${ev('m1', 'Hausaufgabe 3 ist fällig', 3, 'Diskrete Strukturen')}${ev('m2', 'Hausaufgabe 4 öffnet', 4, 'Diskrete Strukturen')}${ev('m3', 'Blatt 1 ist fällig', 5, 'WiSe EIDI')}END:VCALENDAR\r\n`;
  backend.ics = () => ({ text: calendar });
  const A = await newDevice(browser, backend);
  await A.page.evaluate(async () => { await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }], sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] }); });
  await A.page.reload();
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });

  await A.page.getByLabel('Moodle-Kalender-Link').fill('https://www.moodle.tum.de/calendar/export_execute.php?userid=1&authtoken=x');
  await A.page.getByRole('button', { name: 'Abrufen', exact: true }).nth(1).click();
  await expect(A.page.getByText('2 Abgaben in 2 Kursen.', { exact: false })).toBeVisible();
  await expect(A.page.getByLabel('Modul für Diskrete Strukturen')).toHaveValue('ds');
  await A.page.getByLabel('Modul für WiSe EIDI').selectOption('__skip');
  await A.page.getByRole('button', { name: 'Abonnieren' }).click();
  await expect(A.page.getByText('Abonniert: 1 Abgabe übernommen.')).toBeVisible();
  await expect.poll(() => A.page.evaluate(async () => (await window.STUDYOS_ENV.load()).homework.map((h) => `${h.title}|${h.moduleId}|${h.dueTime}`))).toEqual([expect.stringMatching(/^Hausaufgabe 3\|ds\|\d\d:00$/)]);

  // Kalender-Link für die Fristen
  await A.page.getByRole('button', { name: 'Kalender-Link erstellen' }).click();
  await expect(A.page.getByText('Link erstellt.', { exact: false })).toBeVisible();
  const link = await A.page.getByLabel('Link für dein Kalender-Abo').inputValue();
  const token = new URL(link).searchParams.get('token');
  expect(token).toMatch(/^[\w-]{32}$/);
  const row = [...backend.push.values()][0];
  expect(row.cal_token).toBe(token);
  await expect.poll(() => [...backend.push.values()][0].deadlines.map((d) => d.title)).toContain('Hausaufgabe 3');
  await A.page.getByRole('button', { name: 'Widerrufen' }).click();
  await expect.poll(() => [...backend.push.values()][0].cal_token).toBeNull();
  expect(A.errors).toEqual([]);
  await A.context.close();
});
