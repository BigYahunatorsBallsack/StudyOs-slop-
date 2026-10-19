import { test, expect } from '@playwright/test';

/* Cloud-Sync mit zwei simulierten Geräten. Das Backend liegt im Testprozess und verhält sich wie
   die Supabase-Tabelle (eine Zeile pro Nutzer, Versionsnummer für Konflikterkennung). */
function createBackend() {
  const rows = new Map();
  const push = new Map(); /* user → { subscriptions, deadlines, tz } */
  const pushRow = (uid) => { if (!push.has(uid)) push.set(uid, { subscriptions: [], deadlines: [], tz: '' }); return push.get(uid); };
  return {
    rows, push, tests: 0, shares: new Map(), files: new Map(),
    async handle(op, ...args) {
      if (op === 'sendCode') return true;
      if (op === 'push.vapid') return 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
      if (op === 'push.saveSubscription') { const r = pushRow(args[0]); r.subscriptions = [...r.subscriptions.filter((x) => x.endpoint !== args[1].endpoint), args[1]]; r.tz = args[2]; return true; }
      if (op === 'push.removeSubscription') { const r = pushRow(args[0]); r.subscriptions = r.subscriptions.filter((x) => x.endpoint !== args[1]); return true; }
      if (op === 'push.saveDeadlines') { const r = pushRow(args[0]); r.deadlines = args[1]; r.tz = args[2]; return true; }
      if (op === 'mvg') return this.mvg ? this.mvg(args[1]) : [];
      if (op === 'drive') return this.drive ? this.drive(args[1]) : { error: 'kein Schlüssel' };
      if (op === 'files.put') { this.files.set(args[0] + '/' + args[1], args[2]); return true; }
      if (op === 'files.get') return this.files.get(args[0] + '/' + args[1]) ?? null;
      if (op === 'files.remove') { this.files.delete(args[0] + '/' + args[1]); return true; }
      if (op === 'files.list') return [...this.files.entries()].filter(([k]) => k.startsWith(args[0] + '/' + args[1])).map(([k, v]) => ({ id: k.slice(args[0].length + 1), created: new Date().toISOString(), size: v.length })).sort((a, b) => b.id.localeCompare(a.id));
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

test('Bus 230: Empfehlung für die erste Vorlesung; Anhänge verschlüsselt in der Cloud', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  backend.mvg = (body) => {
    if (body.kind === 'stations') return [{ id: 'de:09184:2222', name: 'Haar, Gymnasium', place: 'Haar (b München)', types: ['BUS'] }];
    if (body.kind === 'messages') return [{ title: 'Weichenstörung bei Haar', text: 'Unregelmäßige Abstände.', incident: true, from: 0, to: null, lines: ['S6'] }];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const t = (d, hm) => base.getTime() + d * 86400000 + (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))) * 60000;
    if (body.station === 'de:09175:4020') return [0, 1].flatMap((d) => ['07:32', '07:52', '08:12'].flatMap((hm) => [
      { line: 'S6', destination: 'Leuchtenbergring', type: 'SBAHN', planned: t(d, hm), time: t(d, hm), delay: 0, realtime: true, cancelled: false, platform: '5' },
      { line: 'S6', destination: 'Grafing-Bahnhof', type: 'SBAHN', planned: t(d, hm) + 60000, time: t(d, hm) + 60000, delay: 0, realtime: true, cancelled: false, platform: '4' }]));
    return [0, 1].flatMap((d) => ['07:53', '08:13', '08:33', '09:13'].map((hm) => ({ line: '230', destination: 'Garching, Forschungszentrum (U)', type: 'REGIONAL_BUS', planned: t(d, hm), time: t(d, hm) + (hm === '08:13' ? 120000 : 0), delay: hm === '08:13' ? 2 : 0, realtime: true, cancelled: false })))
      .concat([{ line: '241', destination: 'Taufkirchen', type: 'REGIONAL_BUS', planned: Date.now() + 600000, time: Date.now() + 600000, delay: 0, realtime: true, cancelled: false }]);
  };
  const A = await newDevice(browser, backend);
  await A.page.evaluate(async () => {
    const d = new Date(); d.setDate(d.getDate() + 1); const tomorrow = d.toLocaleDateString('sv-SE');
    await window.STUDYOS_ENV.save({ version: 3, settings: { university: 'TUM', mensa: '' }, meta: {}, modules: [{ id: 'ds', name: 'Diskrete Strukturen', ects: 8, semester: 1, status: 'belegt', color: '#34d399' }],
      sessions: [{ id: 's', moduleId: 'ds', type: 'Vorlesung', date: tomorrow, start: '09:15', end: '10:45', room: 'MI HS 1' }], homework: [{ id: 'h', moduleId: 'ds', title: 'Blatt 3', due: tomorrow, status: 'ausgegeben' }], topics: [], logs: [], notes: [], cards: [], exams: [] });
  });
  await A.page.reload();
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });

  // Haltestelle ändern über die Suche
  await A.page.getByLabel('Umstieg suchen').fill('Haar Gym');
  await A.page.getByRole('button', { name: 'Suchen', exact: true }).nth(1).click();
  await A.page.getByRole('button', { name: 'Haar, Gymnasium, Haar (b München)' }).click();
  await expect(A.page.getByText('Umstieg: Haar, Gymnasium')).toBeVisible();

  await nav(A.page, 'Heute').click();
  const card = A.page.getByRole('region', { name: 'Weg zur Uni' });
  // 9:15 − 10 Puffer − 50 Fahrt: Bus 8:13 (+2, real 8:15); S6 spätestens 8:03 (8 Fahrt + 4 Umstieg) → 7:52; los 7:47
  await expect(card.getByText(/morgen um 09:15: um 07:47 losgehen/)).toBeVisible();
  await expect(card.getByText('07:52 Abfahrt mit der S6 in Zorneding, Gleis 5')).toBeVisible();
  await expect(card.getByText('08:00 Ankunft in Haar, Gymnasium, dort umsteigen')).toBeVisible();
  await expect(card.getByText('08:15 Abfahrt mit dem Bus 230 in Haar, Gymnasium (2 Min. später)')).toBeVisible();
  await expect(card.getByText('Grafing')).toHaveCount(0);
  await expect(card.getByText('241')).toHaveCount(0);
  await expect(card.getByRole('list', { name: 'Störungen und Baustellen' }).getByText('Weichenstörung bei Haar')).toBeVisible();

  // Umschalten aufs Auto: Fahrzeit mit Verkehr; 9:15 − 10 Puffer − 10 Parken − 47 Fahrt = 8:08 losfahren
  const asked = [];
  backend.drive = (body) => { asked.push(body); return { minutes: 47, normal: 36, km: 38.4, provider: 'google' }; };
  await card.getByRole('tab', { name: 'Auto' }).click();
  await expect(card.getByText(/47 Min\. mit dem Auto \(38,4 km\), 11 Min\. Verzögerung durch Verkehr/)).toBeVisible();
  await expect(card.getByText(/08:08 losfahren in Zorneding, damit du morgen um 09:15 bei Diskrete Strukturen bist/)).toBeVisible();
  await expect(card.getByRole('link', { name: /Route in Google Maps öffnen/ })).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&origin=Zorneding&destination=Boltzmannstra/);
  expect(asked[0]).toEqual({ from: 'Zorneding', to: 'Boltzmannstraße 15, 85748 Garching bei München' });
  await expect(card.getByText('Weichenstörung bei Haar')).toHaveCount(0);
  await card.getByRole('tab', { name: 'Öffis' }).click();
  await expect(card.getByText(/morgen um 09:15: um 07:47 losgehen/)).toBeVisible();

  // Anhang: verschlüsselt hochgeladen
  await nav(A.page, 'Mehr').click();
  await A.page.getByRole('tab', { name: 'Alle Hausaufgaben' }).click();
  await A.page.getByText('Blatt 3').first().click();
  const dlg = A.page.getByRole('dialog', { name: /bearbeiten/ });
  await dlg.getByLabel('Datei anhängen').setInputFiles({ name: 'loesung.txt', mimeType: 'text/plain', buffer: Buffer.from('GEHEIMER INHALT 42') });
  await expect(dlg.getByText(/in der Cloud/)).toBeVisible();
  const stored = [...backend.files.values()][0];
  expect(stored.length).toBeGreaterThan(18 + 12);
  expect(Buffer.from(stored).toString('utf8')).not.toContain('GEHEIM');
  expect(A.errors).toEqual([]);
  await A.context.close();
});

