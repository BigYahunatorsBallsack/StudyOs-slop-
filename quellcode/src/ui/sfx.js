/* 8-Bit-Klickgeräusche, im Browser erzeugt (Web Audio, nichts wird geladen). Voreinstellung aus; eingeschaltet unter
   Daten & Einstellungen. Es klingt nur, wenn du etwas tust: beim Abhaken eine Münze, bei einem neuen Abzeichen eine Fanfare. */
import { SFX } from "../lib/sfx.js";
import { freq } from "../lib/ambient.js";

let enabled = false, ctx = null;
/** Von der App gesetzt, sobald sich die Einstellung ändert. */
export function setSfxEnabled(on) { enabled = !!on; }

/* Kurzes Vibrieren beim Abhaken am Handy: nur auf diesem Gerät gemerkt, Voreinstellung an */
const HAPTIC_KEY = "studyos-vibration";
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
export const hapticsOn = () => { try { return localStorage.getItem(HAPTIC_KEY) !== "aus"; } catch { return true; } };
export const setHapticsOn = (on) => { try { localStorage.setItem(HAPTIC_KEY, on ? "an" : "aus"); } catch { /* egal */ } };
/** Vibriert kurz, wenn eingeschaltet und vom Browser unterstützt. */
export function buzz(ms = 15) {
  if (!canVibrate() || !hapticsOn()) return;
  try { navigator.vibrate(ms); } catch { /* ohne Vibration weiter */ }
}

/** Spielt einen Klang; `force` für die Vorschau beim Einschalten. Die Münze (Abhaken) vibriert dazu kurz. */
export function playSfx(kind, force = false) {
  if (kind === "coin" && !force) buzz();
  if ((!enabled && !force) || typeof window === "undefined") return;
  const notes = SFX[kind];
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!notes || !AC) return;
  try {
    ctx ||= new AC();
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + 0.01, out = ctx.createGain();
    out.gain.value = 0.12; out.connect(ctx.destination);
    for (const [midi, at, len, type = "square"] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + at;
      o.type = type; o.frequency.value = freq(midi);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.02);
    }
  } catch { /* ohne Ton weiter */ }
}
