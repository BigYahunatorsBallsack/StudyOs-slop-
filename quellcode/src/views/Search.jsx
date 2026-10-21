import React, { useState, useEffect, useMemo, useRef } from "react";
import { searchAll } from "../lib/data.js";
import { fmt, fmtShort } from "../lib/util.js";
import { Markdown, SelectionCardButton, WikiCtx } from "../ui/markdown.jsx";
import { backlinks, findNote } from "../lib/wiki.js";
import { Dot, Icon, Modal } from "../ui/primitives.jsx";
import { btnGhost, btnPrimary, inputCls } from "../ui/styles.js";
import { Attachments } from "../ui/Attachments.jsx";
import { cardsFromNote } from "../lib/cards.js";
import { matchCommands } from "../lib/commands.js";
import { readRecent, recentResults, rememberOpened } from "../lib/recent.js";
import { toggleTask } from "../lib/notes.js";

export function SearchModal({ data, db, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recent] = useState(readRecent);
  /* Ohne Eingabe zuerst zuletzt Geöffnetes, dann Befehle („neue Abgabe“, „timer ds“), dann Treffer in den Daten */
  const results = useMemo(() => [...(q.trim() ? [] : recentResults(data, recent)), ...matchCommands(q, data.modules).map((c) => ({ kind: "command", label: "Aktion", item: { id: c.id }, title: c.title, sub: c.sub, act: c.act })), ...searchAll(data, q)], [data, q, recent]);
  useEffect(() => setSel(0), [q]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && results[sel]) { e.preventDefault(); onPick(results[sel]); }
  };
  return (
    <Modal title="Suchen" onClose={onClose}>
      <label htmlFor="search-q" className="sr-only">Suchbegriff</label>
      <input id="search-q" className={inputCls} placeholder="Suchen oder Befehl, z. B. „neue Abgabe“, „timer DS“" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoComplete="off"
        role="combobox" aria-expanded={results.length > 0} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={results[sel] ? `search-opt-${sel}` : undefined} />
      <div className="mt-3">
        {!results.length ? <p className="text-sm text-slate-400">Keine Treffer für „{q}“.</p>
          : (
            <ul id="search-results" className="space-y-1" role="listbox" aria-label="Suchergebnisse">
              {results.map((r, i) => { const m = db.mod(r.item.moduleId) || (r.kind === "module" ? r.item : null); return (
                /* Auswahl mit Pfeiltasten im Suchfeld (Combobox), darum hier kein eigener Knopf in der Option */
                <li key={r.key || r.kind + r.item.id} id={`search-opt-${i}`} role="option" aria-selected={i === sel}
                  onClick={() => onPick(r)} onMouseEnter={() => setSel(i)} className={`flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left ${i === sel ? "bg-slate-800" : "hover:bg-slate-800/60"}`}>
                    <Dot color={m?.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.title}</p>
                      <p className="truncate text-xs text-slate-500">{r.kind === "command" ? r.sub : `${r.label} · ${r.sub}`}</p>
                    </div>
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
  useEffect(() => rememberOpened("note", note.id), [note.id]);
  const notes = db.data.notes;
  const wiki = { resolve: (name) => findNote(notes, name, note.moduleId), open: (id) => db.openNote(id) };
  const back = backlinks(notes, note);
  const newCards = cardsFromNote(note.text, db.data.cards.filter((c) => c.moduleId === note.moduleId).map((c) => c.front));
  const body = useRef(null);
  /* Kästchen abhaken ändert nur „[ ]“ bzw. „[x]“ im Text; Karten aus der Notiz bleiben davon unberührt */
  const toggle = (line) => db.patch("notes", note.id, (n) => ({ text: toggleTask(n.text, line) }));
  return (
    <Modal title={note.title || "Notiz"} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">{note.pinned && <span className="pin-mark mr-1"><Icon name="pin" className="mark-icon" />Angeheftet ·</span>}{m?.name || "Allgemein"}{ses ? ` · ${fmtShort(ses.date)} ${ses.type}` : ""} · zuletzt bearbeitet {fmt(note.updated)}</p>
      <div ref={body}>
        <WikiCtx.Provider value={wiki}>
          {note.text ? <Markdown text={note.text} onToggleTask={toggle} /> : <p className="text-sm text-slate-500">Diese Notiz ist leer.</p>}
        </WikiCtx.Provider>
      </div>
      {db.cardFromText && <SelectionCardButton within={body} onMake={(t) => db.cardFromText(t, note.moduleId)} />}
      {back.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-400">Verlinkt von</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {back.map((n) => <li key={n.id}><button type="button" className="wiki-link text-sm" onClick={() => db.openNote(n.id)}>{n.title || "Notiz"}</button></li>)}
          </ul>
        </div>
      )}
      {(note.files || []).length > 0 && <Attachments db={db} coll="notes" itemId={note.id} />}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={onEdit}>Bearbeiten</button>
        <button className={btnGhost} aria-pressed={!!note.pinned} onClick={() => db.patch("notes", note.id, { pinned: !note.pinned })}>{note.pinned ? "Lösen" : "Anheften"}</button>
        {newCards.length > 0 && note.moduleId && <button className={btnGhost} onClick={() => { db.cardsFromNote(note, newCards); onClose(); }}>{newCards.length} {newCards.length === 1 ? "Karteikarte" : "Karteikarten"} erzeugen</button>}
        <button className={btnGhost} onClick={onClose}>Schließen</button>
      </div>
      <p className="mt-3 text-[11px] text-slate-600">Formatierung: # Überschrift, - Liste, **fett**, *kursiv*, `Code`, ```java für eingefärbten Code, Formeln mit $x^2$ oder $$\sum_{"{"}i=1{"}"}^n i$$, [Link](https://…), andere Notiz mit [[Titel]]. Checkliste: - [ ] Punkt. Karteikarten: eine Zeile „Frage :: Antwort“, ein Lückentext {"{{c1::Antwort}}"} oder Text markieren und „Karte daraus“.</p>
    </Modal>
  );
}
