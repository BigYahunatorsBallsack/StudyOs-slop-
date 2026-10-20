import { TIMER_KEY } from "./constants.js";

export function loadTimer() {
  const base = { mode: "focus", length: 25, brk: 5, running: false, endAt: 0, remaining: 25 * 60, moduleId: "", topicId: "" };
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!t || typeof t !== "object") return base;
    const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    const out = { ...base, mode: t.mode === "break" ? "break" : "focus", length: num(t.length, 25, 1, 180), brk: num(t.brk, 5, 1, 60), moduleId: String(t.moduleId || ""), topicId: String(t.topicId || ""), ...(t.kind && { kind: String(t.kind) }), ...(t.note && { note: String(t.note).slice(0, 200) }), ...(t.homeworkId && { homeworkId: String(t.homeworkId) }) };
    out.remaining = num(t.remaining, (out.mode === "focus" ? out.length : out.brk) * 60, 0, 180 * 60);
    if (t.running && Number(t.endAt) > Date.now() - 12 * 3600 * 1000) { out.running = true; out.endAt = Number(t.endAt); }
    return out;
  } catch { return base; }
}

/** Verbleibende Sekunden eines Timer-Zustands zum Zeitpunkt `now`. */
export const remainingOf = (t, now = Date.now()) => (t.running ? Math.max(0, Math.ceil((t.endAt - now) / 1000)) : t.remaining);
export const fullLength = (t) => (t.mode === "focus" ? t.length : t.brk) * 60;
export const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/**
 * Mittelpunkte der Blöcke des Pixel-Rings: `n` Blöcke im Uhrzeigersinn ab 12 Uhr auf einem Kreis mit Radius `r`
 * um (c, c), auf ein 2-px-Raster gerundet, damit die Kanten knackig bleiben.
 */
export function ringBlocks(n, r, c) {
  const snap = (v) => Math.round(v / 2) * 2;
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return { x: snap(c + r * Math.sin(a)), y: snap(c - r * Math.cos(a)) }; });
}
