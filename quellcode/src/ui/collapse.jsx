/* Einklappbare Abschnitte auf „Heute“: der Zustand bleibt auf dem Gerät; beim Schließen erst ausblenden, wenn die Animation durch ist */
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

/* Wie oft der umgebende Abschnitt aufgeklappt wurde (0 = seit dem Laden nicht): Inhalte können darauf mit einer Animation antworten */
const Opens = createContext(0);
export const useGroupOpens = () => useContext(Opens);

const CLOSED_KEY = "studyos-heute-zu"; /* Liste der zugeklappten; bei standardmäßig zugeklappten steht „+id“ für aufgeklappt */
const readClosed = () => { try { const v = JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

const isClosed = (id, byDefault) => (byDefault ? !readClosed().includes("+" + id) : readClosed().includes(id));

export function Group({ id, title, count, action, className = "", closedByDefault = false, children }) {
  const [phase, setPhase] = useState(() => (isClosed(id, closedByDefault) ? "closed" : "open"));
  const body = useRef(null);
  const [opens, setOpens] = useState(0);
  const open = phase === "open" || phase === "opening";
  const toggle = () => {
    try {
      const s = new Set(readClosed()), key = closedByDefault ? "+" + id : id;
      if (open === !closedByDefault) s.add(key); else s.delete(key);
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...s]));
    } catch { /* egal */ }
    if (!open) setOpens((n) => n + 1);
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
  /* Abgebrochene Animation (z. B. „Bewegung aus“ mittendrin): React kennt kein onAnimationCancel, darum direkt am Element */
  useEffect(() => {
    const el = body.current;
    if (!el) return undefined;
    const f = (e) => { if (e.target === el) settle(); };
    el.addEventListener("animationcancel", f);
    return () => el.removeEventListener("animationcancel", f);
  }, []);
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
      <div id={bodyId} ref={body} className={`group-body group-${phase}`} hidden={phase === "closed"} onAnimationEnd={onEnd}>
        <Opens.Provider value={opens}>{children}</Opens.Provider>
      </div>
    </section>
  );
}
