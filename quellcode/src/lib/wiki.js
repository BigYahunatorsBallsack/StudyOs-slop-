/* Verlinkte Notizen: [[Titel]] in einer Notiz verweist auf die Notiz mit diesem Titel (Groß-/Kleinschreibung egal),
   bei gleichen Titeln zuerst auf die im selben Modul. [[Titel|Text]] zeigt einen eigenen Linktext. */

export const WIKI_RE = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
const norm = (s) => String(s || "").trim().toLocaleLowerCase("de");

/** Alle verlinkten Titel einer Notiz (ohne Doppelte, in der Reihenfolge des Textes). */
export function linkNames(text) {
  const out = [];
  for (const m of String(text || "").matchAll(WIKI_RE)) { const n = m[1].trim(); if (n && !out.some((x) => norm(x) === norm(n))) out.push(n); }
  return out;
}

/** Die Notiz zu einem Linknamen, oder null. */
export function findNote(notes, name, moduleId = "") {
  const key = norm(name);
  if (!key) return null;
  const hits = notes.filter((n) => norm(n.title) === key);
  return hits.find((n) => (n.moduleId || "") === (moduleId || "")) || hits[0] || null;
}

/** Notizen, die auf `note` verlinken. */
export function backlinks(notes, note) {
  if (!note?.title?.trim()) return [];
  /* Nur Links mit genau diesem Titel kommen in Frage: die Notizen mit dem Titel einmal suchen statt für jeden Link aller Notizen */
  const key = norm(note.title), same = notes.filter((n) => norm(n.title) === key);
  const target = (moduleId) => same.find((n) => (n.moduleId || "") === (moduleId || "")) || same[0];
  return notes.filter((n) => n.id !== note.id && String(n.text || "").includes("[[") && linkNames(n.text).some((name) => norm(name) === key) && target(n.moduleId)?.id === note.id);
}
