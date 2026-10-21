/* Auswertungen: Aktivitätsraster, Lernzeit je Semester, Notenverlauf */
import { addDays, iso, sum, wdIdx } from "./util.js";

const level = (m) => (m <= 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);

/* Raster ab dem Montag `start` über `weeks` Wochen; jede Zelle mit Summe und Minuten je Modul ("" = ohne Modul) */
function dayGrid(logs, start, weeks, today) {
  const byDay = new Map();
  logs.forEach((l) => {
    const min = Number(l.minutes) || 0;
    if (!l.date || min <= 0) return;
    const e = byDay.get(l.date) || { minutes: 0, modules: new Map() };
    e.minutes += min;
    e.modules.set(l.moduleId || "", (e.modules.get(l.moduleId || "") || 0) + min);
    byDay.set(l.date, e);
  });
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = addDays(start, w * 7 + d), e = byDay.get(date), minutes = e ? e.minutes : 0;
    const modules = e ? [...e.modules].map(([moduleId, min]) => ({ moduleId, minutes: min })).sort((a, b) => b.minutes - a.minutes) : [];
    return { date, minutes, level: level(minutes), future: date > today, modules };
  }));
}

/** Aktivitätsraster der letzten `weeks` Wochen: Spalten = Wochen ab Montag, Zeilen = Mo bis So. */
export function heatmap(logs, weeks = 26, today = iso()) {
  return dayGrid(logs, addDays(today, -wdIdx(today) - (weeks - 1) * 7), weeks, today);
}

/**
 * Semester, in dem `date` liegt (Wintersemester 1.10. bis 31.3., Sommersemester 1.4. bis 30.9.);
 * `offset` springt um ganze Semester zurück (negativ) oder vor.
 */
export function semesterOf(date = iso(), offset = 0) {
  const y = Number(date.slice(0, 4)), mo = Number(date.slice(5, 7));
  /* fortlaufende Nummer: Jahr * 2, + 1 fürs Wintersemester (das im Oktober beginnt) */
  let n = mo >= 10 ? y * 2 + 1 : mo >= 4 ? y * 2 : (y - 1) * 2 + 1;
  n += offset;
  const sy = Math.floor(n / 2), winter = n % 2 === 1;
  return winter
    ? { from: `${sy}-10-01`, to: `${sy + 1}-03-31`, label: `Wintersemester ${sy}/${String(sy + 1).slice(2)}`, short: `WiSe ${sy}/${String(sy + 1).slice(2)}` }
    : { from: `${sy}-04-01`, to: `${sy}-09-30`, label: `Sommersemester ${sy}`, short: `SoSe ${sy}` };
}

/** Lernzeit-Kalender eines Semesters: Spalten = Wochen (ab Montag), Zeilen = Mo bis So; Tage außerhalb tragen `outside`. */
export function semesterCalendar(logs, sem, today = iso()) {
  const start = addDays(sem.from, -wdIdx(sem.from));
  const weeks = Math.floor((Math.round((new Date(sem.to + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime()) / 86400000)) / 7) + 1;
  const inSem = logs.filter((l) => l.date >= sem.from && l.date <= sem.to);
  return dayGrid(inSem, start, weeks, today).map((col) => col.map((c) => (c.date < sem.from || c.date > sem.to ? { ...c, outside: true } : c)));
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
/** @type {Array<[string, number, number]>} */
export const DAYPARTS = [["Morgens", 5, 11], ["Mittags", 11, 14], ["Nachmittags", 14, 18], ["Abends", 18, 22], ["Nachts", 22, 29]];

/** Lernminuten nach Tageszeit (nur Einheiten mit Uhrzeit) und nach Wochentag */
export function learningRhythm(logs) {
  const parts = DAYPARTS.map(([label]) => ({ label, minutes: 0 }));
  const weekdays = Array.from({ length: 7 }, () => 0);
  let timed = 0;
  for (const l of logs) {
    const min = Number(l.minutes) || 0;
    if (!min || !l.date) continue;
    weekdays[wdIdx(l.date)] += min;
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
