/* Lernblöcke: geplante Lernzeit in freien Lücken zwischen Lehrveranstaltungen */
import { DONE_HW } from "./constants.js";
import { addDays, iso, wdIdx } from "./util.js";

export const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Freie Lücken eines Tages zwischen `from` und `to` (ohne Termine, Prüfungen und vorhandene Blöcke),
 * mit `gap` Minuten Abstand zu Terminen (Weg, Pause) und mindestens `min` Minuten Länge.
 */
export function freeGaps(busy, { from = "08:00", to = "19:00", gap = 15, min = 60 } = {}) {
  const iv = busy.map((b) => [toMin(b.start) - gap, toMin(b.end || b.start) + gap]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = toMin(from);
  const end = toMin(to);
  for (const [s, e] of iv) {
    if (s - cur >= min) out.push({ start: toHM(cur), end: toHM(Math.min(s, end)) });
    cur = Math.max(cur, e);
    if (cur >= end) break;
  }
  if (end - cur >= min) out.push({ start: toHM(cur), end: toHM(end) });
  return out.filter((g) => toMin(g.end) - toMin(g.start) >= min);
}

/** Belegte Zeiten eines Tages (Termine, Prüfungen mit Uhrzeit, Lernblöcke) */
export function busyOn(data, date) {
  return [
    ...data.sessions.filter((s) => s.date === date && !s.cancelled),
    ...data.exams.filter((e) => e.date === date && e.time).map((e) => ({ start: e.time, end: toHM(Math.min(23 * 60 + 59, toMin(e.time) + 120)) })),
    ...(data.blocks || []).filter((b) => b.date === date),
  ];
}

/** Worum es im Block gehen sollte: Nachbereitung des Termins davor, sonst die nächste offene Abgabe, sonst Karten */
function topicFor(data, date, start) {
  const before = data.sessions.filter((s) => s.date === date && !s.cancelled && !s.reviewed && toMin(s.end) <= toMin(start)).sort((a, b) => toMin(b.end) - toMin(a.end))[0];
  if (before) return { moduleId: before.moduleId, title: `${before.type} nachbereiten`, kind: "Nacharbeiten" };
  const hw = data.homework.filter((h) => !DONE_HW.has(h.status) && h.due >= date).sort((a, b) => a.due.localeCompare(b.due))[0];
  if (hw) return { moduleId: hw.moduleId, title: hw.title, kind: "Übung/Hausaufgabe" };
  return { moduleId: "", title: "Karteikarten und Wiederholung", kind: "Karteikarten" };
}

/**
 * Vorschläge für die Tage ab heute: in Lücken an Tagen mit Lehrveranstaltungen (dort ist man ohnehin an der Uni),
 * höchstens zwei pro Tag, je höchstens 90 Minuten.
 */
export function suggestBlocks(data, days, now = new Date()) {
  const today = iso(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];
  for (const date of days) {
    if (date < today || wdIdx(date) > 4) continue;
    if (!data.sessions.some((s) => s.date === date && !s.cancelled)) continue;
    const first = Math.min(...data.sessions.filter((s) => s.date === date && !s.cancelled).map((s) => toMin(s.start)));
    const gaps = freeGaps(busyOn(data, date), { from: toHM(Math.max(first, date === today ? Math.ceil((nowMin + 5) / 15) * 15 : 0)) });
    for (const g of gaps.slice(0, 2)) {
      const end = toHM(Math.min(toMin(g.end), toMin(g.start) + 90));
      out.push({ date, start: g.start, end, ...topicFor(data, date, g.start) });
    }
  }
  return out;
}

/** Blöcke als Fristen für Erinnerungen (10 Minuten vorher) in den nächsten 14 Tagen */
export const blockReminders = (data, mod, today = iso()) => (data.blocks || [])
  .filter((b) => !b.done && b.date >= today && b.date <= addDays(today, 14))
  .map((b) => ({ id: b.id, kind: "block", title: b.title || "Lernblock", module: mod(b.moduleId), date: b.date, time: b.start }));
