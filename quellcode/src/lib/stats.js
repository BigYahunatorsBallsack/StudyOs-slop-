/* Auswertungen: Aktivitätsraster, Lernzeit je Semester, Notenverlauf */
import { addDays, iso, sum, wdIdx } from "./util.js";

/** Aktivitätsraster der letzten `weeks` Wochen: Spalten = Wochen ab Montag, Zeilen = Mo bis So. */
export function heatmap(logs, weeks = 26, today = iso()) {
  const byDay = new Map();
  logs.forEach((l) => { if (l.date && Number(l.minutes) > 0) byDay.set(l.date, (byDay.get(l.date) || 0) + Number(l.minutes)); });
  const start = addDays(today, -wdIdx(today) - (weeks - 1) * 7);
  const level = (m) => (m <= 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = addDays(start, w * 7 + d), minutes = byDay.get(date) || 0;
    return { date, minutes, level: level(minutes), future: date > today };
  }));
}

/** Lernzeit summiert nach dem Semester des Moduls (Einheiten ohne Modul zählen nicht mit). */
export function minutesBySemester(data) {
  const sem = new Map(data.modules.map((m) => [m.id, m.semester || 0]));
  const acc = new Map();
  data.logs.forEach((l) => {
    if (!sem.has(l.moduleId)) return;
    const s = sem.get(l.moduleId);
    acc.set(s, (acc.get(s) || 0) + (Number(l.minutes) || 0));
  });
  return [...acc].sort((a, b) => a[0] - b[0]).map(([semester, minutes]) => ({ semester, minutes }));
}

/** Kumulierter ECTS-gewichteter Schnitt nach jedem Semester (nur bestandene, benotete Module). */
export function gradeTimeline(data) {
  const graded = data.modules.filter((m) => m.status === "bestanden" && Number(m.grade) > 0 && Number(m.ects) > 0);
  const semesters = [...new Set(graded.map((m) => m.semester || 0))].sort((a, b) => a - b);
  return semesters.map((semester) => {
    const upTo = graded.filter((m) => (m.semester || 0) <= semester);
    const ects = sum(upTo, (m) => m.ects);
    return { semester, ects, avg: sum(upTo, (m) => m.grade * m.ects) / ects };
  });
}

/** Prüfungsfristen: Anmeldeschluss und Wiederholungstermin, die in den nächsten `days` Tagen liegen. */
export function examDeadlines(data, today = iso(), days = 14) {
  const until = addDays(today, days), out = [];
  data.exams.forEach((e) => {
    if (e.registerBy && !e.registered && e.registerBy >= today && e.registerBy <= until) out.push({ exam: e, kind: "anmeldung", date: e.registerBy });
    if (e.retakeDate && e.result === "nicht bestanden" && e.retakeDate >= today && e.retakeDate <= until) out.push({ exam: e, kind: "wiederholung", date: e.retakeDate });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
