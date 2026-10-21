/* Mehrfachauswahl in Listen: „Auswählen“ über der Liste (oder im Schnellmenü), dann Zeilen antippen
   und unten gemeinsam abhaken, verschieben, einem anderen Modul zuordnen oder löschen */
import React, { useEffect, useState } from "react";
import { PostponeSheet } from "./actions.jsx";
import { Modal } from "./primitives.jsx";
import { Select } from "./select.jsx";
import { blockDone } from "../lib/blocks.js";
import { COLL, DONE_HW } from "../lib/constants.js";
import { markAttended, setModule, shiftSessions } from "../lib/entries.js";
import { modOpts } from "../lib/forms.js";
import { addDays, diffDays, fmtShort, iso } from "../lib/util.js";

const NOUN = { homework: ["Abgabe", "Abgaben"], session: ["Termin", "Termine"], card: ["Karte", "Karten"], note: ["Notiz", "Notizen"], block: ["Lernblock", "Lernblöcke"] };
/* Arten, deren Modul leer bleiben darf („Allgemein“) */
const OPTIONAL_MODULE = new Set(["note", "block"]);
export const countLabel = (kind, n) => `${n} ${NOUN[kind][n === 1 ? 0 : 1]}`;

/* Ausgewählte ids als Set, einmal je Auswahl: jede Zeile fragt nach, bei langen Listen sonst quadratisch viele Vergleiche */
const pickedSets = new WeakMap();
export function pickedSet(sel) {
  if (!sel) return new Set();
  let s = pickedSets.get(sel);
  if (!s) { s = new Set(sel.ids); pickedSets.set(sel, s); }
  return s;
}

/** Zeile im Auswahlmodus: ein großes Kästchen, Titel und eine Zeile Einzelheiten */
export function SelectRow({ db, kind, id, title, meta, color, muted }) {
  const on = pickedSet(db.sel).has(id);
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
  const picked = pickedSet(db.sel), all = ids.every((id) => picked.has(id));
  return <button className="link-btn" onClick={() => db.selectAll(kind, all ? [] : ids)}>{all ? "Keine" : `Alle ${ids.length}`}</button>;
}

/** Leiste unten mit Anzahl und Aktionen */
export function SelectBar({ db }) {
  const { sel } = db;
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !moving && !e.target.closest?.("[role=combobox], [role=listbox]")) db.endSelect(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [moving]);
  const picked = pickedSet(sel), items = (db.data[COLL[sel.kind]] || []).filter((x) => picked.has(x.id));
  const n = items.length, none = !n;
  const open = items.filter((h) => !DONE_HW.has(h.status));
  const ids = items.map((x) => x.id), label = countLabel(sel.kind, n);
  /* Gemeinsame Änderung mit einem Rückgängig; die Auswahl endet */
  const run = (text, fn) => { db.endSelect(); db.withUndo(text, fn); };
  const unvisited = items.filter((s) => !s.attended && !s.cancelled);
  const reModule = (moduleId) => run(`${label}: Modul ${moduleId ? `„${db.mod(moduleId)?.name || "Modul"}“` : "Allgemein"}.`, (d) => setModule(d, sel.kind, ids, moduleId));
  /* Die Blätter stehen neben der Leiste: in ihr (transform) läge das Fenster nicht über der ganzen Seite */
  return (<>
    <div className="select-bar" role="toolbar" aria-label="Auswahl">
      <span className="select-count" aria-live="polite">{n ? `${label} ausgewählt` : "Einträge antippen"}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {sel.kind === "homework" && <>
          <button className="btn btn-solid" disabled={!open.length} onClick={() => db.bulk.hwDone(open)}>Abgegeben</button>
          <button className="btn btn-ghost" disabled={!open.length} onClick={() => setMoving(true)}>Verschieben</button>
        </>}
        {sel.kind === "session" && <>
          <button className="btn btn-solid" disabled={!unvisited.length} onClick={() => run(`${countLabel("session", unvisited.length)} besucht.`, (d) => markAttended(d, ids, iso()))}>Besucht</button>
          <button className="btn btn-ghost" disabled={!items.some((s) => !s.reviewed && !s.cancelled)} onClick={() => db.bulk.reviewed(items)}>Nachbereitet</button>
          <button className="btn btn-ghost" disabled={none} onClick={() => setMoving(true)}>Verschieben</button>
        </>}
        {sel.kind === "block" && <button className="btn btn-solid" disabled={!items.some((b) => !b.done)} onClick={() => run(`${countLabel("block", items.filter((b) => !b.done).length)} erledigt.`, (d) => ({ ...d, blocks: d.blocks.map((b) => (ids.includes(b.id) && !b.done ? { ...b, ...blockDone(true) } : b)) }))}>Erledigt</button>}
        {/* Auswahlfeld als Aktion: zeigt immer „Modul ändern …“, die Wahl ordnet alle ausgewählten Einträge zu */}
        <Select value="" disabled={none} onChange={(e) => e.target.value !== "" && reModule(e.target.value === "-" ? "" : e.target.value)} className="field select-module" aria-label="Modul ändern">
          <option value="">Modul ändern …</option>
          {modOpts(db.data, OPTIONAL_MODULE.has(sel.kind)).map((o) => <option key={o.value || "-"} value={o.value || "-"}>{o.label}</option>)}
        </Select>
        <button className="btn btn-ghost" disabled={none} onClick={() => db.bulk.remove(sel.kind, items)}>Löschen</button>
        <button className="btn btn-ghost" onClick={db.endSelect}>Fertig</button>
      </div>
    </div>
    {moving && sel.kind === "homework" && (
      <PostponeSheet db={db} kind="homework" item={{ title: countLabel("homework", open.length), due: open.map((h) => h.due).filter(Boolean).sort()[0] || "" }}
        onPick={(date) => db.bulk.hwMove(open, date)} onClose={() => setMoving(false)} />
    )}
    {moving && sel.kind === "session" && (
      <ShiftSheet title={`${label} verschieben`} first={items.map((s) => s.date).sort()[0]} onClose={() => setMoving(false)}
        onShift={(days) => run(`${label} verschoben (${dayLabel(days)}).`, (d) => ({ ...d, sessions: shiftSessions(d.sessions, ids, days) }))} />
    )}
  </>);
}

const dayLabel = (n) => { const a = Math.abs(n); return `${a % 7 === 0 ? `${a / 7} ${a === 7 ? "Woche" : "Wochen"}` : `${a} ${a === 1 ? "Tag" : "Tage"}`} ${n < 0 ? "früher" : "später"}`; };

/** Mehrere Termine gemeinsam verschieben: alle um gleich viele Tage, Abstände und Uhrzeiten bleiben */
function ShiftSheet({ title, first, onShift, onClose }) {
  const [date, setDate] = useState(addDays(first, 7));
  const go = (n) => { onClose(); if (n) onShift(n); };
  return (
    <Modal title={title} onClose={onClose}>
      <ul className="menu-list">
        {[1, -1, 7, -7].map((n) => <li key={n}><button className="menu-item" onClick={() => go(n)}>{dayLabel(n)}</button></li>)}
      </ul>
      <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (date) go(diffDays(first, date)); }}>
        <label className="min-w-0 flex-1 text-xs text-slate-400">Erster Termin ({fmtShort(first)}) neu am
          <input type="date" className="field mt-1 w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-solid" type="submit">Verschieben</button>
      </form>
    </Modal>
  );
}
