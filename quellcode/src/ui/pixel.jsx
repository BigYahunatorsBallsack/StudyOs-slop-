/* Pixel-Animationen des Retro-Themes: Münze beim Abhaken, Sonne und Mond über der Skyline.
   Bewegung nur als Antwort auf eine Aktion; bei „Aus“ und „Bewegung reduzieren“ bleibt alles still (retro.css). */
import React, { useEffect, useState } from "react";
import { playSfx } from "./sfx.js";
import { skyPos } from "../lib/progress.js";

const still = () => {
  const root = document.documentElement;
  if (root.dataset.theme !== "retro" || root.dataset.motion === "off") return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** Kleine Pixel-Grafik springt aus einem Element hoch und verschwindet (kind: coin, star). */
export function burst(target, kind = "coin") {
  playSfx("coin"); /* Ton auch ohne Animation, wenn eingeschaltet */
  if (typeof document === "undefined" || !target?.getBoundingClientRect || still()) return;
  const r = target.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = `px-burst px-burst-${kind}`;
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${Math.round(r.left + r.width / 2)}px`;
  el.style.top = `${Math.round(r.top + r.height / 2)}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** Sonne bzw. Mond über der Skyline, je nach Uhrzeit; springt alle 5 Minuten weiter, ohne Animation. */
export function Sky() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60000);
    return () => clearInterval(id);
  }, []);
  const p = skyPos(now);
  return <div className={`px-sky px-sky-${p.kind}`} style={{ "--sky-x": p.x, "--sky-y": p.y }} aria-hidden="true" />;
}
