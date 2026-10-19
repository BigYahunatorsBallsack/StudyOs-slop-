/* Schnelleingabe: Freitext tippen, Erkanntes als Vorschau sehen, mit Enter anlegen. */
import React, { useState } from "react";
import { parseQuick, quickMissing, quickToEntity } from "../lib/quickadd.js";
import { fmtMin, fmtShort, uid } from "../lib/util.js";
import { Modal } from "./primitives.jsx";

const KINDS = [["homework", "Hausaufgabe"], ["session", "Termin"], ["exam", "Prüfung"], ["log", "Lerneinheit"], ["note", "Notiz"]];
const LABEL = Object.fromEntries(KINDS);

export function QuickAdd({ db, onClose }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("");
  const parsed = parseQuick(text, db.data.modules);
  const q = kind ? { ...parsed, kind } : parsed;
  const missing = text.trim() ? quickMissing(q) : [];
  const ent = q.kind ? quickToEntity(q) : null;

  const submit = (e) => {
    e && e.preventDefault();
    if (!text.trim() || !ent) return;
    onClose();
    if (missing.length) { db.openForm(ent.kind, ent.vals, true); return; }
    db.saveQuick(ent.kind, { ...ent.vals, id: uid() }, LABEL[ent.kind]);
  };

  return (
    <Modal title="Schnelleingabe" onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="quick-text" className="sr-only">Was steht an?</label>
        <input id="quick-text" className="field w-full text-base" autoComplete="off" placeholder="Blatt 4 Analysis Fr" value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() ? (
          <>
            <div className="seg mt-3" role="radiogroup" aria-label="Art des Eintrags">
              {KINDS.map(([k, l]) => (
                <button type="button" key={k} role="radio" aria-checked={q.kind === k} aria-selected={q.kind === k} className="seg-item" onClick={() => setKind(k)}>{l}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-live="polite">
              {["homework", "session", "exam", "log", "note"].includes(q.kind) && (
                q.module ? <span className="preview-chip" style={{ boxShadow: `inset 3px 0 0 ${q.module.color}` }}>{q.module.name}</span>
                  : <span className={`preview-chip ${missing.includes("Modul") ? "missing" : ""}`}>{missing.includes("Modul") ? "Modul fehlt" : "ohne Modul"}</span>
              )}
              {q.date ? <span className="preview-chip">{fmtShort(q.date)}</span> : missing.includes("Datum") && <span className="preview-chip missing">Datum fehlt</span>}
              {q.start && <span className="preview-chip">{q.start}{q.end ? `–${q.end}` : ""}</span>}
              {q.kind === "log" && <span className="preview-chip">{fmtMin(q.minutes || 45)}</span>}
              {q.kind === "session" && <span className="preview-chip">{q.sessionType}</span>}
              {q.kind === "homework" && q.subtasks.length > 0 && <span className="preview-chip">{q.subtasks.length} Teilaufgaben: {q.subtasks.length > 4 ? `${q.subtasks[0]} bis ${q.subtasks[q.subtasks.length - 1]}` : q.subtasks.join(", ")}</span>}
              {q.title && <span className="preview-chip">„{q.title}“</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-lg">{missing.length ? "Weiter im Formular" : `${LABEL[q.kind]} anlegen`}</button>
              {!missing.length && <button type="button" className="btn btn-ghost btn-lg" onClick={() => { onClose(); db.openForm(ent.kind, ent.vals, true); }}>Im Formular bearbeiten</button>}
            </div>
          </>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-slate-400">
            <li><b className="text-slate-200">Blatt 4 Analysis Fr</b> wird eine Hausaufgabe</li>
            <li><b className="text-slate-200">Blatt 5 DS Fr a-c</b> bekommt die Teilaufgaben a, b und c</li>
            <li><b className="text-slate-200">Übung DS Do 14-16 MI HS 1</b> wird ein Termin</li>
            <li><b className="text-slate-200">Klausur EIDI 12.02. 10:30</b> wird eine Prüfung</li>
            <li><b className="text-slate-200">90 min Analysis Kapitel 3</b> wird eine Lerneinheit</li>
          </ul>
        )}
      </form>
    </Modal>
  );
}
