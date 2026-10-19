/* Bausteine rund um einen Termin: Dreifach-Schalter (vorbereitet, besucht, nachbereitet) und die
   Termin-Karte, die im Wochenraster beim Überfahren mit der Maus bzw. beim Antippen erscheint. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { playSfx } from "./sfx.js";
import { PlaceLinks, WatchProgress } from "./links.jsx";
import { fmtShort, isHeld } from "../lib/util.js";

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
export function SessionPopover({ s, db, anchor, onClose, onEnter, onLeave }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const m = db.mod(s.moduleId);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.right + 8;
    if (left + w > vw - 8) left = anchor.left - w - 8; /* rechts kein Platz: links daneben */
    if (left < 8) left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - w / 2), vw - w - 8); /* sonst darunter/darüber */
    let top = left === anchor.right + 8 || left === anchor.left - w - 8 ? anchor.top : anchor.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, (left === anchor.right + 8 || left === anchor.left - w - 8 ? vh - h - 8 : anchor.top - h - 8));
    setPos({ left, top });
  }, [anchor, s]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.(".ev")) onClose(); };
    const onScroll = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); window.removeEventListener("scroll", onScroll); };
  }, [onClose]);

  return (
    <div ref={ref} className="popover" role="dialog" aria-label={`${m?.name || "Termin"}, ${s.type}`} style={{ left: pos.left, top: pos.top, "--mod": m?.color }}
      /* Nur die Maus: Ein Finger „verlässt“ die Karte nach jedem Antippen, sonst schlösse sie sich nach dem ersten Haken */
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onEnter(); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") onLeave(); }}>
      <p className="popover-title">{m?.name || "Ohne Modul"}</p>
      <p className="row-meta mt-0.5">{s.type}, {fmtShort(s.date)}, {s.start}–{s.end}</p>
      {s.room && <p className="row-meta">{s.room}</p>}
      <PlaceLinks room={s.room} live={m?.liveUrl} className="mt-1.5" />
      {!s.cancelled && <WatchProgress s={s} color={m?.color} className="mt-1.5" />}
      {s.cancelled ? <p className="mt-2 text-sm font-semibold text-slate-400">Fällt aus</p> : <div className="mt-3"><SessionTri s={s} db={db} color={m?.color} /></div>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn btn-ghost" onClick={() => { onClose(); db.openForm("note", { moduleId: s.moduleId, sessionId: s.id }, true); }}>Notiz</button>
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
export function useHoverCard({ openDelay = 350, closeDelay = 220 } = {}) {
  const [card, setCard] = useState(null); /* { id, anchor } */
  const timers = useRef({});
  const clear = (k) => { clearTimeout(timers.current[k]); timers.current[k] = null; };
  useEffect(() => () => { clear("open"); clear("close"); }, []);
  const open = (id, el) => { clear("open"); clear("close"); setCard({ id, anchor: el.getBoundingClientRect() }); };
  const close = () => { clear("open"); clear("close"); setCard(null); };
  return {
    card, open, close,
    keep: () => clear("close"),
    leave: () => { clear("open"); clear("close"); timers.current.close = setTimeout(() => setCard(null), closeDelay); },
    /** Props für den Auslöser (einen Termin-Knopf) */
    trigger: (id, onActivate) => ({
      onPointerEnter: (e) => {
        if (e.pointerType !== "mouse") return;
        clear("close");
        const el = e.currentTarget;
        clear("open");
        timers.current.open = setTimeout(() => setCard({ id, anchor: el.getBoundingClientRect() }), card ? 0 : openDelay);
      },
      onPointerLeave: (e) => { if (e.pointerType === "mouse") { clear("open"); clear("close"); timers.current.close = setTimeout(() => setCard(null), closeDelay); } },
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
const lastPointer = { current: "mouse" };
