/* Schnelleingabe: Freitext tippen, Erkanntes als Vorschau sehen, mit Enter anlegen.
   Modulnamen werden vervollständigt (antippen oder Tab), die letzten Eingaben stehen als Vorlage bereit. */
import React, { useRef, useState } from "react";
import { applySuggestion, dateSpan, moduleLabel, moduleSuggestions, norm, parseQuick, quickMissing, quickToEntity } from "../lib/quickadd.js";
import { fmtMin, fmtShort, uid } from "../lib/util.js";
import { Modal } from "./primitives.jsx";

const KINDS = [["homework", "Hausaufgabe"], ["session", "Termin"], ["exam", "Prüfung"], ["log", "Lerneinheit"], ["note", "Notiz"]];
const LABEL = Object.fromEntries(KINDS);

/* letzte Eingaben, nur auf diesem Gerät */
const RECENT_KEY = "studyos-quick-recent";
const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : []; } catch { return []; } };
const remember = (text) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([text, ...readRecent().filter((x) => norm(x) !== norm(text))].slice(0, 5))); } catch { /* egal */ }
};

export function QuickAdd({ db, onClose }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("");
  const [recent] = useState(readRecent);
  const inputRef = useRef(null);
  const parsed = parseQuick(text, db.data.modules);
  const q = kind ? { ...parsed, kind } : parsed;
  const missing = text.trim() ? quickMissing(q) : [];
  const ent = q.kind ? quickToEntity(q) : null;
  const suggest = moduleSuggestions(text, db.data.modules);

  const focusAt = (value, span) => requestAnimationFrame(() => {
    const el = inputRef.current; if (!el) return;
    el.focus();
    const [a, b] = span || [value.length, value.length];
    el.setSelectionRange(a, b);
  });
  const take = (m) => { const next = applySuggestion(text, m); setText(next); focusAt(next); };
  /* Vorlage: Feld füllen und das Datum markieren, damit man nur noch das neue tippt */
  const pickRecent = (t) => { setText(t); setKind(""); focusAt(t, dateSpan(t)); };

  const submit = (e) => {
    e && e.preventDefault();
    if (!text.trim() || !ent) return;
    remember(text.trim());
    onClose();
    if (missing.length) { db.openForm(ent.kind, ent.vals, true); return; }
    db.saveQuick(ent.kind, { ...ent.vals, id: uid() }, LABEL[ent.kind]);
  };

  return (
    <Modal title="Schnelleingabe" onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="quick-text" className="sr-only">Was steht an?</label>
        <input id="quick-text" ref={inputRef} className="field w-full text-base" autoComplete="off" placeholder="Blatt 4 Analysis Fr" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && suggest.length) { e.preventDefault(); take(suggest[0]); } }} />
        {suggest.length > 0 && (
          <div className="quick-suggest mt-2 flex flex-wrap gap-1.5" aria-label="Modul vervollständigen">
            {suggest.map((m, i) => (
              <button type="button" key={m.id} className="chip" onClick={() => take(m)} style={{ boxShadow: `inset 3px 0 0 ${m.color}` }}>
                {moduleLabel(m)}{i === 0 && <span className="quick-tab" aria-hidden="true">Tab</span>}
              </button>
            ))}
          </div>
        )}
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
              {ent && (ent.vals.due || ent.vals.date) ? <span className="preview-chip">{q.kind === "homework" ? "fällig " : ""}{fmtShort(ent.vals.due || ent.vals.date)}</span> : missing.includes("Datum") && <span className="preview-chip missing">Datum fehlt</span>}
              {q.start && <span className="preview-chip">{q.start}{q.end ? `–${q.end}` : ""}</span>}
              {q.kind === "log" && <span className="preview-chip">{fmtMin(q.minutes || 45)}</span>}
              {q.kind === "log" && <span className="preview-chip">{ent.vals.kind}</span>}
              {q.kind === "session" && <span className="preview-chip">{q.sessionType}</span>}
              {q.kind === "homework" && q.subtasks.length > 0 && <span className="preview-chip">{q.subtasks.length} Teilaufgaben: {q.subtasks.length > 4 ? `${q.subtasks[0]} bis ${q.subtasks[q.subtasks.length - 1]}` : q.subtasks.join(", ")}</span>}
              {q.title && <span className="preview-chip">„{q.title}“</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-lg">{missing.length ? "Weiter im Formular" : `${LABEL[q.kind]} anlegen`}</button>
              {!missing.length && <button type="button" className="btn btn-ghost btn-lg" onClick={() => { remember(text.trim()); onClose(); db.openForm(ent.kind, ent.vals, true); }}>Im Formular bearbeiten</button>}
            </div>
          </>
        ) : (
          <>
            {recent.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-400">Zuletzt</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Letzte Eingaben">
                  {recent.map((t) => <li key={t}><button type="button" className="chip" onClick={() => pickRecent(t)}>{t}</button></li>)}
                </ul>
              </div>
            )}
            <ul className="mt-3 space-y-1 text-sm text-slate-400">
              <li><b className="text-slate-200">Blatt 4 Analysis Fr</b> wird eine Hausaufgabe</li>
              <li><b className="text-slate-200">Blatt 5 DS Fr a-c</b> bekommt die Teilaufgaben a, b und c</li>
              <li><b className="text-slate-200">Übung DS Do 14-16 MI HS 1</b> wird ein Termin</li>
              <li><b className="text-slate-200">Klausur EIDI 12.02. 10:30</b> wird eine Prüfung</li>
              <li><b className="text-slate-200">1h DS gestern</b> trägt Lernzeit nach</li>
            </ul>
          </>
        )}
      </form>
    </Modal>
  );
}
