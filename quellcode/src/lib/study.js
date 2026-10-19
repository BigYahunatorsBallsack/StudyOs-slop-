/* Studienalltag: Übungsblatt-Serien, Notenbonus-Prognose, Workload nach ECTS, Archiv */
import { DONE_HW } from "./constants.js";
import { addDays, diffDays, isHeld, iso, uid } from "./util.js";

/* ---------------- Übungsblätter als Serie ---------------- */

/** Zählt die Blattnummer hoch: „Blatt 4“ → „Blatt 5“, „Übungsblatt 04“ → „Übungsblatt 05“; ohne Zahl wird „ 2“, „ 3“ … angehängt. */
const NUMBER_AFTER_WORD = /(?:blatt|sheet|nr\.?|übung|uebung|aufgabe|hü|ha|woche|tutorium)\s*#?\s*(\d+)/i;
export function nextTitle(title, step = 1) {
  /* bevorzugt die Zahl nach „Blatt“, „Sheet“, „Nr.“ usw., sonst die letzte Zahl im Titel */
  const w = NUMBER_AFTER_WORD.exec(title);
  const m = w ? { 1: w[1], index: w.index + w[0].length - w[1].length } : /(\d+)(?!.*\d)/.exec(title);
  if (!m) return `${title} ${1 + step}`;
  const n = String(Number(m[1]) + step).padStart(m[1].length, "0");
  return title.slice(0, m.index) + n + title.slice(m.index + m[1].length);
}

/** Wöchentliche Blätter vom ersten Blatt bis `until` (Ausgabedatum), höchstens 20. */
export function buildHomeworkSeries(base, until) {
  const seriesId = uid(), out = [];
  for (let i = 0; i < 20; i++) {
    const issued = base.issued ? addDays(base.issued, 7 * i) : null;
    const due = addDays(base.due, 7 * i);
    if ((issued || due) > until) break;
    out.push({ ...base, id: uid(), seriesId, title: i ? nextTitle(base.title, i) : base.title, issued, due, status: i ? "ausgegeben" : base.status || "ausgegeben", points: i ? null : base.points ?? null, doneAt: null,
      ...(Array.isArray(base.subtasks) && { subtasks: i ? base.subtasks.map((s) => ({ ...s, id: uid(), done: false })) : base.subtasks }) });
  }
  return out;
}

/* ---------------- Notenbonus ---------------- */

/**
 * Prognose für den Notenbonus eines Moduls (Grenze in % der Übungspunkte).
 * Blätter ohne Maximalpunktzahl zählen mit dem Durchschnitt der bekannten.
 * @returns null ohne Bonusgrenze, sonst { state, pts, maxTotal, need, remaining, perSheet, needPct, currentPct }
 *          state: reached | ok | tight | impossible | open (noch nichts bewertet und keine Maxima)
 */
export function bonusForecast(data, moduleId) {
  const mod = data.modules.find((m) => m.id === moduleId);
  const limit = Number(mod?.bonusPct) || 0;
  if (!limit) return null;
  const hw = data.homework.filter((h) => h.moduleId === moduleId);
  const known = hw.filter((h) => Number(h.maxPoints) > 0);
  const avgMax = known.length ? known.reduce((s, h) => s + Number(h.maxPoints), 0) / known.length : 0;
  const maxOf = (h) => (Number(h.maxPoints) > 0 ? Number(h.maxPoints) : avgMax);
  const graded = hw.filter((h) => h.status === "bewertet");
  const open = hw.filter((h) => h.status !== "bewertet");
  const pts = graded.reduce((s, h) => s + (Number(h.points) || 0), 0);
  const gradedMax = graded.reduce((s, h) => s + maxOf(h), 0);
  const remainingMax = open.reduce((s, h) => s + maxOf(h), 0);
  const maxTotal = gradedMax + remainingMax;
  if (!maxTotal) return { state: "open", limit, pts, maxTotal: 0, need: 0, remaining: open.length, perSheet: null, needPct: null, currentPct: null };
  const need = Math.max(0, (limit / 100) * maxTotal - pts);
  const currentPct = gradedMax ? pts / gradedMax : null;
  const needPct = remainingMax ? need / remainingMax : need > 0 ? Infinity : 0;
  const state = need <= 0 ? "reached" : needPct > 1 ? "impossible" : currentPct !== null && needPct <= currentPct ? "ok" : "tight";
  return { state, limit, pts, maxTotal, need, remaining: open.length, perSheet: open.length ? need / open.length : null, needPct, currentPct };
}

/* ---------------- Workload nach ECTS ---------------- */

export const HOURS_PER_ECTS = 30;

const minutesOf = (s) => {
  const [a, b] = String(s.start || "0:0").split(":").map(Number), [c, d] = String(s.end || s.start || "0:0").split(":").map(Number);
  return Math.max(0, c * 60 + d - (a * 60 + b));
};

/**
 * Soll und Ist an Arbeitsstunden für ein Modul bis heute.
 * Soll: ECTS × 30 h, gleichmäßig über die Semesterwochen ab dem ersten Termin verteilt.
 * Ist: eingetragene Lernzeit plus Dauer besuchter Termine.
 */
export function workload(data, moduleId, today = iso()) {
  const mod = data.modules.find((m) => m.id === moduleId);
  const ects = Number(mod?.ects) || 0;
  if (!ects || mod.status !== "belegt") return null;
  const weeks = Math.max(4, Number(data.settings?.semesterWeeks) || 18);
  const ses = data.sessions.filter((s) => s.moduleId === moduleId && !s.cancelled);
  const start = mod.semesterStart || ses.map((s) => s.date).sort()[0];
  if (!start || start > today) return null;
  const elapsed = Math.min(weeks, (diffDays(start, today) + 1) / 7);
  const totalH = ects * HOURS_PER_ECTS;
  const sollH = (totalH * elapsed) / weeks;
  const selfMin = data.logs.filter((l) => l.moduleId === moduleId && l.date >= start && l.date <= today).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
  const presenceMin = ses.filter((s) => s.attended && isHeld(s) && s.date <= today).reduce((s, x) => s + minutesOf(x), 0);
  const istH = (selfMin + presenceMin) / 60;
  const ratio = sollH > 0 ? istH / sollH : 1;
  return { ects, weeks, start, elapsed, totalH, sollH, istH, selfH: selfMin / 60, presenceH: presenceMin / 60, ratio, perWeekH: totalH / weeks, state: ratio >= 0.9 ? "ok" : ratio >= 0.6 ? "warn" : "low" };
}

/* ---------------- Archiv ---------------- */

/** IDs archivierter Module (abgeschlossene Semester). */
export const archivedIds = (data) => new Set(data.modules.filter((m) => m.archived).map((m) => m.id));

/** Datenstand ohne Einträge archivierter Module – für Heute, Vorschläge und Erinnerungen. */
export function withoutArchived(data) {
  const arch = archivedIds(data);
  if (!arch.size) return data;
  const keep = (x) => !arch.has(x.moduleId);
  return { ...data, modules: data.modules.filter((m) => !m.archived), sessions: data.sessions.filter(keep), homework: data.homework.filter(keep), exams: data.exams.filter(keep), cards: data.cards.filter(keep), blocks: (data.blocks || []).filter(keep) };
}

/** Offene Hausaufgaben eines Moduls (für die Anzeige). */
export const openHomework = (data, moduleId) => data.homework.filter((h) => h.moduleId === moduleId && !DONE_HW.has(h.status));
