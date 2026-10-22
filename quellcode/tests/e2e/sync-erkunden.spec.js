import { test, expect } from '@playwright/test';

/* Sync-Wege mit mehreren simulierten Geräten, die beim Erkunden mit dem Ersatz-Backend aufgefallen sind:
   Kontowechsel auf einem Gerät, Bearbeiten eines anderswo gelöschten Eintrags, Teilen mit Datei. */
function createBackend() {
  const rows = new Map(), files = new Map(), push = new Map();
  const pushRow = (uid) => { if (!push.has(uid)) push.set(uid, { subscriptions: [], deadlines: [] }); return push.get(uid); };
  return {
    rows, files, push,
    async handle(op, ...args) {
      if (op === 'sendCode') return true;
      if (op === 'verifyCode') return args[1] === '123456';
      if (op === 'push.vapid') return 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
      if (op === 'push.saveSubscription') { const r = pushRow(args[0]); r.subscriptions = [...r.subscriptions.filter((x) => x.endpoint !== args[1].endpoint), args[1]]; return true; }
      if (op === 'push.removeSubscription') { const r = pushRow(args[0]); r.subscriptions = r.subscriptions.filter((x) => x.endpoint !== args[1]); return true; }
      if (op === 'push.saveDeadlines') { pushRow(args[0]).deadlines = args[1]; return true; }
      if (op === 'files.put') { files.set(args[0] + '/' + args[1], args[2]); return true; }
      if (op === 'files.get') return files.get(args[0] + '/' + args[1]) ?? null;
      if (op === 'files.remove') { files.delete(args[0] + '/' + args[1]); return true; }
      if (op === 'files.list') return [...files.keys()].filter((k) => k.startsWith(args[0] + '/' + args[1])).map((k) => ({ id: k.slice(args[0].length + 1), created: new Date().toISOString(), size: files.get(k).length }));
      const [uid, payload, version] = args;
      if (op === 'get') return rows.get(uid) ?? null;
      if (op === 'insert') { if (rows.has(uid)) return false; rows.set(uid, { version: 1, payload }); return true; }
      if (op === 'update') { const r = rows.get(uid); if (!r || r.version !== version) return false; rows.set(uid, { version: version + 1, payload }); return true; }
      throw new Error('unbekannte Operation ' + op);
    },
  };
}

