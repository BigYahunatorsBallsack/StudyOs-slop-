/* Farbschema: StudyOS hat nur noch „Retro“ (data-theme steht schon in index.html); dazu die Animationsvariante */
import { useEffect } from "react";

export const RETRO_MOTIONS = ["pixel", "neon", "scan", "off"];
/* Varianten aus 2.7.x (arcade, crt, glitch) auf die Nachfolger abbilden */
const OLD = { arcade: "pixel", crt: "neon", glitch: "scan" };
export const retroMotionOf = (v) => (RETRO_MOTIONS.includes(v) ? v : OLD[v] || "pixel");

export function useTheme(motion) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "retro";
    root.dataset.motion = retroMotionOf(motion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#0d0221");
  }, [motion]);
}
