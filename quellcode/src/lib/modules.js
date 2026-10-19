/* Module zusammenführen: z. B. „Diskrete Strukturen“, „Übungen zu Diskrete Strukturen“ und
   „Tutorübungen zu Diskrete Strukturen“, die aus dem Kalender als drei Module kamen. */
import { COLLS } from "./constants.js";

/* Vorsilben und Zusätze, die nur die Art der Veranstaltung beschreiben */
const PREFIX = /^(?:(?:tutor|zentral|groß|gross|repetitor|haus|präsenz|praesenz|online-?)?(?:übung|uebung|ubung)(?:en)?|tutorium|tutorien|praktikum|seminar|vorlesung|vl|ue|üb|tü|zü|repetitorium|fragestunde|klausurvorbereitung)\s*(?:zu|zur|zum|für|fuer|in|:|-|–)?\s+/i;
const SUFFIX = /\s*(?:[-–:,]\s*)?(?:\(?\s*(?:vo|vl|ue|üb|ub|tü|tue|zü|zue|pr|se|tut|tutorium|übung|uebung|übungen|tutorübung|tutorübungen|zentralübung|vorlesung|praktikum|seminar|gruppe\s*\d+|gr\.?\s*\d+)\s*\)?)$/i;

/** Gemeinsamer Kern eines Modulnamens (klein, ohne Art der Veranstaltung, ohne Klammerzusätze) */
export function baseName(name) {
  let s = String(name || "").replace(/\s*\((?:beispiel|[^)]*\d{4}[^)]*)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(PREFIX, "").replace(SUFFIX, "").trim();
    if (s === before) break;
  }
  return s.toLowerCase().normalize("NFC").replace(/[„“"]/g, "").replace(/\s+/g, " ").trim();
}

/** Gruppen von Modulen mit gleichem Kern, die man zusammenführen könnte. */
export function mergeSuggestions(modules, dismissed = []) {
  const groups = new Map();
  for (const m of modules) {
    const b = baseName(m.name);
    if (b.length < 3) continue;
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(m);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([base, list]) => ({ base, modules: list, target: pickTarget(list), key: list.map((m) => m.id).sort().join("+") }))
    .filter((g) => !dismissed.includes(g.key));
}

/** Vorschlag fürs Obermodul: der Name ohne Zusätze, sonst einer mit Modulnummer/Note, sonst der kürzeste. */
export function pickTarget(list) {
  const score = (m) => (baseName(m.name) === String(m.name || "").toLowerCase().trim() ? 100 : 0) + (m.code ? 20 : 0) + (m.grade ? 10 : 0) + (m.status === "bestanden" ? 5 : 0) - String(m.name || "").length / 100;
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

/** Zählt, was zu den Modulen gehört (für die Vorschau). */
export function moduleContents(data, ids) {
  const set = new Set(ids);
  const n = (c) => (data[c] || []).filter((x) => set.has(x.moduleId)).length;
  return { sessions: n("sessions"), homework: n("homework"), topics: n("topics"), logs: n("logs"), notes: n("notes"), cards: n("cards"), exams: n("exams") };
}

/**
 * Führt `sourceIds` in `targetId` zusammen: alle Einträge ziehen um, die Quellmodule verschwinden,
 * das Stundenplan-Abo ordnet künftige Termine dem Obermodul zu.
 */
export function mergeModules(data, targetId, sourceIds) {
  const sources = new Set(sourceIds.filter((id) => id && id !== targetId));
  if (!sources.size || !data.modules.some((m) => m.id === targetId)) return data;
  const out = { ...data };
  for (const c of COLLS) {
    if (c === "modules") continue;
    if ((data[c] || []).some((x) => sources.has(x.moduleId))) out[c] = data[c].map((x) => (sources.has(x.moduleId) ? { ...x, moduleId: targetId } : x));
  }
  /* Obermodul behält seine Angaben; fehlende (Nummer, Note) werden aus den anderen übernommen */
  const target = data.modules.find((m) => m.id === targetId);
  const merged = { ...target };
  for (const m of data.modules.filter((x) => sources.has(x.id))) {
    if (!merged.code && m.code) merged.code = m.code;
    if (!merged.grade && m.grade) merged.grade = m.grade;
  }
  out.modules = data.modules.filter((m) => !sources.has(m.id)).map((m) => (m.id === targetId ? merged : m));
  const feed = data.settings?.icsFeed;
  if (feed?.map) out.settings = { ...data.settings, icsFeed: { ...feed, map: Object.fromEntries(Object.entries(feed.map).map(([k, v]) => [k, sources.has(v) ? targetId : v])) } };
  if (data.meta?.lastModule && sources.has(data.meta.lastModule)) out.meta = { ...data.meta, lastModule: targetId };
  return out;
}
