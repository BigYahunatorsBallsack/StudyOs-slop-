import React, { useState, useEffect, useMemo } from "react";
import { searchAll } from "../lib/data.js";
import { fmt, fmtShort } from "../lib/util.js";
import { Markdown } from "../ui/markdown.jsx";
import { Dot, Modal } from "../ui/primitives.jsx";
import { btnGhost, btnPrimary, focusRing, inputCls } from "../ui/styles.js";
import { Attachments } from "../ui/Attachments.jsx";
import { cardsFromNote } from "../lib/cards.js";

export function SearchModal({ data, db, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const results = useMemo(() => searchAll(data, q), [data, q]);
  useEffect(() => setSel(0), [q]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && results[sel]) { e.preventDefault(); onPick(results[sel]); }
  };
  return (
    <Modal title="Suchen" onClose={onClose}>
      <label htmlFor="search-q" className="sr-only">Suchbegriff</label>
      <input id="search-q" className={inputCls} placeholder="Module, Hausaufgaben, Themen, Notizen, Karten …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoComplete="off" />
      <div className="mt-3">
        {!q.trim() ? <p className="text-xs text-slate-500">Tipp: Mehrere Wörter grenzen die Suche ein. Am Computer öffnest du die Suche mit Strg + K oder „/“.</p>
          : !results.length ? <p className="text-sm text-slate-400">Keine Treffer für „{q}“.</p>
          : (
            <ul className="space-y-1" role="listbox" aria-label="Suchergebnisse">
              {results.map((r, i) => { const m = db.mod(r.item.moduleId) || (r.kind === "module" ? r.item : null); return (
                <li key={r.kind + r.item.id} role="option" aria-selected={i === sel}>
                  <button onClick={() => onPick(r)} onMouseEnter={() => setSel(i)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${focusRing} ${i === sel ? "bg-slate-800" : "hover:bg-slate-800/60"}`}>
                    <Dot color={m?.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.title}</p>
                      <p className="truncate text-xs text-slate-500">{r.label} · {r.sub}</p>
                    </div>
                  </button>
                </li>
              ); })}
            </ul>
          )}
      </div>
    </Modal>
  );
}

export function NoteViewer({ note, db, onClose, onEdit }) {
  const m = db.mod(note.moduleId), ses = db.data.sessions.find((x) => x.id === note.sessionId);
  const newCards = cardsFromNote(note.text, db.data.cards.filter((c) => c.moduleId === note.moduleId).map((c) => c.front));
  return (
    <Modal title={note.title || "Notiz"} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">{m?.name || "Allgemein"}{ses ? ` · ${fmtShort(ses.date)} ${ses.type}` : ""} · zuletzt bearbeitet {fmt(note.updated)}</p>
      {note.text ? <Markdown text={note.text} /> : <p className="text-sm text-slate-500">Diese Notiz ist leer.</p>}
      {(note.files || []).length > 0 && <Attachments db={db} coll="notes" itemId={note.id} />}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={onEdit}>Bearbeiten</button>
        {newCards.length > 0 && note.moduleId && <button className={btnGhost} onClick={() => { db.cardsFromNote(note, newCards); onClose(); }}>{newCards.length} {newCards.length === 1 ? "Karteikarte" : "Karteikarten"} erzeugen</button>}
        <button className={btnGhost} onClick={onClose}>Schließen</button>
      </div>
      <p className="mt-3 text-[11px] text-slate-600">Formatierung: # Überschrift, - Liste, **fett**, *kursiv*, `Code`, ```java für eingefärbten Code, Formeln mit $x^2$ oder $$\sum_{"{"}i=1{"}"}^n i$$, [Link](https://…). Karteikarten: eine Zeile „Frage :: Antwort“ oder ein Lückentext {"{{c1::Antwort}}"}.</p>
    </Modal>
  );
}
