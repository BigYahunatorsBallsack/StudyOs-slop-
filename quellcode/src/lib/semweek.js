/* Kalenderwoche und Vorlesungswoche („KW 43 · VL-Woche 3 von 15“). Die Vorlesungszeit kommt an der TUM aus den bekannten
   Semesterterminen, sonst aus den Lücken zwischen eigenen vorlesungsfreien Zeiträumen oder dem Semesterbeginn der belegten Module.
   Wochen, deren Werktage alle vorlesungsfrei sind (z. B. Weihnachtspause), zählen nicht mit. */
import { addDays, isoWeek, weekStart } from "./util.js";
import { breakOf, breaksOf, isTum } from "./holidays.js";

/* Vorlesungszeit an der TUM laut tum.de („Termine und Fristen“), passend zu TUM_BREAKS */
export const TUM_LECTURES = [
  { from: "2026-10-19", to: "2027-02-05" },
  { from: "2027-04-12", to: "2027-07-16" },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const weeksBetween = (a, b) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / (7 * 86400000));

/**
 * Bekannte Vorlesungszeiten. `to` ist null, wenn nur der Beginn bekannt ist.
 * @param {{ settings?: any, modules?: any[] }} [data]
 * @returns {Array<{ from: string, to: string | null }>}
 */
export function lecturePeriods(data = {}) {
  const settings = data.settings || {};
  /** @type {Array<{ from: string, to: string | null }>} */
  const out = isTum(settings) && settings.tumBreaks !== false ? [...TUM_LECTURES] : [];
  const brk = breaksOf(settings).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  const inside = (d) => out.some((p) => p.from <= d && (!p.to || d <= p.to));
  /* Lücke zwischen zwei Ferien, die nach einem Semester aussieht (6 bis 22 Wochen) */
  for (let i = 1; i < brk.length; i++) {
    const from = addDays(brk[i - 1].to, 1), to = addDays(brk[i].from, -1), w = weeksBetween(from, to);
    if (w >= 6 && w <= 22 && !inside(from)) out.push({ from, to });
  }
  /* Semesterbeginn aus den Modulen; Ende vor den nächsten Ferien, falls bekannt */
  const starts = [...new Set((data.modules || []).filter((m) => m.status === "belegt" && DAY.test(m.semesterStart || "")).map((m) => m.semesterStart))].sort();
  for (const from of starts) {
    if (inside(from)) continue;
    const next = brk.find((b) => b.from > from);
    out.push({ from, to: next && weeksBetween(from, next.from) <= 26 ? addDays(next.from, -1) : null });
  }
  return out;
}

/* Alle Werktage der Woche ab `mon` vorlesungsfrei (oder außerhalb der Vorlesungszeit)? */
const weekOff = (mon, settings, p) => [0, 1, 2, 3, 4].every((i) => { const d = addDays(mon, i); return (p && (d < p.from || (p.to && d > p.to))) || !!breakOf(d, settings); });

/**
 * Kalenderwoche und Vorlesungswoche für die Woche, in der `date` liegt.
 * @param {string} date
 * @param {{ settings?: any, modules?: any[] }} [data]
 * @returns {{ kw: number, week: number | null, total: number | null, off: boolean }}
 */
export function semWeek(date, data = {}) {
  const settings = data.settings || {}, mon = weekStart(date), kw = isoWeek(mon);
  /* eine Vorlesungszeit ohne bekanntes Ende gilt höchstens 20 Wochen */
  const p = lecturePeriods(data).find((x) => weekStart(x.from) <= mon && (x.to ? mon <= x.to : weeksBetween(weekStart(x.from), mon) < 20));
  if (!p) return { kw, week: null, total: null, off: weekOff(mon, settings, null) };
  if (weekOff(mon, settings, p)) return { kw, week: null, total: null, off: true };
  let week = 0, total = 0;
  const last = p.to ? weekStart(p.to) : mon;
  for (let w = weekStart(p.from); w <= last; w = addDays(w, 7)) {
    if (weekOff(w, settings, p)) continue;
    total++;
    if (w <= mon) week++;
  }
  return { kw, week, total: p.to ? total : null, off: false };
}

/**
 * Kurzform für Kopfzeilen: „KW 43 · VL-Woche 3 von 15“, in den Ferien „KW 7 · vorlesungsfrei“, sonst „KW 40“.
 * @param {string} date
 * @param {{ settings?: any, modules?: any[] }} [data]
 */
export function semWeekLabel(date, data = {}) {
  const s = semWeek(date, data);
  return `KW ${s.kw}${s.week ? ` · VL-Woche ${s.week}${s.total ? ` von ${s.total}` : ""}` : s.off ? " · vorlesungsfrei" : ""}`;
}
