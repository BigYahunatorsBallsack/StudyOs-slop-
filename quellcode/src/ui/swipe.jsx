/* Wischgeste für Listenzeilen: nach rechts wischen löst die Hauptaktion aus (z. B. „erledigt“).
   Ersetzt keine Bedienelemente: Jede Aktion bleibt auch per Knopf erreichbar (Tastatur, Screenreader). */
import React, { useRef, useState } from "react";

const THRESHOLD = 84;

export function SwipeRow({ className = "", style, onSwipeRight, rightLabel, children, ...rest }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);
  const swallowClick = useRef(false);

  const down = (e) => {
    if (!onSwipeRight || e.button > 0 || e.target.closest("select, input, textarea")) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  };
  const move = (e) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { st.current = null; return; } /* vertikales Scrollen */
      if (mx < 10) return;
      s.active = true; setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
    const d = Math.max(0, mx);
    setDx(d > THRESHOLD ? THRESHOLD + (d - THRESHOLD) * 0.35 : d);
  };
  const up = () => {
    const s = st.current; st.current = null;
    if (s && s.active) {
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
      if (dx >= THRESHOLD) {
        try { navigator.vibrate && navigator.vibrate(12); } catch {}
        onSwipeRight();
      }
    }
    setDragging(false); setDx(0);
  };

  return (
    <li className={`swipe ${dragging ? "dragging" : ""}`}>
      {onSwipeRight && <div className="swipe-under" style={{ opacity: dx > 4 ? Math.min(1, dx / THRESHOLD) : 0 }} aria-hidden="true">{dx >= THRESHOLD ? "✓ " : ""}{rightLabel}</div>}
      <div {...rest} className={`row ${className}`} style={{ ...style, transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } }}>
        {children}
      </div>
    </li>
  );
}