test('Artemis: Abo auch ohne Abgaben, übernimmt sie später automatisch', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const stamp = (n, hm) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString('sv-SE').replace(/-/g, '') + 'T' + hm; };
  const ev = (uid, summary, n) => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:${stamp(n, '100000')}\r\nDTEND:${stamp(n, '113000')}\r\nEND:VEVENT\r\n`;
  let calendar = `BEGIN:VCALENDAR\r\n${ev('l1', 'EIDI Lecture | Einführung', 1)}${ev('l2', 'EIDI Lecture | Rekursion', 8)}END:VCALENDAR\r\n`;
  backend.ics = () => ({ text: calendar });
  const A = await newDevice(browser, backend);
  await A.page.evaluate(async () => { await window.STUDYOS_ENV.save({ version: 3, settings: {}, meta: {}, modules: [{ id: 'eidi', name: 'Einführung in die Informatik', ects: 12, semester: 1, status: 'belegt', color: '#38bdf8' }], sessions: [], homework: [], topics: [], logs: [], notes: [], cards: [], exams: [] }); });
  await A.page.reload();
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  await expect(A.page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });
  await A.page.getByLabel('Artemis-Kalender-Link').fill('https://artemis.tum.de/api/calendar/courses/621/calendar-events-ics?token=abc');
  await A.page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(A.page.getByText('Noch keine Abgabefristen im Kalender (nur 2 Vorlesungen).', { exact: false })).toBeVisible();
  await A.page.getByLabel('Modul für den Artemis-Kurs').selectOption('eidi');
  await A.page.getByRole('button', { name: 'Abonnieren' }).click();
  await expect(A.page.getByText('Abonniert: 0 Abgaben übernommen.')).toBeVisible();
  // später erscheinen Aufgaben im Kalender
  calendar = calendar.replace('END:VCALENDAR', ev('e1', 'EIDI Exercise | Release: W01H01', 2) + ev('e2', 'EIDI Exercise | Due: W01H01 - Hello World', 9) + 'END:VCALENDAR');
  await A.page.getByRole('button', { name: 'Alle jetzt abrufen' }).click();
  await expect(A.page.getByText('Abgerufen: 1 neu, 0 geändert.')).toBeVisible();
  await expect.poll(() => A.page.evaluate(async () => (await window.STUDYOS_ENV.load()).homework.map((h) => `${h.title}|${h.moduleId}`))).toEqual(['W01H01 - Hello World|eidi']);
  expect(A.errors).toEqual([]);
  await A.context.close();
});

test('Konflikt: Änderung von einem anderen Gerät überschrieben, „Meine behalten“ stellt sie wieder her', async ({ browser }) => {
  test.setTimeout(90000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  const B = await newDevice(browser, backend);
  const unlock = async (page, first) => {
    await page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
    if (first) await page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
    await page.getByRole('button', { name: first ? 'Festlegen und hochladen' : 'Entsperren und synchronisieren' }).click();
    await expect(page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });
  };
  const rename = async (page, from, to) => {
    await page.getByRole('button', { name: 'Suchen (Strg + K)' }).click();
    await page.getByPlaceholder(/Module, Hausaufgaben/).fill(from);
    await page.getByRole('option', { name: new RegExp(from) }).click();
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Titel').fill(to);
    await page.getByRole('button', { name: 'Speichern' }).click();
  };
  await addNote(A.page, 'Gemeinsame Notiz');
  await login(A.page); await unlock(A.page, true);
  await login(B.page); await unlock(B.page, false);
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toEqual(['Gemeinsame Notiz']);
  // A synchronisiert einmal (merkt sich den Stand) und geht dann offline
  await openData(A.page);
  await A.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect(A.page.getByText('Synchronisiert', { exact: true })).toBeVisible();
  await A.context.setOffline(true);
  await rename(A.page, 'Gemeinsame Notiz', 'Fassung von A');
  await A.page.waitForTimeout(500);
  await rename(B.page, 'Gemeinsame Notiz', 'Fassung von B');
  await openData(B.page);
  await B.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect(B.page.getByText('Synchronisiert', { exact: true })).toBeVisible();
  // A wieder online: B's jüngere Fassung gewinnt, A bekommt den Hinweis
  await A.context.setOffline(false);
  await A.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect(A.page.getByText('Von einem anderen Gerät überschrieben: „Fassung von A“.')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => notes(A.page)).toEqual(['Fassung von B']);
  const before = [...backend.rows.values()][0].version;
  await A.page.getByRole('button', { name: 'Meine behalten' }).click();
  await expect.poll(() => notes(A.page)).toEqual(['Fassung von A']);
  await expect.poll(() => [...backend.rows.values()][0].version, { timeout: 15000 }).toBeGreaterThan(before); // A lädt hoch
  await B.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toEqual(['Fassung von A']);
  expect(A.errors).toEqual([]);
  expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('Cloud-Sicherung: wöchentlich verschlüsselt, Wiederherstellen holt Gelöschtes zurück', async ({ browser }) => {
  test.setTimeout(60000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  await addNote(A.page, 'Wichtige Notiz');
  await login(A.page);
  await A.page.getByLabel('Sync-Passphrase', { exact: true }).fill('mein-sync-pw');
  await A.page.getByLabel('Sync-Passphrase wiederholen').fill('mein-sync-pw');
  await A.page.getByRole('button', { name: 'Festlegen und hochladen' }).click();
  // Nach dem ersten Sync automatisch gesichert, verschlüsselt
  await expect.poll(() => [...backend.files.keys()].filter((k) => k.includes('/sicherung-')).length, { timeout: 15000 }).toBe(1);
  const blob = Buffer.from([...backend.files.entries()].find(([k]) => k.includes('/sicherung-'))[1]).toString('utf8');
  expect(blob).not.toContain('Wichtige Notiz');
  const list = A.page.getByRole('list', { name: 'Cloud-Sicherungen' });
  await expect(list.getByText(/^KW \d+\/\d{4}/)).toHaveCount(1);

  // Notiz löschen (auf allen Geräten), dann aus der Sicherung wiederherstellen
  await A.page.getByRole('button', { name: 'Suchen (Strg + K)' }).click();
  await A.page.getByPlaceholder(/Module, Hausaufgaben/).fill('Wichtige');
  await A.page.getByRole('option', { name: /Wichtige Notiz/ }).click();
  await A.page.getByRole('button', { name: 'Bearbeiten' }).click();
  const dlg = A.page.getByRole('dialog', { name: /bearbeiten/ });
  await dlg.getByRole('button', { name: 'Löschen', exact: true }).click();
  await dlg.getByRole('button', { name: 'Wirklich löschen?' }).click();
  await expect.poll(() => notes(A.page)).toEqual([]);
  await openData(A.page);
  await list.getByRole('button', { name: 'Wiederherstellen' }).click();
  await list.getByRole('button', { name: /Stand aus KW \d+ laden\?/ }).click();
  await expect(A.page.getByText(/wiederhergestellt/)).toBeVisible();
  await expect.poll(() => notes(A.page)).toEqual(['Wichtige Notiz']);
  expect(A.errors).toEqual([]);
  await A.context.close();
});
