/* Dialog zum Zusammenführen von Modulen: auswählen, Obermodul festlegen, Vorschau, zusammenführen */
import React, { useState } from "react";
import { moduleContents, pickTarget } from "../lib/modules.js";
import { Modal } from "../ui/primitives.jsx";

const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : null);
const describe = (c) => [
  n(c.sessions, "Termin", "Termine"), n(c.homework, "Hausaufgabe", "Hausaufgaben"), n(c.topics, "Thema", "Themen"), n(c.notes, "Notiz", "Notizen"),
  n(c.cards, "Karte", "Karten"), n(c.logs, "Lerneinheit", "Lerneinheiten"), n(c.exams, "Prüfung", "Prüfungen"),
].filter(Boolean).join(", ") || "keine Einträge";

/** preset: Modul-IDs, die vorausgewählt sind; target: vorgeschlagenes Obermodul */
export function MergeModules({ db, preset = [], target: presetTarget, onClose, onDone }) {
  const { data } = db;
  const [selected, setSelected] = useState(() => new Set(preset));
  const [target, setTarget] = useState(presetTarget || preset[0] || "");
  const chosen = data.modules.filter((m) => selected.has(m.id));
  const sources = chosen.filter((m) => m.id !== target).map((m) => m.id);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    if (!next.has(target)) setTarget(next.size ? pickTarget(data.modules.filter((m) => next.has(m.id))).id : "");
    else if (!target) setTarget(id);
  };
  const tgt = data.modules.find((m) => m.id === target);
  const ordered = [...data.modules].sort((a, b) => (selected.has(b.id) - selected.has(a.id)) || a.name.localeCompare(b.name, "de"));

  return (
    <Modal title="Module zusammenführen" onClose={onClose}>
      <p className="text-sm text-slate-400">Wähle die Module aus, die zusammengehören, und lege fest, welches das Obermodul wird. Alles andere zieht dorthin um.</p>
      <ul className="merge-list mt-3" role="list">
        {ordered.map((m) => {
          const on = selected.has(m.id), isTarget = on && m.id === target;
          return (
            <li key={m.id} className={`merge-row ${on ? "on" : ""}`} style={{ "--mod": m.color }}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="h-4 w-4 shrink-0" aria-label={`${m.name} auswählen`} />
                <span className="min-w-0">
                  <span className="row-title block truncate">{m.name}</span>
                  <span className="row-meta block truncate">{describe(moduleContents(data, [m.id]))}</span>
                </span>
              </label>
              {on && (
                <button type="button" className={`merge-target ${isTarget ? "is-target" : ""}`} aria-pressed={isTarget} onClick={() => setTarget(m.id)}>
                  {isTarget ? "Obermodul" : "Als Obermodul"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {tgt && sources.length > 0 ? (
        <p className="notice notice-info mt-4">
          In <b>{tgt.name}</b> landen: {describe(moduleContents(data, sources))}. Die anderen {sources.length === 1 ? "Modul wird" : `${sources.length} Module werden`} entfernt. Name, ECTS und Note des Obermoduls bleiben; das Stundenplan-Abo ordnet künftige Termine direkt zu.
        </p>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Wähle mindestens zwei Module.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-lg" disabled={!tgt || !sources.length} onClick={() => { db.mergeModules(target, sources); onClose(); onDone && onDone(target); }}>
          {sources.length ? `${sources.length + 1} Module zusammenführen` : "Zusammenführen"}
        </button>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}
