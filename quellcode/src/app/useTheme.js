/* Farbschema: StudyOS hat nur noch „Retro“ (data-theme steht schon in index.html); dazu die Animationsvariante, die Farbpalette und die Schriftgröße */
import { useEffect, useState } from "react";

export const RETRO_MOTIONS = ["pixel", "neon", "scan", "off"];
/* Varianten aus 2.7.x (arcade, crt, glitch) auf die Nachfolger abbilden */
const OLD = { arcade: "pixel", crt: "neon", glitch: "scan" };
export const retroMotionOf = (v) => (RETRO_MOTIONS.includes(v) ? v : OLD[v] || "pixel");

/* Farbpaletten: Name, Beschriftung, Hintergrund (für die Browser-Leiste) */
export const RETRO_PALETTES = [["synthwave", "Synthwave", "#0d0221"], ["gameboy", "Gameboy", "#0b2a0b"], ["amber", "Bernstein", "#140b00"], ["cga", "CGA", "#000000"], ["papier", "Papier", "#f3ead3"]];
export const retroPaletteOf = (v) => (RETRO_PALETTES.some(([k]) => k === v) ? v : "synthwave");

/* Schriftgröße: skaliert über die Grundschrift alles, was in rem gesetzt ist (Text, Abstände, Knöpfe) */
export const UI_SIZES = [["compact", "Kompakt"], ["normal", "Normal"], ["large", "Groß"]];
export const uiSizeOf = (v) => (UI_SIZES.some(([k]) => k === v) ? v : "normal");
function applySize(v) {
  const root = document.documentElement;
  if (v === "normal") delete root.dataset.size; else root.dataset.size = v;
}

/* Die Palette merkt sich das Gerät zusätzlich, damit beim Start nicht kurz die Standardfarben aufblitzen */
const PALETTE_KEY = "studyos-palette", SIZE_KEY = "studyos-groesse";
function applyPalette(p) {
  const root = document.documentElement;
  if (p === "synthwave") delete root.dataset.palette; else root.dataset.palette = p;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", RETRO_PALETTES.find(([k]) => k === p)[2]);
  /* iOS-Statusleiste: auf hellem Papier dunkle Schrift (greift dort erst beim nächsten Start der Web-App) */
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute("content", p === "papier" ? "default" : "black-translucent");
}
if (typeof document !== "undefined") {
  try {
    const p = localStorage.getItem(PALETTE_KEY), z = localStorage.getItem(SIZE_KEY);
    if (p) applyPalette(retroPaletteOf(p));
    if (z) applySize(uiSizeOf(z));
  } catch { /* ohne Speicher: Standard */ }
}

export function useTheme(motion, palette) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "retro";
    root.dataset.motion = retroMotionOf(motion);
  }, [motion]);
  useEffect(() => {
    if (palette === undefined) return; /* noch nicht geladen oder nie gewählt: beim gemerkten Stand bleiben */
    const p = retroPaletteOf(palette);
    applyPalette(p);
    try { localStorage.setItem(PALETTE_KEY, p); } catch { /* egal */ }
  }, [palette]);

}

/** Schriftgröße gilt nur für dieses Gerät (Handy und Laptop brauchen oft verschiedene), darum nicht in den Einstellungen. */
export function useUiSize() {
  const [size, setSize] = useState(() => { try { return uiSizeOf(localStorage.getItem(SIZE_KEY)); } catch { return "normal"; } });
  const set = (v) => {
    const z = uiSizeOf(v);
    setSize(z);
    applySize(z);
    try { localStorage.setItem(SIZE_KEY, z); } catch { /* egal */ }
  };
  return [size, set];
}
