/* Fokus-Timer (bleibt beim Tabwechsel und Neuladen aktiv). Was nach einer Fokusphase passiert, entscheidet die App über onFocusDone.
   Mit Cloud-Sync (`live` ist dann gesetzt, sonst undefined) läuft derselbe Timer auf allen Geräten: lokale Änderungen gehen
   über onLive in die synchronisierten Einstellungen, Änderungen anderer Geräte werden übernommen (siehe lib/timer.js).
   `hold`: Ende einer Phase noch nicht auswerten (z. B. bis der erste Sync nach dem Start da ist, damit ein anderswo
   beendeter Durchgang hier nicht noch einmal eingetragen wird). */
import { useEffect, useRef, useState } from "react";
import { TIMER_KEY } from "../lib/constants.js";
import { focusLogId, fromLive, liveKey, loadTimer, remainingOf, toLive } from "../lib/timer.js";
import { clockOffsetMs } from "../lib/sync.js";
import { iso, uid } from "../lib/util.js";

export function useTimer({ sound, onFocusDone, onBreakDone, onLog, live, onLive, hold = false }) {
  const audioRef = useRef(null);
  const [timer, setTimerState] = useState(loadTimer);
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {} }, [timer]);

  /* Eigene Änderungen markieren, damit nur sie (nicht übernommene) an die anderen Geräte gehen */
  const ownRef = useRef(false), sentRef = useRef(new Set());
  const setTimer = (fn) => { ownRef.current = true; setTimerState(fn); };
  const key = live ? liveKey(live) : "";
  const [seen, setSeen] = useState(null);
  if (live && key !== seen) {
    /* während des Renderns übernehmen, damit der Ablauf-Effekt nie den veralteten Stand sieht */
    setSeen(key);
    if (!sentRef.current.has(key) && key !== liveKey(toLive(timer, clockOffsetMs()))) setTimerState((t) => fromLive(live, t, clockOffsetMs()));
  }
  const syncOn = live !== undefined;
  useEffect(() => {
    if (!syncOn || !onLive) return;
    if (!ownRef.current && !(live === null && timer.runId)) return;
    ownRef.current = false;
    const rec = toLive(timer, clockOffsetMs()), k = liveKey(rec);
    if (k === key) return;
    sentRef.current.add(k);
    if (sentRef.current.size > 50) sentRef.current = new Set([k]);
    onLive(rec);
  }, [timer, syncOn]);

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
    if (hold || !timer.running || remainingOf(timer) > 0) return;
    signal();
    if (timer.mode === "focus") {
      setTimer((t) => ({ ...t, running: false, mode: "break", remaining: t.brk * 60, blockId: null, note: "", homeworkId: "", runId: undefined }));
      onFocusDone({ id: focusLogId(timer.runId), minutes: timer.length, moduleId: timer.moduleId, topicId: timer.topicId, kind: timer.kind || "Nacharbeiten", date: iso(), note: timer.note || "", ...(timer.homeworkId && { homeworkId: timer.homeworkId }) }, timer.blockId);
    } else { setTimer((t) => ({ ...t, running: false, mode: "focus", remaining: t.length * 60, runId: undefined })); onBreakDone(); }
  }, [expiry, timer.running, timer.endAt, hold]);

  const api = {
    ...timer,
    start: () => {
      unlockAudio();
      setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remaining * 1000, runId: t.runId || uid() }));
    },
    pause: () => setTimer((t) => ({ ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) })),
    reset: () => setTimer((t) => ({ ...t, running: false, remaining: (t.mode === "focus" ? t.length : t.brk) * 60, runId: undefined })),
    setMode: (m) => setTimer((t) => ({ ...t, mode: m, running: false, remaining: (m === "focus" ? t.length : t.brk) * 60, runId: undefined })),
    setLength: (n) => setTimer((t) => ({ ...t, length: n, ...(t.mode === "focus" && !t.running ? { remaining: n * 60 } : {}) })),
    set: (p) => setTimer((t) => ({ ...t, ...p })),
    stopAndLog: () => {
      const mins = Math.round((timer.length * 60 - remainingOf(timer)) / 60);
      setTimer((t) => ({ ...t, running: false, remaining: t.length * 60, note: "", homeworkId: "", runId: undefined }));
      if (mins >= 1) onLog({ id: focusLogId(timer.runId), minutes: mins, moduleId: timer.moduleId, topicId: timer.topicId, kind: timer.kind || "Nacharbeiten", date: iso(), note: timer.note || "", ...(timer.homeworkId && { homeworkId: timer.homeworkId }) });
    },
    /* Fokus-Timer für eine bestimmte Aufgabe sofort starten (aus „Was jetzt?“, Lernblöcken und dem ▶ an Einträgen).
       Ohne Minuten gilt die eingestellte Länge; `note` landet als Notiz in der Lerneinheit, `homeworkId` verknüpft sie mit der Abgabe. */
    focus: ({ moduleId = "", minutes, kind = "Nacharbeiten", topicId = "", blockId = null, note = "", homeworkId = "" }) => {
      unlockAudio();
      setTimer((t) => {
        const n = Math.max(5, Math.min(120, Math.round(minutes ?? t.length)));
        return { ...t, moduleId, topicId, kind, blockId, note, homeworkId, mode: "focus", length: n, remaining: n * 60, running: true, endAt: Date.now() + n * 60000, runId: uid() };
      });
    },
  };
  return { timer, timerApi: api };
}
