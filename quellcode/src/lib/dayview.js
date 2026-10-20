/* Rund um „Heute“: Zeitstrahl mit der nächsten freien Lücke, Vorschau auf morgen, ruhige Tage (Wochenende,
   Feiertag, vorlesungsfrei), die Restzeit des laufenden Termins und der Fokus auf einen einzelnen Eintrag. */
import { DONE_HW } from "./constants.js";
import { isActive } from "./data.js";
import { offDay } from "./holidays.js";
import { busyOn, toHM, toMin } from "./blocks.js";
import { addDays, byTime, wdIdx } from "./util.js";

/** Dauer lesbar: „45 min“, „1,5 h“, „1 h 20 min“ */
export function fmtSpan(min) {
  if (min < 60) return `${min} min`;
  if (min % 30 === 0) return `${String(min / 60).replace(".", ",")} h`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/**
 * Termine und Lernblöcke eines Tages für die schmale Leiste; Bereich mindestens 8 bis 18 Uhr, auf volle Stunden.
 * @returns {{ from: number, to: number, items: any[], now: number | null } | null} null ohne Einträge
 */
export function dayStrip(data, date, now, today = date) {
  const items = [
    ...data.sessions.filter((s) => s.date === date && isActive(s)).map((s) => ({ id: s.id, kind: "session", start: s.start, end: s.end || s.start, moduleId: s.moduleId, title: s.type, item: s })),
    ...(data.blocks || []).filter((b) => b.date === date).map((b) => ({ id: b.id, kind: "block", start: b.start, end: b.end, moduleId: b.moduleId, title: b.title, done: !!b.done, item: b })),
  ].filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start));
  if (!items.length) return null;
  const nowMin = date === today ? toMin(now) : null;
  const from = Math.min(8 * 60, Math.floor(toMin(items[0].start) / 60) * 60);
  const to = Math.max(18 * 60, Math.ceil(Math.max(...items.map((x) => toMin(x.end))) / 60) * 60);
  return { from, to: Math.min(24 * 60, to), items: items.map((x) => ({ ...x, past: nowMin !== null && toMin(x.end) <= nowMin, live: nowMin !== null && toMin(x.start) <= nowMin && nowMin < toMin(x.end) })), now: nowMin };
}

/**
 * Nächste freie Lücke ab jetzt (Termine, Prüfungen, Lernblöcke belegt) von mindestens `min` Minuten, bis `until`.
 * `to` ist null, wenn danach nichts mehr kommt.
 * @returns {{ from: string, to: string | null, minutes: number, now: boolean } | null}
 */
export function nextGap(data, date, now, { min = 30, until = "22:00" } = {}) {
  const iv = busyOn(data, date).map((b) => [toMin(b.start), toMin(b.end || b.start)]).sort((a, b) => a[0] - b[0]);
  const start = toMin(now), end = toMin(until);
  let cur = start;
  for (const [s, e] of iv) {
    if (e <= cur) continue;
    if (s - cur >= min) return { from: toHM(cur), to: toHM(s), minutes: s - cur, now: cur === start };
    cur = Math.max(cur, e);
  }
  if (cur >= end) return null;
  return { from: toHM(cur), to: null, minutes: end - cur, now: cur === start };
}

/** Text zur Lücke: „1,5 h frei bis 14:00“, „Ab 12:15 1 h frei bis 13:15“, „Ab 16:00 frei“, „Heute nichts mehr geplant“ */
export function gapText(g) {
  if (!g) return "";
  if (g.to) return g.now ? `${fmtSpan(g.minutes)} frei bis ${g.to}` : `Ab ${g.from} ${fmtSpan(g.minutes)} frei bis ${g.to}`;
  return g.now ? "Heute nichts mehr geplant" : `Ab ${g.from} frei`;
}

/**
 * Ab 18 Uhr: was morgen ansteht (erster Termin, Abgaben, Prüfungen). null vor 18 Uhr oder wenn morgen nichts ist.
 * @returns {{ date: string, first: any, homework: any[], exams: { e: any, retake: boolean }[] } | null}
 */
export function tomorrowPreview(data, today, now, from = "18:00") {
  if (now < from) return null;
  const date = addDays(today, 1);
  const first = data.sessions.filter((s) => s.date === date && isActive(s)).sort(byTime)[0] || null;
  const homework = data.homework.filter((h) => h.due === date && !h.missed && !DONE_HW.has(h.status)).sort((a, b) => (a.dueTime || "99").localeCompare(b.dueTime || "99"));
  const exams = [
    ...data.exams.filter((e) => e.date === date && e.result !== "bestanden").map((e) => ({ e, retake: false })),
    ...data.exams.filter((e) => e.retakeDate === date && e.result === "nicht bestanden").map((e) => ({ e, retake: true })),
  ];
  return first || homework.length || exams.length ? { date, first, homework, exams } : null;
}

/** Ruhiger Tag: Samstag, Sonntag, Feiertag oder vorlesungsfrei, und zwar nur, wenn an dem Tag kein Termin stattfindet. */
export function quietDay(date, settings, sessions) {
  if (wdIdx(date) < 5 && !offDay(date, settings)) return false;
  return !sessions.some((s) => s.date === date && isActive(s));
}

/** Bereiche, die an ruhigen Tagen ausgeblendet werden, wenn sie nichts Eigenes zu zeigen haben */
export const QUIET_HIDE = ["timeline", "plan", "commute", "mensa"];

/** Termin, der gerade läuft, mit Restminuten, oder null */
export function liveSession(sessions, date, now) {
  const n = toMin(now);
  const s = sessions.filter((x) => x.date === date && isActive(x) && x.start && toMin(x.start) <= n && n < toMin(x.end || x.start)).sort(byTime)[0];
  return s ? { s, left: toMin(s.end) - n } : null;
}

/* ---------- Fokus auf einen Eintrag (pro Gerät, nicht gesynct) ---------- */
export const FOCUS_KINDS = { homework: "homework", session: "sessions", block: "blocks" };

/**
 * Den gemerkten Fokus auflösen: Eintrag und ob er schon erledigt ist; null, wenn es ihn nicht mehr gibt.
 * @returns {{ kind: string, item: any, done: boolean } | null}
 */
export function resolveFocus(data, f) {
  if (!f || !FOCUS_KINDS[f.kind]) return null;
  const item = (data[FOCUS_KINDS[f.kind]] || []).find((x) => x.id === f.id);
  if (!item) return null;
  const done = f.kind === "homework" ? DONE_HW.has(item.status) || !!item.missed : f.kind === "session" ? !!item.reviewed || !!item.cancelled : !!item.done;
  return { kind: f.kind, item, done };
}

/* Gemerkt in localStorage dieses Geräts */
const FOCUS_KEY = "studyos-fokus";
export const FOCUS_EVENT = "studyos-fokus";
export function getFocus() {
  try { const f = JSON.parse(localStorage.getItem(FOCUS_KEY) || "null"); return f && f.kind && f.id ? f : null; } catch { return null; }
}
export function setFocus(f) {
  try { if (f) localStorage.setItem(FOCUS_KEY, JSON.stringify({ kind: f.kind, id: f.id })); else localStorage.removeItem(FOCUS_KEY); } catch { /* egal */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FOCUS_EVENT));
}
