/* Farbschema: dunkel, hell, retro oder wie das System; fx = Animationsstil im Retro-Theme (arcade, crt, glitch, off) */
import { useEffect, useRef } from "react";

export function useTheme(theme, fx = "arcade") {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && mq && mq.matches);
      const name = theme === "retro" ? "retro" : light ? "light" : "dark";
      root.dataset.theme = name;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", { light: "#f2f0fa", dark: "#1b1830", retro: "#0d0221" }[name]);
    };
    apply();
    if (theme === "system" && mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
  }, [theme]);
  // Neuer Stil: Bildschirmwechsel einmal abspielen, damit man ihn in den Einstellungen gleich sieht
  const first = useRef(true);
  useEffect(() => {
    document.documentElement.dataset.fx = fx;
    if (first.current) { first.current = false; return; }
    const view = document.querySelector(".view");
    if (view) { view.style.animation = "none"; void view.offsetWidth; view.style.animation = ""; }
  }, [fx]);
}
