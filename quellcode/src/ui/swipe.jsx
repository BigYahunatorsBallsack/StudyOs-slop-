/* Gesten für Listenzeilen: nach rechts wischen löst die Hauptaktion aus (z. B. „erledigt“), nach links verschiebt,
   lange drücken (oder Rechtsklick) öffnet das Schnellmenü.
   Ersetzt keine Bedienelemente: Jede Aktion bleibt auch per Knopf erreichbar (Tastatur, Screenreader). */
import React, { useEffect, useRef, useState } from "react";
import { buzz } from "./sfx.js";

const THRESHOLD = 84;
const LONG_MS = 480;

/** Handler und Zustand für eine Zeile; `bind` kommt auf das bewegte Element */
export function useSwipe({ onSwipeRight, onSwipeLeft, onLongPress }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);
  const swallowClick = useRef(false);
  const longAt = useRef(0);
  /* Zeile verschwindet während des Drückens (z. B. abgehakt auf einem anderen Gerät): kein Schnellmenü hinterher */
  useEffect(() => () => clearTimeout(st.current?.timer), []);

  const swallow = () => { swallowClick.current = true; setTimeout(() => { swallowClick.current = false; }, 0); };
  const fireLong = () => {
    if (Date.now() - longAt.current < 800) return; /* Android meldet langes Drücken zusätzlich als Kontextmenü */
    longAt.current = Date.now();
    buzz(10); /* hält sich an „Vibration“ in den Einstellungen */
    onLongPress();
  };
  const down = (e) => {
    if (e.button > 0 || e.target.closest("select, input, textarea, [role=combobox]")) return;
    const s = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false, timer: 0, long: false, dx: 0 };
    if (onLongPress && e.pointerType !== "mouse") s.timer = setTimeout(() => { s.long = true; st.current = null; swallowClick.current = true; fireLong(); }, LONG_MS);
    st.current = s;
  };
  const move = (e) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(s.timer);
    if (!s.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { st.current = null; return; } /* vertikales Scrollen */
      if (!((mx > 10 && onSwipeRight) || (mx < -10 && onSwipeLeft))) return;
      s.active = true; setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
    const d = Math.max(onSwipeLeft ? -Infinity : 0, Math.min(onSwipeRight ? Infinity : 0, mx));
    const a = Math.abs(d), damped = a > THRESHOLD ? THRESHOLD + (a - THRESHOLD) * 0.35 : a;
    s.dx = Math.sign(d) * damped; /* fürs Loslassen: der Zustand kann noch vom letzten Zeichnen stammen */
    setDx(s.dx);
  };
  const up = () => {
    const s = st.current; st.current = null;
    if (s) clearTimeout(s.timer);
    if (s && s.active) {
      swallow();
      if (Math.abs(s.dx) >= THRESHOLD) {
        buzz(12);
        (s.dx > 0 ? onSwipeRight : onSwipeLeft)();
      }
    }
    if (swallowClick.current && !(s && s.active)) setTimeout(() => { swallowClick.current = false; }, 0);
    setDragging(false); setDx(0);
  };
  const bind = {
    onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up,
    onClickCapture: (e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } },
    ...(onLongPress && { onContextMenu: (e) => { if (e.target.closest("a, input, textarea")) return; e.preventDefault(); clearTimeout(st.current?.timer); fireLong(); } }),
  };
  return { dx, dragging, bind };
}

/** Streifen unter der Zeile, der beim Wischen sichtbar wird */
export function SwipeUnder({ dx, rightLabel, leftLabel }) {
  if (!dx) return null;
  const left = dx < 0;
  return <div className={`swipe-under ${left ? "swipe-left" : ""}`} style={{ opacity: Math.min(1, Math.abs(dx) / THRESHOLD) }} aria-hidden="true">{Math.abs(dx) >= THRESHOLD ? (left ? "» " : "✓ ") : ""}{left ? leftLabel : rightLabel}</div>;
}

export function SwipeRow({ className = "", style, onSwipeRight, rightLabel, onSwipeLeft, leftLabel = "Verschieben", onLongPress, children, ...rest }) {
  const { dx, dragging, bind } = useSwipe({ onSwipeRight, onSwipeLeft, onLongPress });
  return (
    <li className={`swipe ${dragging ? "dragging" : ""}`}>
      <SwipeUnder dx={dx} rightLabel={rightLabel} leftLabel={leftLabel} />
      <div {...rest} className={`row ${className}`} style={{ ...style, transform: dx ? `translateX(${dx}px)` : undefined }} {...bind}>
        {children}
      </div>
    </li>
  );
}
