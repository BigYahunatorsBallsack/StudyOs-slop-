/* Lädt Formel- und Code-Darstellung (dist/extras.js + KaTeX-CSS) erst bei Bedarf. */
import { useEffect, useState } from "react";

let promise = null;
export function loadExtras() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.StudyExtras) return Promise.resolve(window.StudyExtras);
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "./katex/katex.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "./extras.js"; s.async = true;
    s.onload = () => resolve(window.StudyExtras || null);
    s.onerror = () => { promise = null; reject(new Error("Formeln konnten nicht geladen werden.")); };
    document.head.appendChild(s);
  });
  return promise;
}

/** Liefert die Darstellungsfunktionen, sobald sie geladen sind (vorher null). */
export function useExtras(needed) {
  const [x, setX] = useState(() => (typeof window !== "undefined" ? window.StudyExtras || null : null));
  useEffect(() => {
    if (!needed || x) return;
    let live = true;
    loadExtras().then((v) => { if (live) setX(v); }).catch(() => {});
    return () => { live = false; };
  }, [needed, x]);
  return x;
}

export const needsExtras = (text) => /```|\$[^$\n]+\$|\$\$/.test(String(text || ""));
