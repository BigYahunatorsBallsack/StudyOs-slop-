/* Semesterleiste: alle Wochen des laufenden Semesters mit Vorlesungswoche, Prüfungen, Abgaben, Ferien und Feiertagen.
   An der TUM gelten die bekannten Semestergrenzen, sonst die Vorlesungszeit (aus Ferien oder Semesterbeginn) plus drei Prüfungswochen. */
import { isOpenHw } from "./data.js";
import { breakOf, holidayOf, isTum } from "./holidays.js";
import { lecturePeriods, semWeek } from "./semweek.js";
import { TUM_SEMESTERS, uniDates } from "./tumdates.js";
import { addDays, iso, weekStart } from "./util.js";

/* Ab so vielen offenen Abgaben gilt eine Woche als voll */
export const BUSY_HW = 3;

/**
 * Zeitraum des laufenden Semesters, oder null, wenn keiner bekannt ist.
 * @returns {{ from: string, to: string, label: string } | null}
 */
export function semesterSpan(data = {}, today = iso()) {
  const settings = data.settings || {};
  if (isTum(settings) && settings.tumBreaks !== false) {
    const s = TUM_SEMESTERS.find((x) => x.from <= today && today <= x.to);
    if (s) return s;
  }
  const weeks = Math.max(4, Number(settings.semesterWeeks) || 18);
  const spans = lecturePeriods(data).map((p) => ({ from: p.from, to: p.to ? addDays(p.to, 21) : addDays(p.from, weeks * 7 - 1), label: "Semester" }))
    .sort((a, b) => a.from.localeCompare(b.from));
  return spans.find((x) => x.from <= today && today <= x.to) || spans.filter((x) => x.from <= today).pop() || spans.find((x) => x.from > today) || null;
}

/**
 * Wochen eines Semesters (Montag bis Sonntag) mit allem, was die Leiste zeigt.
 * @returns {Array<{ mon: string, kw: number, week: number | null, off: boolean, offLabel: string, holidays: string[], exams: number, hw: number, uni: string[], current: boolean }>}
 */
export function semesterWeeks(data, span, today = iso()) {
  if (!span) return [];
  const settings = data.settings || {}, uni = uniDates(settings), out = [];
  for (let mon = weekStart(span.from); mon <= span.to && out.length < 30; mon = addDays(mon, 7)) {
    const sun = addDays(mon, 6), inWeek = (d) => !!d && d >= mon && d <= sun;
    const work = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
    const s = semWeek(mon, data);
    const brk = work.map((d) => breakOf(d, settings)).find(Boolean);
    out.push({
      mon, kw: s.kw, week: s.week, off: s.off || work.every((d) => breakOf(d, settings) || holidayOf(d)),
      offLabel: brk ? brk.label : "",
      holidays: work.map(holidayOf).filter(Boolean),
      exams: (data.exams || []).filter((e) => inWeek(e.date) || (e.result === "nicht bestanden" && inWeek(e.retakeDate))).length,
      hw: (data.homework || []).filter((h) => inWeek(h.due) && isOpenHw(h)).length,
      uni: uni.filter((x) => inWeek(x.date)).map((x) => x.title),
      current: mon === weekStart(today),
    });
  }
  return out;
}
