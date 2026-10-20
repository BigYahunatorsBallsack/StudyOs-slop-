/* Moodle-Fristen: Kalender-Export (iCal) aus Moodle abonnieren und Abgaben als Hausaufgaben übernehmen.
   Jede übernommene Abgabe trägt `feedKey` („moodle|UID“), damit sie beim nächsten Abruf wiedererkannt wird.
   Eigene Änderungen an Titel oder Datum (`locked`) und erledigte Abgaben überschreibt das Abo nicht. */
import { DONE_HW } from "./constants.js";
import { addDays, iso, uid as newId } from "./util.js";
import { NEW, SKIP } from "./feed.js";

const DUE = /(ist fällig|fällig|is due|\bdue\b|schließt|closes|abgabe|deadline|endet|ends|einsendeschluss|einreichung|bearbeitungsende|submission)/i;
const NOT_DUE = /(öffnet|opens|geöffnet|beginnt|starts|verfügbar ab|available from|veröffentlich|release|freigabe|bewertung|assessment|korrektur|vorlesung|lecture|tutorium|tutorial|prüfung|klausur|exam|einsicht|review)/i;
const STRIP = [/\s+(ist|wird)\s+fällig\.?$/i, /\s+is due\.?$/i, /\s+(schließt|closes|endet|ends)\.?$/i, /^(fällig|abgabetermin|abgabefrist|abgabe|einreichungsfrist|deadline|due date|due)\s*[:–-]\s*/i, /\s*[-–:]\s*(abgabe|abgabefrist|due date|due|deadline)$/i, /\s*\((fällig|due|abgabe|abgabefrist|due date)\)$/i];

/* Artemis: „<Kurs> Exercise | Due: <Titel>“ bzw. „<Kurs> Aufgabe | Abgabefrist: <Titel>“ (siehe ExerciseService/CalendarSubscriptionService) */
const ARTEMIS = /^(.*?)\s*\b(Exercise|Aufgabe|Lecture|Vorlesung|Tutorial|Tutorium|Exam|Klausur)\s*\|\s*(.*)$/;
const ARTEMIS_DUE = /^(Due|Abgabefrist):\s*/i;
export function parseArtemis(summary) {
  const m = ARTEMIS.exec(String(summary || ""));
  if (!m) return null;
  const exercise = /^(Exercise|Aufgabe)$/.test(m[2]);
  return { course: m[1].trim(), kind: m[2], due: exercise && ARTEMIS_DUE.test(m[3]), title: m[3].replace(ARTEMIS_DUE, "").trim() };
}

export const isMoodleDeadline = (e) => { const a = parseArtemis(e.summary); return a ? a.due : !NOT_DUE.test(e.summary) && DUE.test(e.summary); };
export function cleanTitle(summary) {
  const a = parseArtemis(summary);
  if (a) return a.title || summary;
  let t = String(summary || "").trim(); for (const re of STRIP) t = t.replace(re, "").trim(); return t || summary;
}
export const courseOf = (e) => e.course || parseArtemis(e.summary)?.course || "Ohne Kurs";

/** Was steht im Kalender? (für die Vorschau: Anzahl je Art) */
export function feedSummary(events) {
  const kinds = {};
  const DE = { Exercise: "Aufgaben-Termine", Aufgabe: "Aufgaben-Termine", Lecture: "Vorlesungen", Vorlesung: "Vorlesungen", Tutorial: "Tutorien", Tutorium: "Tutorien", Exam: "Prüfungstermine", Klausur: "Prüfungstermine" };
  for (const e of events) { const a = parseArtemis(e.summary); const k = a ? (a.due ? "Abgaben" : DE[a.kind]) : isMoodleDeadline(e) ? "Abgaben" : "sonstige Termine"; kinds[k] = (kinds[k] || 0) + 1; }
  return kinds;
}

/** Fälligkeit: Mitternacht bedeutet „bis Ende des Vortags“ */
export function dueOf(e) {
  if (e.allDay) return { due: e.date, dueTime: "" };
  if (e.start === "00:00") return { due: addDays(e.date, -1), dueTime: "23:59" };
  return { due: e.date, dueTime: e.start };
}

/* Link zur Aufgabe. Moodle und Artemis liefern im Kalender keine URL-Eigenschaft (Moodle: UID, Titel, Beschreibung, Kurs;
   Artemis: UID, Titel, Zeit, Ort), deshalb der Reihe nach: URL des Termins, ein Moodle-Aktivitätslink (/mod/…) aus der
   Beschreibung, bei Moodle die Tagesansicht des Kalenders mit dem Eintrag, bei Artemis die Aufgaben des Kurses (Kursnummer im Abo-Link). */
