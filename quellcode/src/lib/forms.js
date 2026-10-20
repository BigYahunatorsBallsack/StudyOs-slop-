import { EXAM_RESULTS, HW_STATUS, LOG_KINDS, MODULE_STATUS, SESSION_TYPES, TOPIC_STATES } from "./constants.js";
import { addDays, byOrder, byTime, dayOf, fmtShort, iso } from "./util.js";
import { hasCloze } from "./cards.js";
import { pickColor } from "./colors.js";
import { parseWatch } from "./tum.js";

/* ---------------- Formulardefinitionen ---------------- */
export const opt = (arr) => arr.map((x) => (typeof x === "string" ? { value: x, label: x } : x));

export const modOpts = (d, empty) => [...(empty ? [{ value: "", label: "Allgemein (kein Modul)" }] : []), ...byUse(d).map((m) => ({ value: m.id, label: m.name }))];

/** Module für Auswahlfelder: die drei zuletzt am meisten genutzten zuerst, archivierte zuletzt */
export function byUse(d, today = iso()) {
  const from = addDays(today, -30), n = {};
  const count = (id) => { if (id) n[id] = (n[id] || 0) + 1; };
  (d.logs || []).forEach((l) => l.date >= from && count(l.moduleId));
  (d.homework || []).forEach((h) => (h.created || h.issued || "") >= from && count(h.moduleId));
  (d.notes || []).forEach((x) => dayOf(x.updated || x.created) >= from && count(x.moduleId));
  const live = d.modules.filter((m) => !m.archived), top = live.filter((m) => n[m.id]).sort((a, b) => n[b.id] - n[a.id]).slice(0, 3);
  return [...top, ...live.filter((m) => !top.includes(m)), ...d.modules.filter((m) => m.archived)];
}

export const topicOpts = (d, v) => [{ value: "", label: "– kein Thema –" }, ...d.topics.filter((x) => x.moduleId === v.moduleId).sort(byOrder).map((x) => ({ value: x.id, label: x.title }))];

export const EFFORT_OPTS = [{ value: "1", label: "klein" }, { value: "2", label: "mittel" }, { value: "3", label: "groß" }];
export const STAR_OPTS = [{ value: "0", label: "keine Angabe" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: "★".repeat(n) + "☆".repeat(5 - n) }))];

