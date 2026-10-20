/* Wochenraster: Uhrzeit aus einer Tipp-Position, Verschieben und Verlängern per Ziehen */
import { toHM } from "./blocks.js";

export const SNAP = 15;
const DAY_END = 23 * 60 + 59;
export const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export const snap = (min, step = SNAP) => Math.round(min / step) * step;

/**
 * Sichtbare Stunden des Wochenrasters aus Einträgen mit `start`/`end`: eine Stunde vor dem frühesten Beginn bis zum
 * spätesten Ende, mindestens `minSpan` Stunden; ohne Einträge 8–18 Uhr. Ergebnis { startH, endH } innerhalb 0–24.
 */
export function hourRange(items, minSpan = 8) {
  const timed = (items || []).filter((x) => x && x.start);
  if (!timed.length) return { startH: 8, endH: 18 };
  let startH = Math.max(0, Math.floor(Math.min(...timed.map((x) => toMin(x.start))) / 60) - 1);
  let endH = Math.min(24, Math.ceil(Math.max(...timed.map((x) => Math.max(toMin(x.start), toMin(x.end || x.start)))) / 60));
  if (endH - startH < minSpan) { endH = Math.min(24, startH + minSpan); startH = Math.max(0, endH - minSpan); }
  return { startH, endH };
}

/** Beginn für einen Tipp auf eine freie Stelle: auf die Viertelstunde davor, innerhalb des Tages */
export const slotAt = (min) => Math.max(0, Math.min(DAY_END - 60, Math.floor(min / SNAP) * SNAP));

/**
 * Neue Lage beim Ziehen. `mode` „move“ verschiebt Beginn und Ende gleich weit, „resize“ zieht nur das Ende.
 * Ergebnis bleibt im selben Tag (00:00–23:59) und ist mindestens 15 Minuten lang.
 */
export function dragTo({ start, end }, mode, deltaMin) {
  const s0 = toMin(start), e0 = Math.max(s0 + SNAP, toMin(end || start));
  const d = snap(deltaMin);
  if (mode === "resize") return { start: toHM(s0), end: toHM(Math.min(DAY_END, Math.max(s0 + SNAP, snap(e0 + d)))) };
  const len = e0 - s0;
  const s = Math.max(0, Math.min(DAY_END - len, snap(s0 + d)));
  return { start: toHM(s), end: toHM(Math.min(DAY_END, s + len)) };
}

/** Patch für einen verschobenen Termin oder Lernblock; Abo-Termine merken sich die geänderten Felder (`locked`) */
export function movePatch(item, next) {
  const p = {};
  ["date", "start", "end"].forEach((k) => { if (next[k] !== undefined && next[k] !== item[k]) p[k] = next[k]; });
  if (item.feedKey && Object.keys(p).length) p.locked = [...new Set([...(item.locked || []), ...Object.keys(p)])];
  return p;
}
