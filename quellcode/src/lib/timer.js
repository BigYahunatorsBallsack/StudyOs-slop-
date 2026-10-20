import { TIMER_KEY } from "./constants.js";
import { canonical } from "./sync.js";

export function loadTimer() {
  const base = { mode: "focus", length: 25, brk: 5, running: false, endAt: 0, remaining: 25 * 60, moduleId: "", topicId: "" };
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!t || typeof t !== "object") return base;
    const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    const out = { ...base, mode: t.mode === "break" ? "break" : "focus", length: num(t.length, 25, 1, 180), brk: num(t.brk, 5, 1, 60), moduleId: String(t.moduleId || ""), topicId: String(t.topicId || ""), ...(t.kind && { kind: String(t.kind) }), ...(t.note && { note: String(t.note).slice(0, 200) }),
      ...(t.runId && { runId: String(t.runId).slice(0, 24) }), ...(t.blockId && { blockId: String(t.blockId) }) };
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

/* ---------------- Timer auf mehreren Geräten ----------------
   Mit Cloud-Sync liegt der Timer-Zustand zusätzlich in den Einstellungen (`settings.liveTimer`). Dort wird er wie jede
   Einstellung mit Zeitstempeln zusammengeführt: die jüngste Änderung gewinnt, egal welches Gerät. Das Ende einer laufenden
   Phase steht in Serverzeit (Geräteuhr plus Versatz), damit eine falsch gehende Uhr die Restzeit nicht verschiebt.
   Jeder Fokus-Durchgang trägt eine Kennung (`runId`); die Lerneinheit dazu heißt danach, damit sie nur einmal entsteht. */

const LIVE_FIELDS = ["mode", "length", "brk", "moduleId", "topicId", "kind", "note", "blockId"];

/** Timer-Zustand als synchronisierter Eintrag; `offset` = Versatz der Geräteuhr zur Serverzeit in ms. */
export function toLive(t, offset = 0) {
  const out = { id: t.runId || "", running: !!t.running };
  for (const k of LIVE_FIELDS) if (t[k] !== undefined && t[k] !== null && t[k] !== "") out[k] = t[k];
  if (t.running) out.endAt = Math.round(t.endAt + offset); else out.remaining = t.remaining;
  return out;
}

/** Gegenstück zu toLive: übernimmt den Eintrag eines anderen Geräts in den lokalen Zustand `base`. */
export function fromLive(live, base, offset = 0, now = Date.now()) {
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const mode = live.mode === "break" ? "break" : "focus";
  const length = num(live.length, base.length, 1, 180), brk = num(live.brk, base.brk, 1, 60);
  const out = { ...base, mode, length, brk, moduleId: String(live.moduleId || ""), topicId: String(live.topicId || "") };
  for (const k of ["kind", "note", "blockId"]) { if (live[k]) out[k] = String(live[k]); else delete out[k]; }
  if (live.id) out.runId = String(live.id); else delete out.runId;
  const endAt = Number(live.endAt) - offset;
  if (live.running && Number.isFinite(endAt) && endAt > now - 12 * 3600 * 1000) { out.running = true; out.endAt = endAt; }
  else { out.running = false; out.endAt = 0; out.remaining = num(live.remaining, (mode === "focus" ? length : brk) * 60, 0, 180 * 60); }
  return out;
}

/** Vergleichsschlüssel eines Eintrags (gleicher Inhalt ergibt denselben Text). */
export const liveKey = (live) => (live ? canonical(live) : "");

/** Kennung der Lerneinheit zu einem Fokus-Durchgang (beide Geräte kommen auf dieselbe). */
export const focusLogId = (runId) => (runId ? "fokus" + String(runId).replace(/[^\w-]/g, "") : "");