async function newDevice(browser, backend) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'de-DE', permissions: ['notifications'] });
  /* Push-Dienst des Browsers als Attrappe (Headless-Chromium erreicht keinen echten) */
  await context.addInitScript(() => {
    let sub = null;
    if (window.PushManager) {
      PushManager.prototype.getSubscription = async function () { return sub; };
      PushManager.prototype.subscribe = async function () {
        sub = { endpoint: 'https://push.example.org/' + Math.random().toString(36).slice(2), toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BKey', auth: 'Auth' } }; }, async unsubscribe() { sub = null; return true; } };
        return sub;
      };
    }
    if (window.Notification) Notification.requestPermission = async () => 'granted';
  });
  await context.route('https://tum-dev.github.io/**', (r) => r.fulfill({ json: { days: [] } }));
  await context.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: [] }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.exposeFunction('__studyosFakeCloud', (...a) => backend.handle(...a));
  await page.goto('./');
  return { context, page, errors };
}
const nav = (page, name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
async function openData(page, group = 'Cloud') {
  await nav(page, 'Mehr').click();
  await page.getByRole('tab', { name: 'Daten & Einstellungen' }).click();
  const t = page.locator('.settings-toggle', { hasText: new RegExp('^' + group) });
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
}
async function addNote(page, title) {
  await page.goto('./?aktion=notiz');
  await page.getByLabel('Titel').fill(title);
  await page.getByRole('button', { name: 'Speichern' }).click();
}
async function login(page, mail) {
  await openData(page);
  await page.getByLabel('E-Mail-Adresse').fill(mail);
  await page.getByRole('button', { name: 'Code senden' }).click();
  await page.getByLabel('Code aus der E-Mail').fill('123456');
  await page.getByRole('button', { name: 'Anmelden' }).click();
}
async function unlock(page, pass, first) {
  await page.getByLabel('Sync-Passphrase', { exact: true }).fill(pass);
  if (first) await page.getByLabel('Sync-Passphrase wiederholen').fill(pass);
  await page.getByRole('button', { name: first ? 'Festlegen und hochladen' : 'Entsperren und synchronisieren' }).click();
  await expect(page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible({ timeout: 15000 });
}
async function signOut(page) {
  await openData(page);
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.getByRole('button', { name: 'Auf diesem Gerät abmelden?' }).click();
  await expect(page.getByRole('button', { name: 'Code senden' })).toBeVisible();
}
/* Notiz über die Suche öffnen */
async function openNote(page, q) {
  await page.getByRole('button', { name: 'Suchen (Strg + K)' }).click();
  await page.getByLabel('Suchbegriff').fill(q);
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
}
const stored = (page) => page.evaluate(() => window.STUDYOS_ENV.load());
const notes = async (page) => ((await stored(page))?.notes || []).map((n) => n.title).sort();

test('Kontowechsel auf einem Gerät: keine Vermischung, Erinnerungen des alten Kontos aus, Übernehmen auf Wunsch', async ({ browser }) => {
  test.setTimeout(90000);
  const backend = createBackend();
  // Konto Y hat schon Daten (von einem anderen Gerät)
  const Y = await newDevice(browser, backend);
  await addNote(Y.page, 'Notiz von Y');
  await login(Y.page, 'y@example.org');
  await unlock(Y.page, 'passwort-y', true);
  await expect.poll(() => backend.rows.has('u-y@example.org'), { timeout: 15000 }).toBe(true);

  // Gerät A gehört erst Konto X, mit Erinnerungen
  const A = await newDevice(browser, backend);
  await addNote(A.page, 'Geheim von X');
  await login(A.page, 'x@example.org');
  await unlock(A.page, 'passwort-x', true);
  await expect.poll(() => backend.rows.has('u-x@example.org'), { timeout: 15000 }).toBe(true);
  await openData(A.page, 'Benachrichtigungen');
  await A.page.getByRole('button', { name: 'Erinnerungen einschalten' }).click();
  await expect(A.page.getByText('Erinnerungen sind auf diesem Gerät eingeschaltet.')).toBeVisible();
  expect(backend.push.get('u-x@example.org').subscriptions).toHaveLength(1);

  // Abmelden: Daten bleiben, aber X schickt keine Erinnerungen mehr an dieses Gerät
  await signOut(A.page);
  expect(await notes(A.page)).toEqual(['Geheim von X']);
  expect(backend.push.get('u-x@example.org').subscriptions).toHaveLength(0);

  // Mit Y anmelden: Hinweis, X-Daten werden ersetzt statt in Y hochgeladen
  await A.page.getByLabel('E-Mail-Adresse').fill('y@example.org');
  await A.page.getByRole('button', { name: 'Code senden' }).click();
  await A.page.getByLabel('Code aus der E-Mail').fill('123456');
  await A.page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(A.page.getByText(/Die Daten auf diesem Gerät gehören zu x@example\.org/)).toBeVisible();
  await unlock(A.page, 'passwort-y', false);
  await expect.poll(() => notes(A.page), { timeout: 15000 }).toEqual(['Notiz von Y']);
  await openData(Y.page);
  await Y.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await Y.page.waitForTimeout(1500);
  expect(await notes(Y.page)).toEqual(['Notiz von Y']);
  // der alte Stand liegt als Wiederherstellungspunkt bereit
  expect((await A.page.evaluate(() => window.STUDYOS_ENV.listSnapshots())).map((x) => x.label)).toContain('Vor dem Kontowechsel (x@example.org)');

  // Zurück zu X, diesmal ausdrücklich übernehmen: dann wird zusammengeführt
  await signOut(A.page);
  await login(A.page, 'x@example.org');
  await expect(A.page.getByText(/Die Daten auf diesem Gerät gehören zu y@example\.org/)).toBeVisible();
  await A.page.getByLabel('Stattdessen die Daten dieses Geräts übernehmen').check();
  await unlock(A.page, 'passwort-x', false);
  await expect.poll(() => notes(A.page), { timeout: 15000 }).toEqual(['Geheim von X', 'Notiz von Y']);
  expect(A.errors).toEqual([]); expect(Y.errors).toEqual([]);
  await A.context.close(); await Y.context.close();
});

test('Auf einem Gerät gelöscht, auf dem anderen noch bearbeitet: die Änderung geht nicht verloren', async ({ browser }) => {
  test.setTimeout(90000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  await addNote(A.page, 'Graphen');
  await login(A.page, 'waltuh@example.org');
  await unlock(A.page, 'mein-sync-pw', true);
  await expect.poll(() => backend.rows.size, { timeout: 15000 }).toBe(1);
  const B = await newDevice(browser, backend);
  await login(B.page, 'waltuh@example.org');
  await unlock(B.page, 'mein-sync-pw', false);
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toEqual(['Graphen']);
  const edit = async (page) => {
    await openNote(page, 'Graphen');
    await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
  };
  // B öffnet die Notiz zum Bearbeiten und tippt
  await edit(B.page);
  await B.page.getByLabel('Titel').fill('Graphen und Bäume');
  // A löscht sie; die Löschung kommt bei B an, während das Formular offen ist
  await edit(A.page);
  await A.page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await A.page.getByRole('button', { name: 'Wirklich löschen?' }).click();
  await expect.poll(async () => { const v = backend.rows.values().next().value.version; return v; }, { timeout: 15000 }).toBeGreaterThan(1);
  await B.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => notes(B.page), { timeout: 15000 }).toEqual([]);
  // B speichert: die Notiz ist mit B's Änderung wieder da, auch auf A
  await B.page.getByRole('button', { name: 'Speichern' }).click();
  await expect(B.page.getByText(/war auf einem anderen Gerät gelöscht und ist mit deiner Änderung wieder da/)).toBeVisible();
  await expect.poll(() => notes(B.page)).toEqual(['Graphen und Bäume']);
  await expect.poll(async () => { const v = backend.rows.values().next().value.version; return v; }, { timeout: 15000 }).toBeGreaterThan(2);
  await openData(A.page);
  await A.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect.poll(() => notes(A.page), { timeout: 15000 }).toEqual(['Graphen und Bäume']);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('Teilen-Ziel mit Datei bei eingerichtetem Sync: Anhang landet verschlüsselt in der Cloud, das andere Gerät lädt ihn', async ({ browser }) => {
  test.setTimeout(90000);
  const backend = createBackend();
  const A = await newDevice(browser, backend);
  await login(A.page, 'waltuh@example.org');
  await unlock(A.page, 'mein-sync-pw', true);
  await A.page.evaluate(() => navigator.serviceWorker.ready);
  await A.page.reload(); // jetzt steuert der Service Worker die Seite
  await A.page.evaluate(async () => {
    const fd = new FormData();
    fd.append('title', 'Foto Tafel');
    fd.append('files', new File(['GEHEIMES TAFELBILD'], 'tafel.jpg', { type: 'image/jpeg' }));
    await fetch('./teilen-ziel', { method: 'POST', body: fd });
  });
  await A.page.goto('./?aktion=geteilt');
  await expect(A.page.getByText('Als Notiz mit 1 Anhang gespeichert.')).toBeVisible();
  await expect.poll(async () => (await stored(A.page))?.notes?.[0]?.files?.[0]?.cloud, { timeout: 15000 }).toBe(true);
  const id = (await stored(A.page)).notes[0].files[0].id;
  const sealed = backend.files.get('u-waltuh@example.org/' + id);
  expect(Buffer.from(sealed).toString('utf8')).not.toContain('GEHEIM');

  const B = await newDevice(browser, backend);
  await login(B.page, 'waltuh@example.org');
  await unlock(B.page, 'mein-sync-pw', false);
  /* „in der Cloud“ kommt mit dem nächsten (entprellten) Abgleich von A: B gleicht ab, bis es da ist */
  await expect.poll(async () => {
    await B.page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
    return (await stored(B.page))?.notes?.[0]?.files?.[0]?.cloud ?? false;
  }, { timeout: 20000, intervals: [1000] }).toBe(true);
  await openNote(B.page, 'Foto Tafel');
  const dlg = B.page.getByRole('dialog');
  await expect(dlg.getByText(/in der Cloud/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Laden' }).click();
  await expect(dlg.getByRole('link', { name: 'tafel.jpg' })).toBeVisible();
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});
