/* Studienalltag: Übungsblatt-Serien, Notenbonus-Prognose, Workload nach ECTS, Archiv */
import { DONE_HW } from "./constants.js";
import { addDays, diffDays, fmtShort, isHeld, iso, uid } from "./util.js";
import { fmtWatch, parseWatch, watchProgress } from "./tum.js";
import { inBreak } from "./holidays.js";

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
/* Wöchentliche Blatt-Serie; Wochen, deren Abgabe in die vorlesungsfreie Zeit fiele, werden übersprungen (die Nummer zählt ohne Lücke weiter) */
export function buildHomeworkSeries(base, until, settings = null) {
  const seriesId = uid(), out = [];
  for (let w = 0; w < 40 && out.length < 20; w++) {
    const issued = base.issued ? addDays(base.issued, 7 * w) : null;
    const due = addDays(base.due, 7 * w);
    if ((issued || due) > until) break;
    if (w && settings && inBreak(due, settings)) continue;
    const i = out.length;
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
  /* „Besucht“-Einheiten nicht doppelt: Präsenz kommt unten direkt aus den Terminen */
  const selfMin = data.logs.filter((l) => l.moduleId === moduleId && l.kind !== "Besucht" && l.date >= start && l.date <= today).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
  const presenceMin = ses.filter((s) => s.attended && isHeld(s) && s.date <= today).reduce((s, x) => s + minutesOf(x), 0);
  const istH = (selfMin + presenceMin) / 60;
  const ratio = sollH > 0 ? istH / sollH : 1;
  /* Was bis Semesterende pro Woche nötig ist, um auf das volle ECTS-Soll zu kommen */
  const leftWeeks = weeks - elapsed;
  const needPerWeekH = leftWeeks > 0.5 ? Math.max(0, totalH - istH) / leftWeeks : null;
  /* Vorschlag fürs Wochenziel (zählt nur Lernzeit): Bedarf pro Woche minus die bisher übliche Präsenzzeit, auf halbe Stunden */
  const goalSuggestH = needPerWeekH === null ? null : Math.max(0.5, Math.round((needPerWeekH - presenceMin / 60 / Math.max(1, elapsed)) * 2) / 2);
  return { goalSuggestH, ects, weeks, start, elapsed, totalH, sollH, istH, selfH: selfMin / 60, presenceH: presenceMin / 60, ratio, perWeekH: totalH / weeks, gapH: sollH - istH, leftWeeks, needPerWeekH, state: ratio >= 0.9 ? "ok" : ratio >= 0.6 ? "warn" : "low" };
}

/** Arbeitsaufwand aller belegten Module im Vergleich, wer am weitesten hinter dem ECTS-Soll liegt, zuerst. */
export function workloadOverview(data, today = iso()) {
  return data.modules.filter((m) => !m.archived)
    .map((m) => ({ m, w: workload(data, m.id, today) }))
    .filter((x) => x.w)
    .sort((a, b) => a.w.ratio - b.w.ratio || b.w.gapH - a.w.gapH);
}

/* ---------------- Aufzeichnungen als Lernzeit ---------------- */

const nowHM = () => new Date().toTimeString().slice(0, 5);

/**
 * Aufzeichnungs-Lernzeit eines Termins an „angeschaut bis“ angleichen.
 * Weiter vorgestellt: die neuen Minuten kommen als Lerneinheit am heutigen Tag dazu.
 * Zurückgestellt oder gelöscht: die zu viel gezählten Minuten werden von den jüngsten Einheiten abgezogen
 * (leere Einheiten fallen weg). So zählt dieselbe Stelle nie doppelt.
 * @returns {{ logs: any[], delta: number }} delta in Minuten (positiv eingetragen, negativ abgezogen, 0 unverändert)
 */
export function syncWatchLogs(logs, s, today = iso()) {
  const sec = parseWatch(s?.watchedTo);
  if (!s?.id || (sec !== null && !Number.isFinite(sec))) return { logs, delta: 0 };
  const mine = (l) => l.sessionId === s.id && l.kind === "Aufzeichnung";
  const logged = logs.filter(mine).reduce((n, l) => n + (Number(l.minutes) || 0), 0);
  const target = s.moduleId && sec ? Math.floor(sec / 60) : 0;
  const delta = target - logged;
  if (delta >= 1) {
    const log = { id: uid(), moduleId: s.moduleId, topicId: "", sessionId: s.id, kind: "Aufzeichnung", date: today, at: nowHM(), minutes: delta, note: `${s.type || "Termin"} vom ${fmtShort(s.date)} angeschaut bis ${fmtWatch(sec)}`, created: today };
    return { logs: [...logs, log], delta };
  }
  if (delta >= 0) return { logs, delta: 0 };
  /* zu viel gezählt: von der jüngsten Einheit an abziehen */
  let over = -delta;
  const newest = logs.filter(mine).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || "").localeCompare(a.at || ""));
  const cut = new Map();
  for (const l of newest) {
    if (over <= 0) break;
    const take = Math.min(over, Number(l.minutes) || 0);
    cut.set(l.id, (Number(l.minutes) || 0) - take);
    over -= take;
  }
  const out = logs.flatMap((l) => (!cut.has(l.id) ? [l] : cut.get(l.id) >= 1 ? [{ ...l, minutes: cut.get(l.id) }] : []));
  return { logs: out, delta };
}

