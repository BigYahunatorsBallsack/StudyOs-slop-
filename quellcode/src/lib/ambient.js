/* Hintergrundklang für die Fokusphase: Noten der 8-Bit-Schleife (ohne Audio, damit testbar).
   Abgespielt wird in ui/ambient.js mit der Web-Audio-API, nichts wird heruntergeladen. */

export const AMBIENT_KINDS = [["off", "Aus"], ["chip", "8-Bit"], ["rain", "Regen"]];
export const ambientOf = (settings = {}) => (AMBIENT_KINDS.some(([k]) => k === settings.ambient) ? settings.ambient : "off");
export const ambientVolumeOf = (settings = {}) => { const v = Number(settings.ambientVolume); return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5; };

/** Frequenz einer MIDI-Note (69 = A4 = 440 Hz). */
export const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* Ruhige Akkordfolge in a-Moll (Am – F – C – G), je Akkord ein Takt aus 8 Achteln */
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
/* Arpeggio-Muster je Takt (Index in den Akkord, +3 = eine Oktave höher); -1 = Pause. Vier Varianten, damit es nicht leiert */
const ARPS = [[0, 1, 2, 3, 2, 1, 0, -1], [0, 2, 3, 2, 1, 2, 0, -1], [2, 1, 0, 1, 2, 3, -1, 2], [0, 1, 2, 1, 3, 2, 1, -1]];
export const STEPS_PER_BAR = 8;
export const LOOP_BARS = 16;

/**
 * Was auf einem Achtel-Schritt erklingt: Melodie (Rechteck), Bass (Dreieck, nur auf 1 und 5) und Hi-Hat (Rauschen).
 * Die Schleife ist 16 Takte lang; danach beginnt sie von vorn.
 */
export function chipStep(step) {
  const s = ((step % (STEPS_PER_BAR * LOOP_BARS)) + STEPS_PER_BAR * LOOP_BARS) % (STEPS_PER_BAR * LOOP_BARS);
  const bar = Math.floor(s / STEPS_PER_BAR), i = s % STEPS_PER_BAR;
  const chord = CHORDS[bar % CHORDS.length];
  const idx = ARPS[Math.floor(bar / CHORDS.length) % ARPS.length][i];
  const lead = idx < 0 ? null : chord[idx % 3] + 12 * (1 + Math.floor(idx / 3));
  const bass = i === 0 || i === 4 ? chord[0] - 12 : null;
  return { lead, bass, hat: i % 2 === 1 };
}
