/* App-Sperre: Sperrbildschirm vor der App und der Schalter in den Einstellungen (siehe lib/applock.js) */
import React, { useEffect, useRef, useState } from "react";
import { LOCK_AFTER_MS, lockAvailable, lockConfig, lockDue, registerLock, saveLockConfig, verifyLock } from "../lib/applock.js";
import { Card } from "./primitives.jsx";
import { btnGhost, btnPrimary } from "./styles.js";

const LOCK_NOW = "studyos-lock-now";

/* Pixel-Schloss (12×12), Farben über die Tokens */
const BODY = ["111111111111", "111111111111", "111110011111", "111110011111", "111111011111", "111111011111", "111111111111"];
function PixelLock() {
  const px = [];
  [[3, 0, 6], [2, 1, 1], [9, 1, 1], [2, 2, 1], [9, 2, 1], [2, 3, 1], [9, 3, 1], [2, 4, 1], [9, 4, 1]].forEach(([x, y, w]) => px.push(<rect key={`s${x}-${y}`} x={x} y={y} width={w} height="1" className="lock-shackle" />));
  BODY.forEach((row, y) => [...row].forEach((c, x) => px.push(<rect key={`b${x}-${y}`} x={x} y={y + 5} width="1" height="1" className={c === "1" ? "lock-body" : "lock-hole"} />)));
  return <svg className="lock-art" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">{px}</svg>;
}

/** Verdeckt die App, solange sie gesperrt ist: beim Öffnen und nach LOCK_AFTER_MS im Hintergrund. */
export function AppLock({ children }) {
  const [locked, setLocked] = useState(() => !!lockConfig());
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const hiddenAt = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      if (lockConfig() && lockDue(hiddenAt.current, Date.now(), LOCK_AFTER_MS)) { setErr(""); setLocked(true); }
      hiddenAt.current = null;
    };
    const now = () => { if (lockConfig()) { setErr(""); setLocked(true); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(LOCK_NOW, now);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener(LOCK_NOW, now); };
  }, []);

  /* gesperrt: Tastenkürzel der App dürfen nichts dahinter öffnen */
  useEffect(() => {
    if (!locked) return;
    btnRef.current?.focus();
    const stop = (e) => { if (!e.target?.closest?.(".lock-screen")) e.stopPropagation(); };
    document.addEventListener("keydown", stop, true);
    return () => document.removeEventListener("keydown", stop, true);
  }, [locked]);

  const unlock = async () => {
    setBusy(true); setErr("");
    try {
      if (await verifyLock(lockConfig())) setLocked(false);
      else setErr("Nicht erkannt. Nochmal versuchen.");
    } catch { setErr("Nicht entsperrt. Nochmal versuchen."); }
    setBusy(false);
  };

  return (
    <>
      <div className={locked ? "lock-hidden" : undefined} inert={locked || undefined} aria-hidden={locked || undefined}>{children}</div>
      {locked && (
        <div className="lock-screen font-ui" role="dialog" aria-modal="true" aria-label="StudyOS gesperrt">
          <PixelLock />
          <p className="lock-title">Gesperrt</p>
          <button ref={btnRef} type="button" className={btnPrimary} onClick={unlock} disabled={busy}>{busy ? "Prüft …" : "Entsperren"}</button>
          {err && <p role="alert" className="lock-err">{err}</p>}
          <p className="lock-hint">Sichtsperre, keine Verschlüsselung</p>
        </div>
      )}
    </>
  );
}

/** Einstellungen: App-Sperre ein-/ausschalten. Ohne Fingerabdruck/Face ID auf dem Gerät nicht angeboten. */
export function AppLockCard() {
  const [avail, setAvail] = useState(false);
  const [on, setOn] = useState(() => !!lockConfig());
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { let live = true; lockAvailable().then((a) => live && setAvail(a)); return () => { live = false; }; }, []);
  if (!avail) return null;

  const enable = async () => {
    setBusy(true); setMsg("");
    try {
      const cfg = await registerLock();
      if (!saveLockConfig(cfg)) throw new Error("Speichern nicht möglich.");
      setOn(true); setMsg("Eingeschaltet.");
    } catch (e) { setMsg(e?.name === "NotAllowedError" ? "Abgebrochen." : e?.message || "Einrichten fehlgeschlagen."); }
    setBusy(false);
  };
  const disable = () => { saveLockConfig(null); setOn(false); setMsg("Ausgeschaltet."); };

  return (
    <Card title="App-Sperre">
      <p className="text-xs text-slate-400">Fingerabdruck oder Face ID beim Öffnen und nach {LOCK_AFTER_MS / 60000} Minuten im Hintergrund. Nur auf diesem Gerät. Sichtsperre, keine Verschlüsselung: Die Daten selbst bleiben unverschlüsselt im Browser.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {on ? (
          <>
            <button className={btnGhost} onClick={() => window.dispatchEvent(new Event(LOCK_NOW))}>Jetzt sperren</button>
            <button className={btnGhost} onClick={disable}>Ausschalten</button>
          </>
        ) : <button className={btnPrimary} onClick={enable} disabled={busy}>{busy ? "Bitte bestätigen …" : "Einschalten"}</button>}
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-slate-400">{msg}</p>}
      {on && <p className="mt-2 text-[11px] text-slate-500">Ausschalten geht nur entsperrt, hier in den Einstellungen.</p>}
    </Card>
  );
}