/** Besuchter Termin als Lerneinheit am Tag des Abhakens (Dauer aus Beginn und Ende, sonst 90 Minuten). */
export function presenceLog(s, today = iso()) {
  if (!s?.moduleId) return null;
  return { id: uid(), moduleId: s.moduleId, topicId: "", sessionId: s.id, kind: "Besucht", date: today, at: nowHM(), minutes: minutesOf(s) || 90, note: `${s.type || "Termin"} vom ${fmtShort(s.date)} besucht`, created: today };
}

/**
 * Besucht an- oder abhaken, samt Lerneinheit: An legt sie an (höchstens eine je Termin), Ab entfernt sie wieder.
 * @returns neuer Datenstand (ohne Zeitstempel; die setzt stampChanges)
 */
export function toggleAttended(data, id, today = iso()) {
  const s = data.sessions.find((x) => x.id === id);
  if (!s) return data;
  const on = !s.attended, mine = (l) => l.sessionId === id && l.kind === "Besucht";
  const sessions = data.sessions.map((x) => (x.id === id ? { ...x, attended: on } : x));
  const log = on && !data.logs.some(mine) ? presenceLog({ ...s, attended: on }, today) : null;
  const logs = on ? (log ? [...data.logs, log] : data.logs) : data.logs.filter((l) => !mine(l));
  return { ...data, sessions, logs };
}

/** Wie weit ein Termin wahrgenommen ist: besucht = 100 %, sonst der Anteil der angeschauten Aufzeichnung; null ohne beides. */
export function sessionCoverage(s) {
  if (s.attended) return { ratio: 1, label: "besucht" };
  const w = watchProgress(s);
  return w && w.ratio !== null ? { ratio: w.ratio, label: `${Math.round(w.ratio * 100)} % angeschaut` } : null;
}

/* ---------------- Lerntagebuch ---------------- */

/**
 * Lerneinheiten eines Moduls nach Tag gruppiert, neueste zuerst; innerhalb des Tages nach Uhrzeit absteigend.
 * @returns [{ date, minutes, logs }]
 */
export function studyDiary(logs, moduleId) {
  const byDay = new Map();
  logs.filter((l) => l.moduleId === moduleId && l.date).forEach((l) => { if (!byDay.has(l.date)) byDay.set(l.date, []); byDay.get(l.date).push(l); });
  return [...byDay].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({
    date,
    minutes: list.reduce((s, l) => s + (Number(l.minutes) || 0), 0),
    logs: list.sort((a, b) => (b.at || "").localeCompare(a.at || "") || (b.created || "").localeCompare(a.created || "")),
  }));
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
