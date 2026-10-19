/* Farbschema: dunkel, hell, retro oder wie das System; bei Retro zusätzlich die Animationsvariante */
import { useEffect } from "react";

export const RETRO_MOTIONS = ["arcade", "crt", "glitch", "off"];

export function useTheme(theme, motion) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && mq && mq.matches);
      const name = theme === "retro" ? "retro" : light ? "light" : "dark";
      root.dataset.theme = name;
      if (name === "retro") root.dataset.motion = RETRO_MOTIONS.includes(motion) ? motion : "arcade";
      else delete root.dataset.motion;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", { light: "#f2f0fa", dark: "#1b1830", retro: "#0d0221" }[name]);
    };
    apply();
    if (theme === "system" && mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
  }, [theme, motion]);
}
