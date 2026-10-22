/* Bausteine rund um einen Termin: Dreifach-Schalter (vorbereitet, besucht, nachbereitet) und die
   Termin-Karte, die im Wochenraster beim Überfahren mit der Maus bzw. beim Antippen erscheint. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { playSfx } from "./sfx.js";
import { PlaceLinks, WatchProgress } from "./links.jsx";
import { openSessionNote } from "./actions.jsx";
import { fmtShort, isHeld } from "../lib/util.js";
import { useBackClose } from "./back.js";

export const SESSION_STEPS = [
  ["prepared", "Vorbereitet", "Vor"],
  ["attended", "Besucht", "Besucht"],
  ["reviewed", "Nachbereitet", "Nach"],
];
/* Weiches Trennzeichen: in der schmalen Termin-Karte bricht die Beschriftung als „Vor-/bereitet“ um, statt überzulaufen */
const WRAP = { Vorbereitet: "Vor\u00adbereitet", Nachbereitet: "Nach\u00adbereitet" };

/** Drei Schalter in einer Leiste. compact: kurze Beschriftung (Listen), sonst ausgeschrieben (Karte). */
export function SessionTri({ s, db, compact = false, color }) {
  const held = isHeld(s);
  return (
    <div className={`tri ${compact ? "tri-compact" : ""}`} role="group" aria-label="Status des Termins" style={{ "--mod": color }}>
      {SESSION_STEPS.map(([key, long, short]) => {
        const on = !!s[key], warn = key === "reviewed" && held && !on;
        return (
          <button key={key} type="button" aria-pressed={on} title={long} aria-label={compact && short !== long ? `${short}: ${long}` : long} className={`tri-btn tri-${key} ${warn ? "tri-warn" : ""}`}
            onClick={(e) => { e.stopPropagation(); if (!s[key]) playSfx("coin"); db.toggleSession(s.id, key); }}>
            <span className="tri-mark" aria-hidden="true">{on ? "✓" : warn ? "!" : ""}</span>
            <span>{compact ? short : WRAP[long] || long}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Schwebende Karte an einem Termin (Position aus dem Rechteck des Auslösers). */
export function SessionPopover({ s, db, anchor, area, onClose, onEnter, onLeave, note = "" }) {
  const ref = useRef(null);
  const opener = useRef(typeof document !== "undefined" ? document.activeElement : null); /* Esc gibt den Fokus dorthin zurück */
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const m = db.mod(s.moduleId);
  useBackClose(lastPointer.current !== "mouse", onClose); /* angetippt: Zurück-Geste schließt die Karte (Maus-Überfahren nicht) */

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    /* Grenzen: das Fenster, in der PC-Doppelansicht nur die eigene Spalte (sonst ragt die Karte in „Heute“ bzw. über die Bildlaufleiste) */
    let L = 8, R = window.innerWidth - 8, T = 8, B = window.innerHeight - 8;
    if (area && area.right - area.left >= w + 16) { L = Math.max(L, area.left + 8); R = Math.min(R, area.right - 8); }
    if (area && area.bottom - area.top >= h + 16) { T = Math.max(T, area.top + 8); B = Math.min(B, area.bottom - 8); }
    const beside = (x) => x === anchor.right + 8 || x === anchor.left - w - 8;
    let left = anchor.right + 8;
    if (left + w > R) left = anchor.left - w - 8; /* rechts kein Platz: links daneben */
    if (left < L) left = Math.min(Math.max(L, anchor.left + anchor.width / 2 - w / 2), R - w); /* sonst darunter/darüber */
    /* Die schwebende Navigationsleiste unten verdeckt sonst den unteren Teil der Karte */
    const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
    if (bar && bar.height && bar.left < left + w && bar.right > left && bar.top - 8 - T >= h) B = Math.min(B, bar.top - 8);
    let top = beside(left) ? anchor.top : anchor.bottom + 8;
    if (top + h > B) top = Math.max(T, beside(left) ? B - h : anchor.top - h - 8);
    setPos({ left, top });
  }, [anchor, area, s]);

  /* Listener nur einmal anmelden; onClose kommt bei jedem Rendern neu (useHoverCard), darum über eine Ref */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const close = () => closeRef.current();
    const onKey = (e) => { if (e.key === "Escape") { close(); opener.current?.focus?.(); } };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.(".ev")) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    const side = ref.current?.closest(".split-side"); /* PC-Doppelansicht: die Wochenspalte scrollt für sich */
    window.addEventListener("scroll", close, { passive: true });
    side?.addEventListener("scroll", close, { passive: true });
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); window.removeEventListener("scroll", close); side?.removeEventListener("scroll", close); };
  }, []);

  return (
    <div ref={ref} className="popover" role="dialog" aria-label={`${m?.name || "Termin"}, ${s.type}`} style={{ left: pos.left, top: pos.top, "--mod": m?.color }}
      /* Nur die Maus: Ein Finger „verlässt“ die Karte nach jedem Antippen, sonst schlösse sie sich nach dem ersten Haken */
      onPointerEnter={(e) => { if (isMouse(e)) onEnter(); }} onPointerLeave={(e) => { if (isMouse(e)) onLeave(); }}>
      <p className="popover-title">{m?.name || "Ohne Modul"}</p>
      <p className="row-meta mt-0.5">{s.type}, {fmtShort(s.date)}, {s.start}–{s.end}</p>
      {s.room && <p className="row-meta">{s.room}</p>}
      {note && <p className="row-meta popover-warn">{note}</p>}
      <PlaceLinks room={s.room} live={m?.liveUrl} className="mt-1.5" />
      {!s.cancelled && <WatchProgress s={s} color={m?.color} className="mt-1.5" />}
      {s.cancelled ? <p className="mt-2 text-sm font-semibold text-slate-400">Fällt aus</p> : <div className="mt-3"><SessionTri s={s} db={db} color={m?.color} /></div>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn btn-ghost" onClick={() => { onClose(); openSessionNote(db, s); }}>Notiz</button>
        <button className="btn btn-ghost" onClick={() => { onClose(); db.openForm("session", s); }}>Details</button>
      </div>
    </div>
  );
}

