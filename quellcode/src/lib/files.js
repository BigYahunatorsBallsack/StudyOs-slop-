/* Anhänge: Dateien liegen lokal in IndexedDB; mit Cloud-Sync zusätzlich verschlüsselt (AES-GCM mit dem
   Sync-Schlüssel) im privaten Supabase-Speicher. In den Daten steht nur { id, name, type, size }. */
const DB = "studyos-files-v1";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    let out;
    const req = fn(tx.objectStore("files"));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}
export const putLocal = (id, blob) => run("readwrite", (s) => s.put(blob, id));
export const getLocal = (id) => run("readonly", (s) => s.get(id)).catch(() => null);
export const removeLocal = (id) => run("readwrite", (s) => s.delete(id)).catch(() => {});

/** Verschlüsselt Bytes: 12 Byte IV + Chiffrat */
export async function sealBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
export async function openBytes(key, sealed) {
  const all = new Uint8Array(sealed);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, key, all.subarray(12)));
}

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const ACCEPT = "application/pdf,image/*,.txt,.md,.zip,.java,.py,.c,.ml,.hs,.sql";
