/* Anhänge: Dateien liegen lokal in IndexedDB; mit Cloud-Sync zusätzlich verschlüsselt (AES-GCM mit dem
   Sync-Schlüssel) im privaten Supabase-Speicher. In den Daten steht nur { id, name, type, size }. */
import { iso, uid } from "./util.js";

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

/** Datei lokal (und mit Cloud-Sync verschlüsselt in der Cloud) ablegen; gibt die Angaben für „files“ zurück. */
export async function storeFile(file, cloud, name = file.name) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`Höchstens ${fmtSize(MAX_FILE_BYTES)} pro Datei.`);
  const id = uid() + uid();
  const meta = { id, name: String(name || "Datei").slice(0, 120), type: file.type || "application/octet-stream", size: file.size, added: iso() };
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putLocal(id, new Blob([bytes], { type: meta.type }));
  let cloudOk = false, cloudErr = "";
  if (cloud?.canFiles?.()) {
    try { await cloud.uploadFile(id, bytes); cloudOk = true; } catch (e) { cloudErr = e.message; }
  }
  return { meta: { ...meta, cloud: cloudOk }, cloudErr };
}

/* Bilder aus Anhängen in Notizen/Karten: lokal, sonst (mit Cloud-Sync) nachladen. Die App setzt den Abruf. */
let remote = null;
export const setRemoteFiles = (fn) => { remote = fn; };
const urlCache = new Map();
export async function fileUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  let blob = await getLocal(id);
  if (!blob && remote) {
    try { const bytes = await remote(id); if (bytes) { blob = new Blob([bytes]); await putLocal(id, blob).catch(() => {}); } } catch { /* nicht erreichbar */ }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/** Bilddateien aus Zwischenablage oder Drag&Drop */
export const imageFiles = (dt) => [...(dt?.files || [])].filter((f) => f.type.startsWith("image/"));
/** Name für ein eingefügtes Bild ohne eigenen Namen („image.png“) */
export const pastedName = (f, now = new Date()) => {
  if (f.name && !/^image\.\w+$/i.test(f.name)) return f.name;
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/\+.*/, "");
  const p = (n) => String(n).padStart(2, "0");
  return `Bild ${p(now.getDate())}.${p(now.getMonth() + 1)}. ${p(now.getHours())}-${p(now.getMinutes())}.${ext}`;
};
/** Markdown für ein Bild aus den Anhängen */
export const imageMd = (meta) => `![${meta.name.replace(/[[\]]/g, "")}](att:${meta.id})`;

export const fmtSize =(n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const ACCEPT = "application/pdf,image/*,.txt,.md,.zip,.java,.py,.c,.ml,.hs,.sql";
