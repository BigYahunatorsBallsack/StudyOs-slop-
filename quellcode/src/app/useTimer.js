/* Fokus-Timer (bleibt beim Tabwechsel und Neuladen aktiv). Was nach einer Fokusphase passiert, entscheidet die App über onFocusDone. */
import { useEffect, useRef, useState } from "react";
import { TIMER_KEY } from "../lib/constants.js";
import { loadTimer, remainingOf } from "../lib/timer.js";
import { iso } from "../lib/util.js";

export function useTimer({ sound, onFocusDone, onBreakDone, onLog }) {
  const audioRef = useRef(null);
  const [timer, setTimer] = useState(loadTimer);
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {} }, [timer]);

  const unlockAudio = () => {
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !audioRef.current) audioRef.current = new AC(); audioRef.current && audioRef.current.state === "suspended" && audioRef.current.resume(); } catch {}
  };
  const signal = () => {
    if (!sound) return;
    try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch {}
    const ctx = audioRef.current; if (!ctx) return;
    try {
      [0, 0.28, 0.56].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i === 2 ? 880 : 660; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
      });
    } catch {}
  };

  /* Ablauf per Einmal-Timeout statt Dauer-Intervall: Die App rendert nur beim Ende neu. */
  const [expiry, setExpiry] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setTimeout(() => setExpiry((x) => x + 1), Math.max(0, timer.endAt - Date.now()) + 60);
    return () => clearTimeout(id);
  }, [timer.running, timer.endAt]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setExpiry((x) => x + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (!timer.running || remainingOf(timer) > 0) return;
    signal();
    if (timer.mode === "focus") {
      setTimer((t) => ({ ...t, running: false, mode: "break", remaining: t.brk * 60, blockId: null, note: "", homeworkId: "" }));
      onFocusDone({ minutes: timer.length, moduleId: timer.moduleId, topicId: timer.topicId, kind: timer.kind || "Nacharbeiten", date: iso(), note: timer.note || "", ...(timer.homeworkId && { homeworkId: timer.homeworkId }) }, timer.blockId);
    } else { setTimer((t) => ({ ...t, running: false, mode: "focus", remaining: t.length * 60 })); onBreakDone(); }
  }, [expiry, timer.running, timer.endAt]);

  const api = {
    ...timer,
    start: () => {
      unlockAudio();
      setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remaining * 1000 }));
    },
    pause: () => setTimer((t) => ({ ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) })),
    reset: () => setTimer((t) => ({ ...t, running: false, remaining: (t.mode === "focus" ? t.length : t.brk) * 60 })),
    setMode: (m) => setTimer((t) => ({ ...t, mode: m, running: false, remaining: (m === "focus" ? t.length : t.brk) * 60 })),
    setLength: (n) => setTimer((t) => ({ ...t, length: n, ...(t.mode === "focus" && !t.running ? { remaining: n * 60 } : {}) })),
    set: (p) => setTimer((t) => ({ ...t, ...p })),
    stopAndLog: () => {
      const mins = Math.round((timer.length * 60 - remainingOf(timer)) / 60);
      setTimer((t) => ({ ...t, running: false, remaining: t.length * 60, note: "", homeworkId: "" }));
      if (mins >= 1) onLog({ minutes: mins, moduleId: timer.moduleId, topicId: timer.topicId, kind: timer.kind || "Nacharbeiten", date: iso(), note: timer.note || "", ...(timer.homeworkId && { homeworkId: timer.homeworkId }) });
    },
    /* Fokus-Timer für eine bestimmte Aufgabe sofort starten (aus „Was jetzt?“, Lernblöcken und dem ▶ an Einträgen).
       Ohne Minuten gilt die eingestellte Länge; `note` landet als Notiz in der Lerneinheit, `homeworkId` verknüpft sie mit der Abgabe. */
    focus: ({ moduleId = "", minutes, kind = "Nacharbeiten", topicId = "", blockId = null, note = "", homeworkId = "" }) => {
      unlockAudio();
      setTimer((t) => {
        const n = Math.max(5, Math.min(120, Math.round(minutes ?? t.length)));
        return { ...t, moduleId, topicId, kind, blockId, note, homeworkId, mode: "focus", length: n, remaining: n * 60, running: true, endAt: Date.now() + n * 60000 };
      });
    },
  };
  return { timer, timerApi: api };
}
