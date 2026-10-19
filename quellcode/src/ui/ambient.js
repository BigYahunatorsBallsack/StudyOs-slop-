/* Hintergrundklang während der Fokusphase, komplett im Browser erzeugt (Web Audio): 8-Bit-Schleife oder Regen.
   Läuft nur, solange der Fokus-Timer läuft; blendet weich ein und aus. */
import { useEffect, useRef } from "react";
import { chipStep, freq } from "../lib/ambient.js";

const gainOf = (v) => 0.6 * v * v; /* Lautstärke fühlt sich quadratisch natürlicher an */

function noiseBuffer(ctx, seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

/* Töne werden bis zu LOOKAHEAD Sekunden im Voraus geplant: im Hintergrund feuern Intervalle seltener */
const LOOKAHEAD = 1.2, TICK = 200;

function playChip(ctx, out) {
  const eighth = 60 / 92 / 2;
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2600; tone.connect(out);
  const hatBuf = noiseBuffer(ctx, 0.05);
  const note = (type, midi, t, len, peak) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq(midi);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(tone); o.start(t); o.stop(t + len + 0.02);
  };
  const hat = (t) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = hatBuf; f.type = "highpass"; f.frequency.value = 7000; g.gain.value = 0.025;
    s.connect(f); f.connect(g); g.connect(out); s.start(t);
  };
  let step = 0, next = ctx.currentTime + 0.1;
  const schedule = () => {
    while (next < ctx.currentTime + LOOKAHEAD) {
      const { lead, bass, hat: h } = chipStep(step);
      if (lead) note("square", lead, next, eighth * 0.9, 0.06);
      if (bass) note("triangle", bass, next, eighth * 3.6, 0.14);
      if (h) hat(next);
      step++; next += eighth;
    }
  };
  schedule();
  const id = setInterval(schedule, TICK);
  return () => clearInterval(id);
}

function playRain(ctx, out) {
  const loop = (buf, type, hz, gain) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; s.loop = true; f.type = type; f.frequency.value = hz; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(out); s.start();
    return s;
  };
  const sources = [loop(noiseBuffer(ctx, 4, true), "lowpass", 900, 0.9), loop(noiseBuffer(ctx, 3), "bandpass", 3200, 0.05)];
  /* einzelne Tropfen: kurze, hohe Pieptöne in zufälligem Abstand */
  let next = ctx.currentTime + 0.2;
  const drops = () => {
    while (next < ctx.currentTime + LOOKAHEAD) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = next;
      o.type = "sine"; o.frequency.setValueAtTime(1800 + Math.random() * 1600, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.02, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.1);
      next += 0.08 + Math.random() * 0.5;
    }
  };
  drops();
  const id = setInterval(drops, TICK);
  return () => { clearInterval(id); sources.forEach((s) => { try { s.stop(); } catch { /* schon aus */ } }); };
}

export function useAmbient({ kind, playing, volume }) {
  const live = useRef(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  useEffect(() => {
    if (!playing || kind === "off") return;
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch { return; }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.setTargetAtTime(gainOf(volumeRef.current), ctx.currentTime, 0.6);
    master.connect(ctx.destination);
    live.current = { ctx, master };
    const stop = kind === "chip" ? playChip(ctx, master) : playRain(ctx, master);
    return () => {
      stop();
      live.current = null;
      try { master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); } catch { /* egal */ }
      setTimeout(() => { ctx.close?.().catch(() => {}); }, 600);
    };
  }, [kind, playing]);
  useEffect(() => {
    const l = live.current;
    if (l) l.master.gain.setTargetAtTime(Math.max(0.0001, gainOf(volume)), l.ctx.currentTime, 0.1);
  }, [volume]);
}