export function taskUrl(e, prefix = "moodle", feedUrl = "") {
  if (e.url) return e.url;
  if (prefix === "moodle") {
    const link = /https?:\/\/[^\s\]\[<>"]+\/mod\/[^\s\]\[<>"]+/i.exec(e.description || "");
    if (link) return link[0].replace(/[).,;]+$/, "");
    const host = /^\d+@([\w.-]+(?:\/[\w.~-]+)*)$/.exec(e.uid || "")?.[1]; /* Moodle-UID: „Termin-ID@Adresse“ */
    const root = /^(https?:\/\/\S+?)\/calendar\/export_execute\.php/i.exec(feedUrl)?.[1] || (host ? `https://${host}` : "");
    if (!root || !e.date) return "";
    const ts = Math.round(new Date(`${e.date}T${e.allDay ? "12:00" : e.start || "12:00"}:00`).getTime() / 1000);
    return `${root.replace(/^http:/i, "https:")}/calendar/view.php?view=day&time=${ts}`;
  }
  const c = /^(https:\/\/[^/]+)\/api\/(?:[\w-]+\/)?calendar\/courses\/(\d+)\//i.exec(feedUrl);
  return c ? `${c[1]}/courses/${c[2]}/exercises` : "";
}

/** Beschriftung des Knopfs zur Aufgabe, null ohne Link */
export const taskLinkLabel = (h) => (!/^https:\/\//i.test(h?.url || "") ? null : String(h.source || "").startsWith("artemis") ? "In Artemis öffnen" : String(h.source || "") === "moodle" ? "In Moodle öffnen" : "Aufgabe öffnen");

/** Kurse, die noch keinem Modul zugeordnet sind */
export const unmappedCourses = (events, map = {}) => [...new Set(events.filter(isMoodleDeadline).map(courseOf))].filter((c) => !(c in map)).sort((a, b) => a.localeCompare(b, "de"));

/**
 * Gleicht Abgaben aus dem Moodle-Kalender mit den Hausaufgaben ab.
 * Neue Abgaben werden nur angelegt, wenn sie noch nicht vorbei sind.
 */
export function applyMoodle(data, events, map, today = iso(), dismissed = [], prefix = "moodle", feedUrl = "") {
  const gone = new Set(dismissed);
  const stats = { added: 0, updated: 0, ignored: 0 };
  const byKey = new Map(data.homework.filter((h) => h.feedKey).map((h) => [h.feedKey, h]));
  const homework = [...data.homework];
  const seen = new Set();
  for (const e of events) {
    if (!isMoodleDeadline(e)) { stats.ignored++; continue; }
    const moduleId = map[courseOf(e)];
    if (!moduleId || moduleId === SKIP || moduleId === NEW) continue;
    const key = `${prefix}|${e.uid}`;
    if (seen.has(key) || gone.has(key)) continue;
    seen.add(key);
    const { due, dueTime } = dueOf(e);
    const title = cleanTitle(e.summary);
    const url = taskUrl(e, prefix, feedUrl);
    const old = byKey.get(key);
    if (old) {
      if (DONE_HW.has(old.status) || old.deleted) continue;
      const locked = new Set(old.locked || []);
      const patch = {};
      if (!locked.has("title") && old.title !== title) patch.title = title;
      if (!locked.has("due") && (old.due !== due || (old.dueTime || "") !== dueTime)) { patch.due = due; patch.dueTime = dueTime; }
      if (!locked.has("moduleId") && old.moduleId !== moduleId) patch.moduleId = moduleId;
      if (url && old.url !== url) patch.url = url;
      /* nur der Link nachgetragen: still, keine Meldung „aktualisiert“ */
      if (Object.keys(patch).length) { homework[homework.indexOf(old)] = { ...old, ...patch }; if (Object.keys(patch).some((k) => k !== "url")) stats.updated++; }
      continue;
    }
    if (due < today) continue;
    homework.push({ id: newId(), moduleId, title, issued: null, due, dueTime, status: "ausgegeben", points: null, maxPoints: null, feedback: "", feedKey: key, source: prefix, ...(url && { url }) });
    stats.added++;
  }
  return { homework, stats };
}

/* Artemis: ein Abo pro Kurs; alle Abgaben gehen an das gewählte Modul */
export const artemisMap = (events, moduleId) => Object.fromEntries([...new Set(events.map(courseOf))].map((c) => [c, moduleId]));
export function applyArtemis(data, feed, events, today = iso()) {
  return applyMoodle(data, events, artemisMap(events, feed.moduleId), today, feed.dismissed || [], `artemis:${feed.id}`, feed.url || "");
}
