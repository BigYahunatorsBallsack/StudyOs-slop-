/* Aufräumen (Einstellungen): doppelte Termine und Karteikarten, leere Notizen, verwaiste Anhänge.
   Gelöscht wird über den Papierkorb (siehe trash.js); Verweise auf entfernte Doppel zeigen danach auf den behaltenen Eintrag. */
import { COLLS } from "./constants.js";
import { isOcc } from "./occlusion.js";

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

/* Doppel nach `keyOf` gruppieren; behalten wird der Eintrag mit der höchsten `score`, bei Gleichstand der erste. */
function duplicates(list, keyOf, score) {
  const by = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (k === null) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(x);
  }
  const out = [];
  for (const [key, items] of by) {
    if (items.length < 2) continue;
    let keep = items[0];
    for (const x of items) if (score(x) > score(keep)) keep = x;
    out.push({ key, keep, remove: items.filter((x) => x !== keep) });
  }
  return out;
}

/** Doppelte Termine: gleiches Modul, Datum, Beginn und Art. Behalten wird der bearbeitete (besucht, Notiz …). */
export function duplicateSessions(data) {
  const notes = new Set((data.notes || []).map((n) => n.sessionId).filter(Boolean));
  const logs = new Set((data.logs || []).map((l) => l.sessionId).filter(Boolean));
  const score = (s) => (s.attended ? 4 : 0) + (s.reviewed ? 2 : 0) + (s.prepared ? 1 : 0) + (notes.has(s.id) ? 4 : 0) + (logs.has(s.id) ? 2 : 0) + (s.feedKey ? 0.5 : 0) - (s.cancelled ? 0.25 : 0);
  return duplicates(data.sessions || [], (s) => (s.date && s.start ? [s.moduleId || "", s.date, s.start, norm(s.type)].join("|") : null), score);
}

/** Doppelte Karteikarten: gleiche Vorder- und Rückseite im selben Modul (Bildkarten zählen nicht). Behalten wird die meistgelernte. */
export function duplicateCards(data) {
  const score = (c) => (Number(c.reps) || 0) + (Number(c.reviews?.length) || 0) / 1000 + (c.lastReview ? 0.0001 : 0);
  return duplicates(data.cards || [], (c) => (isOcc(c) || !norm(c.front) ? null : [c.moduleId || "", norm(c.front), norm(c.back)].join("|")), score);
}

/** Leere Notizen: kein Titel, kein Text, keine Anhänge */
export const emptyNotes = (data) => (data.notes || []).filter((n) => !norm(n.title) && !norm(n.text) && !(n.files || []).length);

const ATT = /\(att:([\w-]+)\)/g;
/* Anhänge eines Eintrags: Dateiliste, Bild einer Bildkarte und eingebettete Bilder ![…](att:ID) in Texten */
function collectFiles(x, out) {
  if (!x || typeof x !== "object") return;
  for (const f of Array.isArray(x.files) ? x.files : []) if (f && f.id) out.add(String(f.id));
  if (x.occ?.img?.id) out.add(String(x.occ.img.id));
  for (const v of Object.values(x)) if (typeof v === "string" && v.includes("att:")) for (const m of v.matchAll(ATT)) out.add(m[1]);
}

/** Alle Anhang-ids, auf die noch etwas zeigt, auch Einträge im Papierkorb (die kommen beim Wiederherstellen samt Anhang zurück). */
export function referencedFiles(data) {
  const out = new Set();
  for (const c of COLLS) for (const x of data[c] || []) collectFiles(x, out);
  for (const t of data.meta?.trash || []) for (const items of Object.values(t?.removed || {})) for (const x of Array.isArray(items) ? items : []) collectFiles(x, out);
  return out;
}

/** Lokal gespeicherte Dateien (ids), zu denen kein Eintrag mehr gehört. Cloud-Sicherungen u. Ä. liegen nicht lokal. */
export function orphanFiles(data, localIds) {
  const used = referencedFiles(data);
  return [...new Set(localIds || [])].map(String).filter((id) => !used.has(id));
}

/** Übersicht für die Einstellungen: pro Art die Gruppen (mit `keep` bei Doppeln) und die Anzahl zu löschender Einträge */
export function findCleanup(data) {
  const sessions = duplicateSessions(data), cards = duplicateCards(data), notes = emptyNotes(data);
  return {
    sessions: { groups: sessions, count: sessions.reduce((n, g) => n + g.remove.length, 0) },
    cards: { groups: cards, count: cards.reduce((n, g) => n + g.remove.length, 0) },
    notes: { items: notes, count: notes.length },
  };
}

/** Entfernt doppelte Termine; Notizen und Lerneinheiten der entfernten zeigen danach auf den behaltenen Termin. */
export function removeDuplicateSessions(data, groups = duplicateSessions(data)) {
  const to = new Map();
  for (const g of groups) for (const x of g.remove) to.set(x.id, g.keep.id);
  if (!to.size) return data;
  const re = (list) => list.map((x) => (to.has(x.sessionId) ? { ...x, sessionId: to.get(x.sessionId) } : x));
  const usedNotes = (data.notes || []).some((n) => to.has(n.sessionId)), usedLogs = (data.logs || []).some((l) => to.has(l.sessionId));
  return {
    ...data, sessions: data.sessions.filter((s) => !to.has(s.id)),
    ...(usedNotes && { notes: re(data.notes) }), ...(usedLogs && { logs: re(data.logs) }),
  };
}

/** Entfernt doppelte Karteikarten (die meistgelernte bleibt) */
export function removeDuplicateCards(data, groups = duplicateCards(data)) {
  const gone = new Set(groups.flatMap((g) => g.remove.map((x) => x.id)));
  return gone.size ? { ...data, cards: data.cards.filter((c) => !gone.has(c.id)) } : data;
}

/** Entfernt leere Notizen */
export function removeEmptyNotes(data, items = emptyNotes(data)) {
  const gone = new Set(items.map((n) => n.id));
  return gone.size ? { ...data, notes: data.notes.filter((n) => !gone.has(n.id)) } : data;
}
