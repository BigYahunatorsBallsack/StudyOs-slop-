/* Moodle-Fristen: Kalender-Export (iCal) aus Moodle abonnieren und Abgaben als Hausaufgaben übernehmen.
   Jede übernommene Abgabe trägt `feedKey` („moodle|UID“), damit sie beim nächsten Abruf wiedererkannt wird.
   Eigene Änderungen an Titel oder Datum (`locked`) und erledigte Abgaben überschreibt das Abo nicht. */
import { DONE_HW } from "./constants.js";
import { addDays, iso, uid as newId } from "./util.js";
import { NEW, SKIP } from "./feed.js";

const DUE = /(ist fällig|fällig|is due|\bdue\b|schließt|closes|abgabe|deadline|endet|ends|einsendeschluss)/i;
const NOT_DUE = /(öffnet|opens|geöffnet|beginnt|starts|verfügbar ab|available from)/i;
const STRIP = [/\s+(ist|wird)\s+fällig\.?$/i, /\s+is due\.?$/i, /\s+(schließt|closes|endet|ends)\.?$/i, /^(fällig|abgabetermin|abgabe|deadline|due)\s*[:–-]\s*/i, /\s*\((fällig|due)\)$/i];

export const isMoodleDeadline = (e) => !NOT_DUE.test(e.summary) && DUE.test(e.summary);
export function cleanTitle(summary) { let t = String(summary || "").trim(); for (const re of STRIP) t = t.replace(re, "").trim(); return t || summary; }
export const courseOf = (e) => e.course || "Ohne Kurs";

/** Fälligkeit: Mitternacht bedeutet „bis Ende des Vortags“ */
export function dueOf(e) {
  if (e.allDay) return { due: e.date, dueTime: "" };
  if (e.start === "00:00") return { due: addDays(e.date, -1), dueTime: "23:59" };
  return { due: e.date, dueTime: e.start };
}

/** Kurse, die noch keinem Modul zugeordnet sind */
export const unmappedCourses = (events, map = {}) => [...new Set(events.filter(isMoodleDeadline).map(courseOf))].filter((c) => !(c in map)).sort((a, b) => a.localeCompare(b, "de"));

/**
 * Gleicht Abgaben aus dem Moodle-Kalender mit den Hausaufgaben ab.
 * Neue Abgaben werden nur angelegt, wenn sie noch nicht vorbei sind.
 */
export function applyMoodle(data, events, map, today = iso(), dismissed = []) {
  const gone = new Set(dismissed);
  const stats = { added: 0, updated: 0, ignored: 0 };
  const byKey = new Map(data.homework.filter((h) => h.feedKey).map((h) => [h.feedKey, h]));
  const homework = [...data.homework];
  const seen = new Set();
  for (const e of events) {
    if (!isMoodleDeadline(e)) { stats.ignored++; continue; }
    const moduleId = map[courseOf(e)];
    if (!moduleId || moduleId === SKIP || moduleId === NEW) continue;
    const key = `moodle|${e.uid}`;
    if (seen.has(key) || gone.has(key)) continue;
    seen.add(key);
    const { due, dueTime } = dueOf(e);
    const title = cleanTitle(e.summary);
    const old = byKey.get(key);
    if (old) {
      if (DONE_HW.has(old.status) || old.deleted) continue;
      const locked = new Set(old.locked || []);
      const patch = {};
      if (!locked.has("title") && old.title !== title) patch.title = title;
      if (!locked.has("due") && (old.due !== due || (old.dueTime || "") !== dueTime)) { patch.due = due; patch.dueTime = dueTime; }
      if (!locked.has("moduleId") && old.moduleId !== moduleId) patch.moduleId = moduleId;
      if (Object.keys(patch).length) { homework[homework.indexOf(old)] = { ...old, ...patch }; stats.updated++; }
      continue;
    }
    if (due < today) continue;
    homework.push({ id: newId(), moduleId, title, issued: null, due, dueTime, status: "ausgegeben", points: null, maxPoints: null, feedback: "", feedKey: key, source: "moodle" });
    stats.added++;
  }
  return { homework, stats };
}