/**
 * Steuert, welcher Termin seine Karte zeigt.
 * Maus: nach kurzem Verweilen öffnen, beim Verlassen (mit Gnadenfrist für den Weg zur Karte) schließen.
 * Touch: Antippen öffnet die Karte statt des Formulars.
 */
/* Sichtbarer Innenbereich einer Spalte, ohne ihre Bildlaufleiste */
const areaOf = (box) => {
  if (!box) return null;
  const r = box.getBoundingClientRect(), left = r.left + box.clientLeft, top = r.top + box.clientTop;
  return { left, top, right: left + box.clientWidth, bottom: top + box.clientHeight };
};
export function useHoverCard({ openDelay = 350, closeDelay = 220 } = {}) {
  const [card, setCard] = useState(null); /* { id, anchor, area } */
  /* area: die Spalte der PC-Doppelansicht, in der der Termin steht; die Karte bleibt darin */
  const place = (id, el) => setCard({ id, anchor: el.getBoundingClientRect(), area: areaOf(el.closest(".split-side")) });
  const timers = useRef({});
  const clear = (k) => { clearTimeout(timers.current[k]); timers.current[k] = null; };
  useEffect(() => () => { clear("open"); clear("close"); }, []);
  const open = (id, el) => { clear("open"); clear("close"); place(id, el); };
  const close = () => { clear("open"); clear("close"); setCard(null); };
  return {
    card, open, close,
    keep: () => clear("close"),
    leave: () => { clear("open"); clear("close"); timers.current.close = setTimeout(() => setCard(null), closeDelay); },
    /** Props für den Auslöser (einen Termin-Knopf) */
    trigger: (id, onActivate) => ({
      onPointerEnter: (e) => {
        if (!isMouse(e)) return;
        clear("close");
        const el = e.currentTarget;
        clear("open");
        timers.current.open = setTimeout(() => place(id, el), card ? 0 : openDelay);
      },
      onPointerLeave: (e) => { if (isMouse(e)) { clear("open"); clear("close"); timers.current.close = setTimeout(() => setCard(null), closeDelay); } },
      onFocus: (e) => { if (e.currentTarget.matches(":focus-visible")) open(id, e.currentTarget); },
      onClick: (e) => {
        /* Touch: erst die Karte; Maus/Tastatur: wie bisher das Formular */
        if (lastPointer.current === "touch" || lastPointer.current === "pen") { e.preventDefault(); card && card.id === id ? close() : open(id, e.currentTarget); return; }
        close(); onActivate();
      },
      onPointerDown: (e) => { lastPointer.current = e.pointerType; },
    }),
  };
}
/* Zuletzt benutzte Zeigerart (Maus, Finger, Stift). Nach dem Antippen meldet Chrome bei Änderungen am Layout teils
   Maus-Ein- und -Austritte an der alten Stelle, ohne dass eine Maus bewegt wurde; die dürfen die angetippte Karte nicht
   schließen. Erst echte Mausbewegung zählt wieder als Maus. */
const lastPointer = { current: "mouse" };
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => { lastPointer.current = e.pointerType; }, true);
  document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && (e.movementX || e.movementY)) lastPointer.current = "mouse"; }, true);
}
const isMouse = (e) => e.pointerType === "mouse" && lastPointer.current === "mouse";
