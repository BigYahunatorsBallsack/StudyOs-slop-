const DB_NAME = 'studyos-local-v1';
const DB_VERSION = 1;
const RECOVERY_KEY = 'studyos-emergency-copy-v1';
const SNAPSHOT_KEY = 'studyos-snapshots-v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('studyos-sync-v1') : null;
let dbPromise = null;
let storageMode = 'idb';
let installPrompt = null;
let updateWorker = null;
const updateCallbacks = new Set();
const installCallbacks = new Set();
const externalCallbacks = new Set();
let swRegistration = null;
let applyReload = false;

function openDb() {
  if (dbPromise) return dbPromise;
  const attempt = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB ist nicht verfügbar')); return; }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Zeitüberschreitung beim Öffnen der lokalen Datenbank')), 4000);
    let request;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (err) { finish(reject, err); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('app')) db.createObjectStore('app', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      db.onversionchange = () => { db.close(); dbPromise = null; };
      finish(resolve, db);
    };
    request.onerror = () => finish(reject, request.error || new Error('Datenbank konnte nicht geöffnet werden'));
    request.onblocked = () => finish(reject, new Error('Datenbank-Update blockiert. Bitte andere StudyOS-Tabs schließen.'));
  });
  dbPromise = attempt.catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

function txRequest(db, store, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(store, mode); }
    catch (err) { reject(err); return; }
    let req, result;
    try { req = action(tx.objectStore(store)); }
    catch (err) { reject(err); return; }
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error || new Error('Datenbankzugriff fehlgeschlagen'));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Datenbank-Transaktion fehlgeschlagen'));
    tx.onabort = () => reject(tx.error || new Error('Datenbank-Transaktion abgebrochen'));
  });
}

function localRead() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.payload && parsed.updated) return parsed;
    return parsed ? { id: 'current', updated: '1970-01-01T00:00:00.000Z', payload: parsed } : null;
  } catch { return null; }
}
let mirrorOk = true; /* false, wenn der localStorage-Spiegel (ca. 5 MB) voll ist */
function localWrite(row) {
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(row)); mirrorOk = true; return true; }
  catch { mirrorOk = false; return false; }
}
async function storageInfo() {
  let usage = null, quota = null, persisted = null;
  try { if (navigator.storage && navigator.storage.estimate) ({ usage, quota } = await navigator.storage.estimate()); } catch {}
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch {}
  return { mode: storageMode, mirrorOk, usage, quota, persisted };
}
function localSnapshotsRead() {
  try { const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function localSnapshotsWrite(items) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(items.slice(0, 8))); return true; }
  catch { return false; }
}
function mergeSnapshotLocal(item) {
  const items = localSnapshotsRead().filter((x) => x.id !== item.id);
  items.push(item);
  items.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  localSnapshotsWrite(items.slice(0, 8));
}
function pruneDbSnapshots(db, items) {
  const sorted = items.slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return Promise.all(sorted.slice(8).map((x) => txRequest(db, 'snapshots', 'readwrite', (s) => s.delete(x.id))));
}

async function snapshot(label, payload, fixedId) {
  const item = { id: fixedId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, created: new Date().toISOString(), payload };
  mergeSnapshotLocal(item);
  try {
    const db = await openDb();
    await txRequest(db, 'snapshots', 'readwrite', (s) => s.put(item));
    const all = await txRequest(db, 'snapshots', 'readonly', (s) => s.getAll());
    await pruneDbSnapshots(db, all);
  } catch { /* local snapshot is the fallback */ }
  return true;
}

async function load() {
  const mirror = localRead();
  try {
    const db = await openDb();
    const row = await txRequest(db, 'app', 'readonly', (s) => s.get('current'));
    if (mirror && (!row || String(mirror.updated) > String(row.updated || ''))) {
      storageMode = 'local';
      try { await txRequest(db, 'app', 'readwrite', (s) => s.put({ id: 'current', updated: mirror.updated, payload: mirror.payload })); storageMode = 'idb'; }
      catch { storageMode = 'local'; }
      return mirror.payload;
    }
    if (row && row.payload) {
      storageMode = 'idb';
      localWrite(row);
      return row.payload;
    }
    if (mirror) {
      storageMode = 'local';
      try { await txRequest(db, 'app', 'readwrite', (s) => s.put({ id: 'current', updated: mirror.updated, payload: mirror.payload })); storageMode = 'idb'; }
      catch { storageMode = 'local'; }
      return mirror.payload;
    }
    storageMode = 'idb';
    return null;
  } catch (err) {
    if (mirror) { storageMode = 'local'; return mirror.payload; }
    storageMode = 'local';
    throw err;
  }
}

