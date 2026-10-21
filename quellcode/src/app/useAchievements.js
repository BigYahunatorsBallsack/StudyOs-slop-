/* Neu freigeschaltete Abzeichen melden. Welche schon gemeldet wurden, merkt sich das Gerät; beim ersten Start
   (oder nach dem Löschen der Website-Daten) wird nur still gemerkt, damit nicht alles auf einmal aufpoppt.
   Gerechnet wird im Leerlauf nach dem Zeichnen: Abzeichen gehen über alle Lerneinheiten und Karten und sollen
   den Start und das Tippen nicht aufhalten. */
import { useEffect, useRef } from "react";
import { achievements } from "../lib/progress.js";

const KEY = "studyos-erfolge-gesehen";

export function useAchievements({ data, enabled, onUnlock }) {
  const lastDone = useRef(null);
  const onUnlockRef = useRef(onUnlock); onUnlockRef.current = onUnlock;
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const list = achievements(data);
      const ids = list.filter((b) => b.done).map((b) => b.id);
      const done = ids.join(",");
      if (done === lastDone.current) return;
      lastDone.current = done;
      let seen = null;
      try { seen = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* nichts gemerkt */ }
      const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* egal */ } };
      if (!Array.isArray(seen)) { save(ids); return; }
      const fresh = ids.filter((id) => !seen.includes(id));
      if (!fresh.length) return;
      save([...new Set([...seen, ...ids])]);
      onUnlockRef.current(list.filter((b) => fresh.includes(b.id)));
    };
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(check, { timeout: 1000 });
    return () => cancel(id);
  }, [data, enabled]);
}
