/* Speichert den abgeleiteten Sync-Schlüssel (nicht exportierbarer CryptoKey) in IndexedDB.
   Die Passphrase selbst wird nirgends gespeichert. */
const DB = "studyos-keys-v1";

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("keys", mode);
    let out;
    const req = fn(tx.objectStore("keys"));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}
export const loadKey = (userId) => run("readonly", (s) => s.get(userId)).catch(() => null);
export const saveKey = (userId, k) => run("readwrite", (s) => s.put({ key: k.key, salt: k.salt, iterations: k.iterations }, userId));
export const clearKeys = () => run("readwrite", (s) => s.clear()).catch(() => {});