export function formDef(kind, d) {
  switch (kind) {
    case "module": return { title: "Modul", fields: [
      { k: "name", l: "Name", t: "text", req: true, ph: "z. B. Einführung in die Informatik" },
      { k: "code", l: "Modulnummer", t: "text", ph: "z. B. IN0001", half: true },
      { k: "ects", l: "ECTS", t: "number", def: 6, min: 0, half: true },
      { k: "semester", l: "Semester", t: "number", def: 1, min: 1, half: true },
      { k: "status", l: "Status", t: "select", opts: opt(MODULE_STATUS), def: "belegt", half: true },
      { k: "grade", l: "Note (optional)", t: "decimal", min: 1, max: 5, ph: "z. B. 1,7", half: true },
      { k: "bonusPct", l: "Bonusgrenze HA in % (optional)", t: "decimal", min: 0, max: 100, ph: "z. B. 50", half: true },
      { k: "expectedGrade", l: "Erwartete Note (für die Prognose)", t: "decimal", min: 1, max: 5, ph: "z. B. 2,3", half: true },
      { k: "weeklyGoal", l: "Lernziel pro Woche in Stunden (optional)", t: "decimal", min: 0, max: 80, ph: "z. B. 4", half: true },
      { k: "liveUrl", l: "Aufzeichnungen (TUM-Live-Link)", t: "url", ph: "https://live.rbg.tum.de/…", half: true },
      { k: "gop", l: "Zählt zur Grundlagenprüfung (GOP)", t: "checkbox" },
      { k: "semesterStart", l: "Semesterbeginn (optional)", t: "date", half: true, hint: "Für die Workload-Ampel; sonst zählt der erste Termin." },
      { k: "color", l: "Farbe", t: "color", def: () => pickColor(d.modules) },
      { k: "archived", l: "Archiviert (abgeschlossen, wird in Heute, Woche-Vorschlägen und Erinnerungen ausgeblendet)", t: "checkbox", editOnly: true },
    ], validate: (v) => (v.liveUrl && !/^https:\/\/\S+$/i.test(v.liveUrl) ? "Der Aufzeichnungs-Link muss mit https:// beginnen." : "") };
    case "session": return { title: "Lehrveranstaltung", fields: [
      { k: "moduleId", l: "Modul", t: "select", req: true, opts: () => modOpts(d) },
      { k: "type", l: "Art", t: "select", opts: opt(SESSION_TYPES), def: "Vorlesung", half: true },
      { k: "date", l: "Datum", t: "date", req: true, def: iso, half: true },
      { k: "start", l: "Beginn", t: "time", def: "10:00", half: true },
      { k: "end", l: "Ende", t: "time", def: "12:00", half: true },
      { k: "room", l: "Raum", t: "text", ph: "z. B. MI HS 1" },
      { k: "watchedTo", l: "Aufzeichnung angeschaut bis (optional)", t: "text", ph: "z. B. 47:12", editOnly: true, hint: "Stelle in TUM-Live als Minuten:Sekunden, Stunden:Minuten:Sekunden oder nur Minuten. Leer lassen, wenn noch nichts angeschaut ist." },
      { k: "repeatUntil", l: "Wöchentlich wiederholen bis (optional)", t: "date", createOnly: true },
      { k: "cancelled", l: "Termin fällt aus (zählt nicht zur Nachbereitungsquote)", t: "checkbox", editOnly: true },
      { k: "applySeries", l: "Änderungen auf alle folgenden gleichen Termine übertragen", t: "checkbox", seriesOnly: true, transient: true, hint: "Gleiches Modul, gleiche Art, gleicher Wochentag und Beginn. Übertragen werden nur geänderte Angaben (Art, Beginn, Ende, Raum)." },
    ], validate: (v) => (v.start && v.end && v.end <= v.start ? "Das Ende muss nach dem Beginn liegen." : v.repeatUntil && v.repeatUntil < v.date ? "Das Wiederholungsende liegt vor dem Startdatum." : Number.isNaN(parseWatch(v.watchedTo)) ? "„Angeschaut bis“ bitte als 47:12, 1:05:30 oder in Minuten angeben." : "") };
    case "homework": return { title: "Hausaufgabe / Übungsblatt", fields: [
      { k: "moduleId", l: "Modul", t: "select", req: true, opts: () => modOpts(d) },
      { k: "title", l: "Titel", t: "text", req: true, ph: "z. B. Übungsblatt 3" },
      { k: "issued", l: "Ausgegeben am", t: "date", def: iso, half: true },
      { k: "due", l: "Abgabe", t: "date", req: true, half: true },
      { k: "dueTime", l: "Uhrzeit (optional)", t: "time", half: true },
      { k: "status", l: "Status", t: "select", opts: opt(HW_STATUS), def: "ausgegeben" },
      { k: "subtasks", l: "Teilaufgaben (optional)", t: "subtasks", hint: "Mit Enter hinzufügen. „a-d“ oder „Aufgabe 1-4“ legt mehrere auf einmal an." },
      { k: "points", l: "Erreichte Punkte", t: "decimal", min: 0, half: true },
      { k: "maxPoints", l: "Maximale Punkte", t: "decimal", min: 0, half: true },
      { k: "feedback", l: "Feedback / Notizen", t: "textarea", rows: 3 },
      { k: "repeatUntil", l: "Jede Woche ein neues Blatt bis (optional)", t: "date", createOnly: true, hint: "Legt die Folgeblätter gleich mit an und zählt den Titel hoch: Blatt 1, Blatt 2, …" },
    ], validate: (v) => (v.repeatUntil && v.repeatUntil < (v.issued || v.due) ? "Das Enddatum der Serie liegt vor dem ersten Blatt." : v.issued && v.due && v.due < v.issued ? "Die Abgabe liegt vor dem Ausgabedatum." : v.points !== null && v.points !== "" && v.maxPoints !== null && v.maxPoints !== "" && Number(v.points) > Number(v.maxPoints) ? "Erreichte Punkte dürfen nicht über den maximalen Punkten liegen." : "") };
    case "topic": return { title: "Thema / Kapitel", fields: [
      { k: "moduleId", l: "Modul", t: "select", req: true, opts: () => modOpts(d) },
      { k: "title", l: "Titel", t: "text", req: true, ph: "z. B. Kap. 3: Vektorräume" },
      { k: "order", l: "Reihenfolge", t: "number", min: 0, half: true },
      { k: "state", l: "Stand", t: "select", opts: opt(TOPIC_STATES), def: "nicht begonnen", half: true },
      { k: "rating", l: "Selbsteinschätzung", t: "select", num: true, opts: STAR_OPTS, def: 0, half: true },
      { k: "effort", l: "Aufwand", t: "select", num: true, opts: EFFORT_OPTS, def: 2, half: true },
    ] };
    case "block": return { title: "Lernblock", fields: [
      { k: "title", l: "Was?", t: "text", req: true, ph: "z. B. Blatt 3 rechnen" },
      { k: "moduleId", l: "Modul", t: "select", opts: () => modOpts(d, true) },
      { k: "date", l: "Datum", t: "date", req: true, def: iso },
      { k: "start", l: "Beginn", t: "time", req: true, def: "12:00", half: true },
      { k: "end", l: "Ende", t: "time", req: true, def: "13:30", half: true },
      { k: "done", l: "Erledigt", t: "checkbox", editOnly: true },
    ], validate: (v) => (v.end <= v.start ? "Das Ende muss nach dem Beginn liegen." : "") };
    case "log": return { title: "Lerneinheit", fields: [
      { k: "date", l: "Datum", t: "date", req: true, def: iso, half: true },
      { k: "minutes", l: "Dauer (Minuten)", t: "number", req: true, min: 1, def: 45, half: true },
      { k: "moduleId", l: "Modul", t: "select", opts: () => modOpts(d, true) },
      { k: "topicId", l: "Thema", t: "select", opts: (v) => topicOpts(d, v) },
      { k: "kind", l: "Art", t: "select", opts: opt(LOG_KINDS), def: "Nacharbeiten" },
      { k: "homeworkId", l: "Zu Abgabe (optional)", t: "select", opts: (v) => [{ value: "", label: "– keine –" }, ...d.homework.filter((h) => h.moduleId && h.moduleId === v.moduleId).sort((a, b) => (b.due || "").localeCompare(a.due || "")).map((h) => ({ value: h.id, label: h.title }))] },
      { k: "note", l: "Notiz", t: "textarea", rows: 2, ph: "Was hast du gemacht?" },
    ], validate: (v) => (Number(v.minutes) > 0 ? "" : "Die Dauer muss größer als 0 sein.") };
    case "note": return { title: "Notiz", fields: [
      { k: "moduleId", l: "Modul", t: "select", opts: () => modOpts(d, true) },
      { k: "sessionId", l: "Zu Lehrveranstaltung (optional)", t: "select", opts: (v) => [{ value: "", label: "– keine –" }, ...d.sessions.filter((s) => s.moduleId === v.moduleId).sort(byTime).reverse().map((s) => ({ value: s.id, label: `${fmtShort(s.date)} ${s.start} · ${s.type}` }))] },
      { k: "title", l: "Titel", t: "text", req: true, ph: "z. B. VL 4 – Rekursion" },
      { k: "text", l: "Inhalt", t: "textarea", rows: 12, mono: true, ph: "Mitschrift, Formeln, Code, offene Fragen …" },
      { k: "pinned", l: "Anheften (steht in Listen oben)", t: "checkbox" },
    ] };
    case "card": return { title: "Karteikarte", fields: [
      { k: "moduleId", l: "Modul", t: "select", req: true, opts: () => modOpts(d) },
      { k: "topicId", l: "Thema", t: "select", opts: (v) => topicOpts(d, v) },
      { k: "front", l: "Vorderseite (Frage)", t: "textarea", rows: 3, req: true, mono: true, hint: "Markdown und Code-Blöcke (```) gehen. Lückentext: {{c1::Antwort}} oder {{c1::Antwort::Hinweis}}." },
      { k: "back", l: "Rückseite (Antwort)", t: "textarea", rows: 4, mono: true, hint: "Bei Lückentext optional (Zusatzinfo)." },
      { k: "tags", l: "Tags", t: "text", ph: "z. B. graphen, klausur", hint: "Mit Komma trennen." },
      { k: "hard", l: "Als schwer markieren", t: "checkbox" },
    ], validate: (v) => (!String(v.back || "").trim() && !hasCloze(v.front) ? "Bitte eine Rückseite ausfüllen oder eine Lücke {{c1::…}} verwenden." : "") };
    case "exam": return { title: "Prüfung", fields: [
      { k: "moduleId", l: "Modul", t: "select", req: true, opts: () => modOpts(d) },
      { k: "date", l: "Datum", t: "date", req: true, half: true },
      { k: "time", l: "Uhrzeit", t: "time", def: "09:00", half: true },
      { k: "room", l: "Raum", t: "text", half: true },
      { k: "dailyMinutes", l: "Lernziel pro Tag (min)", t: "number", min: 0, def: 90, half: true },
      { k: "registerBy", l: "Anmeldeschluss", t: "date", half: true },
      { k: "attempt", l: "Versuch", t: "select", num: true, opts: [1, 2, 3].map((n) => ({ value: String(n), label: n === 1 ? "Erstversuch" : `${n}. Versuch` })), def: 1, half: true },
      { k: "registered", l: "Zur Prüfung angemeldet", t: "checkbox" },
      { k: "result", l: "Ergebnis", t: "select", opts: opt(EXAM_RESULTS), def: "offen", half: true },
      { k: "retakeDate", l: "Wiederholungstermin", t: "date", half: true },
      { k: "freeWeekdays", l: "Lernfreie Tage im Lernplan", t: "weekdays" },
      { k: "notes", l: "Notizen", t: "textarea", rows: 3, ph: "Hilfsmittel, Prüfungsumfang, Bonus …" },
    ] };
    default: return { title: "", fields: [] };
  }
}
