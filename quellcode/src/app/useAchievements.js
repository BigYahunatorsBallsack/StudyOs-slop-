/* Neu freigeschaltete Abzeichen melden. Welche schon gemeldet wurden, merkt sich das Gerät; beim ersten Start
   (oder nach dem Löschen der Website-Daten) wird nur still gemerkt, damit nicht alles auf einmal aufpoppt. */
import { useEffect, useMemo } from "react";
import { achievements } from "../lib/progress.js";

const KEY = "studyos-erfolge-gesehen";

export function useAchievements({ data, enabled, onUnlock }) {
  const list = useMemo(() => achievements(data), [data]);
  const done = list.filter((b) => b.done).map((b) => b.id).join(",");
  useEffect(() => {
    if (!enabled) return;
    const ids = done ? done.split(",") : [];
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* nichts gemerkt */ }
    const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* egal */ } };
    if (!Array.isArray(seen)) { save(ids); return; }
    const fresh = ids.filter((id) => !seen.includes(id));
    if (!fresh.length) return;
    save([...new Set([...seen, ...ids])]);
    onUnlock(list.filter((b) => fresh.includes(b.id)));
  }, [done, enabled]);
}
