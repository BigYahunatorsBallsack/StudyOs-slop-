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

/* ---------------- Lernstatistik ---------------- */
export const DAYPARTS = [["Morgens", 5, 11], ["Mittags", 11, 14], ["Nachmittags", 14, 18], ["Abends", 18, 22], ["Nachts", 22, 29]];

/** Lernminuten nach Tageszeit (nur Einheiten mit Uhrzeit) und nach Wochentag */
export function learningRhythm(logs) {
  const parts = DAYPARTS.map(([label]) => ({ label, minutes: 0 }));
  const weekdays = Array.from({ length: 7 }, () => 0);
  let timed = 0;
  for (const l of logs) {
    const min = Number(l.minutes) || 0;
    if (!min || !l.date) continue;
    weekdays[(new Date(l.date + "T12:00:00").getDay() + 6) % 7] += min;
    if (!/^\d{2}:\d{2}$/.test(l.at || "")) continue;
    let h = Number(l.at.slice(0, 2)); if (h < 5) h += 24;
    const i = DAYPARTS.findIndex(([, a, b]) => h >= a && h < b);
    if (i >= 0) { parts[i].minutes += min; timed += min; }
  }
  const best = timed ? parts.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null;
  return { parts, weekdays, timed, best };
}

/** Pro bestandenem, benotetem Modul: Lernstunden je ECTS und Note */
export function effortVsGrade(data) {
  return data.modules.filter((m) => m.status === "bestanden" && Number(String(m.grade).replace(",", ".")) >= 1 && Number(m.ects) > 0).map((m) => {
    const h = data.logs.filter((l) => l.moduleId === m.id).reduce((s, l) => s + (Number(l.minutes) || 0), 0) / 60;
    return { id: m.id, name: m.name, color: m.color, grade: Number(String(m.grade).replace(",", ".")), hours: h, perEcts: h / Number(m.ects) };
  }).filter((x) => x.hours > 0).sort((a, b) => a.grade - b.grade);
}
