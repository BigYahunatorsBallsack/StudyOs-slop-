/* Teilen-Ziel: Andere Apps teilen Text, Links, PDFs oder Fotos an StudyOS (Android, Desktop-Chrome).
   Der Service Worker legt die Dateien in IndexedDB (wie Anhänge) und das Übrige im Cache „studyos-share-inbox“ ab;
   die App macht daraus beim Öffnen von ?aktion=geteilt eine Notiz. */
export const INBOX_CACHE = "studyos-share-inbox";
export const INBOX_URL = "./geteilt.json";

/** Notiz aus einer geteilten Nachricht { title, text, url, files: [{ id, name, type, size }] } */
export function sharedNote(msg, today) {
  const text = String(msg.text || "").trim(), url = String(msg.url || "").trim();
  const firstLine = text.split("\n")[0].trim();
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch { host = ""; }
  const files = (msg.files || []).filter((f) => f && f.id).map((f) => ({ id: String(f.id), name: String(f.name || "Datei").slice(0, 120), type: String(f.type || "application/octet-stream"), size: Number(f.size) || 0, added: today, cloud: false }));
  const title = (String(msg.title || "").trim() || (firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77) + "…") || host || files[0]?.name || "Geteilt").slice(0, 120);
  const body = [text && text !== title ? text : "", url && !text.includes(url) ? url : ""].filter(Boolean).join("\n\n");
  return { moduleId: "", sessionId: "", title, text: body, files };
}

/** Liest die zuletzt geteilte Nachricht und entfernt sie (null, wenn nichts da ist) */
export async function takeShared() {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(INBOX_CACHE);
    const res = await cache.match(INBOX_URL);
    if (!res) return null;
    await cache.delete(INBOX_URL);
    return await res.json();
  } catch { return null; }
}
