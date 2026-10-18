/* Farbschema: dunkel, hell oder wie das System */
import { useEffect } from "react";

export function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && mq && mq.matches);
      root.dataset.theme = light ? "light" : "dark";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", light ? "#f2f0fa" : "#1b1830");
    };
    apply();
    if (theme === "system" && mq && mq.addEventListener) { mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply); }
  }, [theme]);
}
