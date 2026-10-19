/* Timer-Anzeigen: Nur diese kleinen Komponenten aktualisieren sich jede halbe Sekunde,
   nicht mehr die ganze App. */
import React, { useState, useEffect } from "react";
import { fullLength, mmss, remainingOf } from "../lib/timer.js";
import { focusRing } from "./styles.js";

export function useRemaining(timer) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [timer.running]);
  return remainingOf(timer);
}

export function TimerBadge({ timer, onClick }) {
  const remaining = useRemaining(timer);
  if (!timer.running && remaining === fullLength(timer)) return null;
  return (
    <button onClick={onClick} className={`font-num rounded-full bg-sky-500/15 px-3 py-1 text-xs text-sky-200 ${focusRing}`} aria-label="Zum Timer">
      {timer.mode === "focus" ? "Fokus" : "Pause"} {mmss(remaining)}
    </button>
  );
}

export function TimerTitle({ timer }) {
  const remaining = useRemaining(timer);
  useEffect(() => {
    document.title = timer.running ? `${mmss(remaining)} ${timer.mode === "focus" ? "Fokus" : "Pause"} · StudyOS` : "StudyOS";
  }, [remaining, timer.running, timer.mode]);
  return null;
}
