/* Modulfarben: Ein neues Modul bekommt die Palettenfarbe, die sich von den Farben der aktiven Module am stärksten
   unterscheidet (Abstand im OKLab-Farbraum, der etwa dem Seheindruck folgt). Bestehende Farben bleiben, wie sie sind. */
import { PALETTE } from "./constants.js";

function oklab(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Aktiv = nicht archiviert und nicht abgeschlossen (bestanden bzw. endgültig nicht bestanden). */
export const isActiveModule = (m) => !!m && !m.archived && m.status !== "bestanden" && m.status !== "nicht bestanden";

/**
 * Farbe für ein neues Modul: die Palettenfarbe mit dem größten Mindestabstand zu den Farben der aktiven Module.
 * `batch`: im selben Zug neu angelegte Module, die unabhängig vom Status zählen (z. B. beim Einrichten mit
 * vergangenen Semestern). Ohne Vergleichsfarben die erste noch unbenutzte; bei Gleichstand gilt die Reihenfolge der Palette.
 */
export function pickColor(modules = [], batch = [], palette = PALETTE) {
  const used = [...modules.filter(isActiveModule), ...batch].map((m) => oklab(m.color)).filter(Boolean);
  if (!used.length) {
    const taken = new Set(modules.map((m) => String(m.color || "").toLowerCase()));
    return palette.find((c) => !taken.has(c.toLowerCase())) || palette[0];
  }
  let best = palette[0], score = -1;
  for (const c of palette) {
    const p = oklab(c);
    const d = Math.min(...used.map((u) => dist(p, u)));
    if (d > score + 1e-9) { best = c; score = d; }
  }
  return best;
}