/* Lokales Datum eines Zeitstempels: Speicherstände werden in UTC abgelegt, der Tageswechsel gilt aber nach Gerätezeit */
function localDay(ts) {
  const d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) return String(ts || '').slice(0, 10);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function maybeDailySnapshot(db, previous) {
  if (!previous || !previous.payload || !previous.updated) return;
  const oldDate = localDay(previous.updated);
  const today = localDay();
  if (!oldDate || oldDate === today) return;
  const id = `daily-${oldDate}`;
  const local = localSnapshotsRead();
  if (local.some((x) => x.id === id)) return;
  try {
    const exists = await txRequest(db, 'snapshots', 'readonly', (s) => s.get(id));
    if (exists) return;
  } catch { /* continue with local snapshot */ }
  await snapshot(`Automatische Sicherung ${oldDate}`, previous.payload, id);
}

async function save(payload) {
  const row = { id: 'current', updated: new Date().toISOString(), payload };
  const mirrorOk = localWrite(row);
  try {
    const db = await openDb();
    let previous = null;
    try { previous = await txRequest(db, 'app', 'readonly', (s) => s.get('current')); } catch {}
    if (previous && localDay(previous.updated) !== localDay(row.updated)) {
      try { await maybeDailySnapshot(db, previous); } catch { /* snapshots must not block saves */ }
    }
    await txRequest(db, 'app', 'readwrite', (s) => s.put(row));
    storageMode = 'idb';
    localWrite(row);
    if (channel) channel.postMessage({ type: 'saved', updated: row.updated });
    return true;
  } catch (err) {
    if (mirrorOk) {
      storageMode = 'local';
      if (channel) channel.postMessage({ type: 'saved', updated: row.updated });
      return true;
    }
    throw err;
  }
}

function saveSync(payload) {
  const row = { id: 'current', updated: new Date().toISOString(), payload };
  localWrite(row);
}

async function listSnapshots() {
  let all = localSnapshotsRead();
  try {
    const db = await openDb();
    const fromDb = await txRequest(db, 'snapshots', 'readonly', (s) => s.getAll());
    const merged = new Map(all.map((x) => [x.id, x]));
    fromDb.forEach((x) => merged.set(x.id, x));
    all = Array.from(merged.values());
    all.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    await pruneDbSnapshots(db, all);
    localSnapshotsWrite(all.slice(0, 8));
  } catch { /* local fallback */ }
  return all.sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 8).map(({ id, label, created }) => ({ id, label, created }));
}
async function loadSnapshot(id) {
  try {
    const db = await openDb();
    const item = await txRequest(db, 'snapshots', 'readonly', (s) => s.get(id));
    if (item) return item;
  } catch { /* try the local mirror */ }
  return localSnapshotsRead().find((x) => x.id === id) || null;
}

function onExternalChange(fn) { externalCallbacks.add(fn); return () => externalCallbacks.delete(fn); }
async function reloadExternal() {
  try { const value = await load(); if (value) externalCallbacks.forEach((fn) => fn(value)); }
  catch { /* the active tab keeps its current data */ }
}
if (channel) channel.onmessage = (e) => { if (e.data && e.data.type === 'saved') reloadExternal(); };

function isInstalled() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installPrompt = e; installCallbacks.forEach((fn) => fn(true));
});
window.addEventListener('appinstalled', () => { installPrompt = null; installCallbacks.forEach((fn) => fn(false)); });
async function install() {
  if (!installPrompt) return false;
  const prompt = installPrompt; installPrompt = null;
  await prompt.prompt();
  const result = await prompt.userChoice;
  installCallbacks.forEach((fn) => fn(false));
  return result && result.outcome === 'accepted';
}
function onInstallable(fn) { installCallbacks.add(fn); fn(!!installPrompt); return () => installCallbacks.delete(fn); }
function onUpdate(fn) { updateCallbacks.add(fn); if (updateWorker) fn(); return () => updateCallbacks.delete(fn); }
function announceUpdate(worker) { updateWorker = worker; updateCallbacks.forEach((fn) => fn()); }
async function applyUpdate() {
  if (updateWorker) { applyReload = true; updateWorker.postMessage({ type: 'SKIP_WAITING' }); }
}
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    if (swRegistration.waiting && navigator.serviceWorker.controller) announceUpdate(swRegistration.waiting);
    swRegistration.addEventListener('updatefound', () => {
      const worker = swRegistration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate(worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applyReload) window.location.reload();
    });
  } catch (e) { console.warn('StudyOS offline cache could not be installed:', e); }
}
async function requestPersistentStorage() {
  if (!isInstalled() || !navigator.storage || !navigator.storage.persist) return;
  try { await navigator.storage.persist(); } catch { /* browser may decline persistent storage */ }
}
export function startRuntime() {
  registerSW();
  requestPersistentStorage();
}

const runtimeApi = {
  load,
  save,
  saveSync,
  snapshot,
  listSnapshots,
  loadSnapshot,
  onExternalChange,
  storageInfo,
  pwa: { isInstalled, isInstallable: () => !!installPrompt, onInstallable, install, onUpdate, applyUpdate },
};
if (typeof window !== 'undefined') window.STUDYOS_ENV = runtimeApi;
