/* Einklappbare Abschnitte auf „Heute“: der Zustand bleibt auf dem Gerät; beim Schließen erst ausblenden, wenn die Animation durch ist */
import React, { useLayoutEffect, useRef, useState } from "react";

const CLOSED_KEY = "studyos-heute-zu";
const readClosed = () => { try { const v = JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

export function Group({ id, title, count, action, className = "", children }) {
  const [phase, setPhase] = useState(() => (readClosed().includes(id) ? "closed" : "open"));
  const body = useRef(null);
  const open = phase === "open" || phase === "opening";
  const toggle = () => {
    try { const s = new Set(readClosed()); if (open) s.add(id); else s.delete(id); localStorage.setItem(CLOSED_KEY, JSON.stringify([...s])); } catch { /* egal */ }
    setPhase(open ? "closing" : "opening");
  };
  const settle = () => setPhase((p) => (p === "closing" ? "closed" : p === "opening" ? "open" : p));
  // ohne Animation (anderes Farbschema, „Bewegung reduzieren“) gibt es kein animationend: dann sofort fertig
  useLayoutEffect(() => {
    if (phase !== "closing" && phase !== "opening") return;
    const name = body.current ? getComputedStyle(body.current).animationName : "none";
    if (!name || name === "none") settle();
  }, [phase]);
  const onEnd = (e) => { if (e.target === e.currentTarget) settle(); };
  const bodyId = `heute-${id}`;
  return (
    <section className={`group group-${id} ${className}`}>
      <div className="group-head">
        <h3 className="section-title">
          <button className="group-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            {title}{count !== undefined && <span className="count">{count}</span>}<span className="group-caret" aria-hidden="true" />
          </button>
        </h3>
        {action}
      </div>
      <div id={bodyId} ref={body} className={`group-body group-${phase}`} hidden={phase === "closed"} onAnimationEnd={onEnd} onAnimationCancel={onEnd}>
        {children}
      </div>
    </section>
  );
}
