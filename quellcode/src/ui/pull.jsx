/* Am Handy oben auf „Heute“ und „Woche“ nach unten ziehen: holt Stundenplan-Abo, Moodle, Artemis und gleicht die Cloud ab.
   Nur mit Touch und eingerichtetem Cloud-Sync (alle Abrufe laufen darüber), nur ganz oben auf der Seite.
   Der Hinweis folgt dem Finger; danach steht kurz „Aktualisiert, Stand HH:MM“, ohne Ladeanimation.
   Das Neuladen des Browsers beim Ziehen ist schon aus (overscroll-behavior-y auf body). */
import React, { useEffect, useRef, useState } from "react";
import { PULL_THRESHOLD, pullIntent, pullOffset } from "../lib/pull.js";
import { nowHM } from "../lib/util.js";

const still = () => {
  if (document.documentElement.dataset.motion === "off") return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** Alle Abrufe gleichzeitig; Fehler zeigen die jeweiligen Einstellungen bzw. der Sync-Punkt */
export const refreshAll = (db) => Promise.allSettled([db.syncFeed?.(), db.syncMoodle?.(), db.syncArtemis?.(), db.cloud?.syncNow?.()]);

export function PullRefresh({ db }) {
  const on = db.cloud?.phase === "ready";
  const [dist, setDist] = useState(0);
  const [state, setState] = useState(""); /* "" | busy | done */
  const [stamp, setStamp] = useState("");
  const st = useRef(null), busy = useRef(false), dbRef = useRef(db);
  dbRef.current = db;
  useEffect(() => {
    if (!on || !window.matchMedia?.("(pointer: coarse)").matches) return undefined;
    let hide = 0;
    const top = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    const start = (e) => {
      const t = e.touches[0];
      st.current = e.touches.length === 1 && !busy.current && top() && !e.target.closest("input, textarea, select, [role=slider], .occ-stage, [role=dialog]") && !document.querySelector('[role="dialog"]')
        ? { x: t.clientX, y: t.clientY, mode: null, d: 0 } : null;
    };
    const move = (e) => {
      const s = st.current;
      if (!s) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.mode) { s.mode = pullIntent(dx, dy); if (!s.mode) return; }
      if (s.mode !== "pull" || !top()) { st.current = null; setDist(0); return; }
      s.d = pullOffset(dy);
      setDist(s.d);
    };
    const end = () => {
      const s = st.current;
      st.current = null;
      setDist(0);
      if (!s || s.mode !== "pull" || s.d < PULL_THRESHOLD) return;
      busy.current = true; clearTimeout(hide);
      setState("busy");
      refreshAll(dbRef.current).finally(() => {
        busy.current = false;
        setStamp(nowHM()); setState("done");
        hide = setTimeout(() => setState(""), 4000);
      });
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      clearTimeout(hide);
      window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end);
    };
  }, [on]);

  if (dist > 0) {
    const ready = dist >= PULL_THRESHOLD;
    return (
      <div className="pull-ind" style={still() ? undefined : { height: dist }} aria-hidden="true">
        <span>{ready ? "↑ Loslassen zum Aktualisieren" : "↓ Zum Aktualisieren ziehen"}</span>
      </div>
    );
  }
  if (!state) return null;
  return <p className="pull-status" role="status">{state === "busy" ? "Aktualisiere Stundenplan, Abgaben und Sync" : `Aktualisiert, Stand ${stamp}`}</p>;
}
