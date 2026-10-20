/* Einträge kopieren (Schnellmenü „Duplizieren“), mehrere auf einmal ändern (Mehrfachauswahl) und die Vorlage
   für eine Notiz zu einem Termin. Reine Funktionen auf den Daten; Rückgängig und Toast macht die Oberfläche. */
import { COLL } from "./constants.js";
import { movePatch } from "./gridmove.js";
import { shortName } from "./modules.js";
export { markAttended } from "./study.js";
import { addDays, fmt, uid } from "./util.js";

/* Was eine Kopie nie übernimmt: Abo-Verknüpfung, eigene Sperren, Anhänge (die Datei gehört zum Original),
   Serienzugehörigkeit und Sync-Stempel */
const NEVER = ["updated", "fu", "feedKey", "source", "locked", "files", "seriesId", "change"];

/**
 * Kopie eines Eintrags als eigener, von Hand angelegter Eintrag: neue id, nichts erledigt, besucht oder abgegeben,
 * keine Teilaufgabe abgehakt.
 */
export function duplicateEntry(kind, item, today, newId = uid) {
  const x = { ...item, id: newId(), created: today };
  NEVER.forEach((k) => delete x[k]);
  if (kind === "homework") {
    Object.assign(x, { status: "ausgegeben", doneAt: null, points: null, feedback: "" });
    delete x.missed;
    if (Array.isArray(item.subtasks)) x.subtasks = item.subtasks.map((s) => ({ ...s, id: newId(), done: false }));
  } else if (kind === "session") {
    Object.assign(x, { cancelled: false, prepared: false, attended: false, reviewed: false, reviewedAt: null, attendedAt: null });
    ["offReason", "offChecked", "watchedTo"].forEach((k) => delete x[k]);
  } else if (kind === "block") {
    Object.assign(x, { done: false, doneAt: null });
  } else if (kind === "note") {
    Object.assign(x, { sessionId: "", title: `${item.title || "Notiz"} (Kopie)`, updated: today });
  }
  return x;
}

/** Termine um `days` Tage verschieben; Abo-Termine merken sich das Datum als von Hand geändert */
export function shiftSessions(sessions, ids, days) {
  if (!days) return sessions;
  return sessions.map((s) => (ids.includes(s.id) ? { ...s, ...movePatch(s, { date: addDays(s.date, days) }) } : s));
}

/**
 * Modul mehrerer Einträge ändern. Wie im Formular: Thema (Karte) und Termin (Notiz) gehören zum alten Modul und
 * fallen weg; Abo-Abgaben und -Termine behalten das neue Modul auch nach dem nächsten Abruf (`locked`).
 */
export function setModule(data, kind, ids, moduleId) {
  const coll = COLL[kind];
  /* Lernzeit aus Besuch und Aufzeichnung zieht mit dem Termin ins neue Modul */
  const moved = kind === "session" ? new Set(data.sessions.filter((s) => ids.includes(s.id) && (s.moduleId || "") !== moduleId).map((s) => s.id)) : null;
  const logs = moved?.size ? { logs: data.logs.map((l) => (moved.has(l.sessionId) && (l.kind === "Besucht" || l.kind === "Aufzeichnung") ? { ...l, moduleId, topicId: "" } : l)) } : {};
  return { ...data, ...logs, [coll]: (data[coll] || []).map((x) => {
    if (!ids.includes(x.id) || (x.moduleId || "") === moduleId) return x;
    const y = { ...x, moduleId };
    if ("topicId" in x) y.topicId = "";
    if (kind === "note") y.sessionId = "";
    if (x.feedKey && (kind === "homework" || kind === "session")) y.locked = [...new Set([...(x.locked || []), "moduleId"])];
    return y;
  }) };
}

/** Jüngste Notiz zu einem Termin (oder undefined) */
export const sessionNoteOf = (notes, sid) => notes.filter((n) => n.sessionId === sid).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))[0];

/** Neue Notiz zu einem Termin: Modul, Titel wie „DS Vorlesung 20.10.2026“ und ein kurzes Gerüst in Markdown */
export function sessionNoteDraft(s, m) {
  const name = shortName(m?.name || "");
  const when = [s.start && s.end ? `${s.start}–${s.end}` : s.start, s.room].filter(Boolean).join(", ");
  return {
    moduleId: s.moduleId || "", sessionId: s.id,
    title: [name, s.type, fmt(s.date)].filter(Boolean).join(" "),
    text: `# ${[s.type, fmt(s.date)].filter(Boolean).join(", ")}\n${when ? when + "\n" : ""}\n## Mitschrift\n\n\n## Offene Fragen\n\n`,
  };
}
