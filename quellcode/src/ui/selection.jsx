/* Mehrfachauswahl in Listen: „Auswählen“ über der Liste (oder im Schnellmenü), dann Zeilen antippen
   und unten gemeinsam abhaken, verschieben oder löschen */
import React, { useEffect, useState } from "react";
import { PostponeSheet } from "./actions.jsx";
import { DONE_HW } from "../lib/constants.js";

const NOUN = { homework: ["Abgabe", "Abgaben"], session: ["Termin", "Termine"], card: ["Karte", "Karten"] };
export const countLabel = (kind, n) => `${n} ${NOUN[kind][n === 1 ? 0 : 1]}`;

/** Zeile im Auswahlmodus: ein großes Kästchen, Titel und eine Zeile Einzelheiten */
export function SelectRow({ db, kind, id, title, meta, color, muted }) {
  const on = db.sel.ids.includes(id);
  return (
    <li className={`row row-select ${on ? "row-selected" : ""} ${muted ? "row-muted" : ""}`} style={{ "--mod": color }}>
      <button className="row-main flex w-full items-center gap-3" role="checkbox" aria-checked={on} onClick={() => db.select(kind, id)}>
        <span className="todo-check" aria-hidden="true">{on ? "✓" : ""}</span>
        <span className="min-w-0 flex-1">
          <span className="row-title block truncate">{title}</span>
          {meta && <span className="row-meta block truncate">{meta}</span>}
        </span>
      </button>
    </li>
  );
}

/** „Auswählen“ über einer Liste; im Auswahlmodus „Alle“ bzw. „Keine“ */
export function SelectToggle({ db, kind, ids }) {
  if (!ids.length) return null;
  const active = db.sel?.kind === kind;
  if (!active) return <button className="link-btn" onClick={() => db.selectAll(kind, [])}>Auswählen</button>;
  const all = ids.every((id) => db.sel.ids.includes(id));
  return <button className="link-btn" onClick={() => db.selectAll(kind, all ? [] : ids)}>{all ? "Keine" : `Alle ${ids.length}`}</button>;
}

/** Leiste unten mit Anzahl und Aktionen */
export function SelectBar({ db }) {
  const { sel } = db;
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !moving) db.endSelect(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [moving]);
  const items = sel.kind === "homework" ? db.data.homework.filter((h) => sel.ids.includes(h.id))
    : sel.kind === "session" ? db.data.sessions.filter((s) => sel.ids.includes(s.id))
      : db.data.cards.filter((c) => sel.ids.includes(c.id));
  const n = items.length, none = !n;
  const open = items.filter((h) => !DONE_HW.has(h.status));
  return (
    <div className="select-bar" role="toolbar" aria-label="Auswahl">
      <span className="select-count" aria-live="polite">{n ? `${countLabel(sel.kind, n)} ausgewählt` : "Zeilen antippen"}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {sel.kind === "homework" && <>
          <button className="btn btn-solid" disabled={!open.length} onClick={() => db.bulk.hwDone(open)}>Abgegeben</button>
          <button className="btn btn-ghost" disabled={!open.length} onClick={() => setMoving(true)}>Verschieben</button>
        </>}
        {sel.kind === "session" && <button className="btn btn-solid" disabled={!items.some((s) => !s.reviewed && !s.cancelled)} onClick={() => db.bulk.reviewed(items)}>Nachbereitet</button>}
        <button className="btn btn-ghost" disabled={none} onClick={() => db.bulk.remove(sel.kind, items)}>Löschen</button>
        <button className="btn btn-ghost" onClick={db.endSelect}>Fertig</button>
      </div>
      {moving && (
        <PostponeSheet db={db} kind="homework" item={{ title: countLabel("homework", open.length), due: open.map((h) => h.due).filter(Boolean).sort()[0] || "" }}
          onPick={(date) => db.bulk.hwMove(open, date)} onClose={() => setMoving(false)} />
      )}
    </div>
  );
}
