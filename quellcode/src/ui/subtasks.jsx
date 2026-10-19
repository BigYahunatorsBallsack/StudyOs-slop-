/* Teilaufgaben einer Abgabe: Fortschrittsbalken, Abhaken in der Liste und Bearbeiten im Formular. */
import React, { useState } from "react";
import { MAX_SUBTASKS, newSubtasks, subProgress } from "../lib/subtasks.js";

/** Schmaler Balken mit „2/3“, als span, weil er teils in einem Knopf steht. */
export function SubtaskProgress({ h, color, className = "" }) {
  const p = subProgress(h);
  if (!p.total) return null;
  return (
    <span className={`watch ${className}`}>
      <span className="row-meta">{p.done}/{p.total}<span className="sr-only"> Teilaufgaben erledigt</span></span>
      <span className="bar watch-bar" aria-hidden="true"><span style={{ width: `${Math.round((p.done / p.total) * 100)}%`, background: color || "var(--accent)" }} /></span>
    </span>
  );
}

/** In der Hausaufgaben-Zeile: Fortschritt als Knopf, aufgeklappt die Teilaufgaben zum Abhaken. */
export function SubtaskChecklist({ h, db, color }) {
  const [open, setOpen] = useState(false);
  const p = subProgress(h);
  if (!p.total) return null;
  const listId = `sub-${h.id}`;
  return (
    <div className="subtasks">
      <button type="button" className="subtasks-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span className="row-meta">Teilaufgaben</span>
        <SubtaskProgress h={h} color={color} className="min-w-0 flex-1" />
        <span className="subtasks-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul id={listId} className="subtasks-list">
          {h.subtasks.map((s) => (
            <li key={s.id}>
              <label className={s.done ? "is-done" : ""}>
                <input type="checkbox" checked={!!s.done} onChange={() => db.toggleSubtask(h.id, s.id)} />
                <span>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Formularfeld: Teilaufgaben anlegen, umbenennen, abhaken und entfernen. */
export function SubtaskEditor({ id, value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState("");
  const add = () => { if (!draft.trim()) return; onChange(newSubtasks(draft, list)); setDraft(""); };
  const set = (sid, p) => onChange(list.map((s) => (s.id === sid ? { ...s, ...p } : s)));
  return (
    <div className="subtask-editor">
      {list.length > 0 && (
        <ul className="subtasks-list">
          {list.map((s, i) => (
            <li key={s.id}>
              <input type="checkbox" checked={!!s.done} onChange={(e) => set(s.id, { done: e.target.checked })} aria-label={`${s.title || `Teilaufgabe ${i + 1}`} erledigt`} />
              <input className="field min-w-0 flex-1 py-1.5 text-sm" value={s.title} onChange={(e) => set(s.id, { title: e.target.value })} aria-label={`Teilaufgabe ${i + 1}`} />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => onChange(list.filter((x) => x.id !== s.id))} aria-label={`${s.title || `Teilaufgabe ${i + 1}`} entfernen`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX_SUBTASKS && (
        <div className="mt-2 flex gap-2">
          <input id={id} className="field min-w-0 flex-1" value={draft} placeholder={list.length ? "Weitere Teilaufgabe" : "z. B. a-c"} autoComplete="off"
            onChange={(e) => setDraft(e.target.value)} onBlur={add}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>Hinzufügen</button>
        </div>
      )}
    </div>
  );
}
