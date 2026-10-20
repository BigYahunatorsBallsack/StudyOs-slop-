/* Lernnotiz nach einer Fokusphase: Die Lerneinheit ist schon gespeichert, hier kommt nur noch eine Zeile dazu, was du gemacht hast. */
import React, { useState } from "react";
import { fmtMin } from "../lib/util.js";
import { Modal } from "./primitives.jsx";
import { btnGhost, btnPrimary, inputCls } from "./styles.js";

export function FocusNote({ log, db, onClose, onDetails, onDiscard }) {
  const [note, setNote] = useState(log.note || "");
  const m = db.mod(log.moduleId), tp = db.data.topics.find((x) => x.id === log.topicId);
  const save = () => {
    const text = note.trim();
    if (text !== (log.note || "")) db.patch("logs", log.id, { note: text });
    onClose();
  };
  return (
    <Modal title="Fokusphase geschafft" onClose={save}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
        <p className="text-sm text-slate-300">
          <b className="stat-value text-base">{fmtMin(log.minutes)}</b> eingetragen für <span style={{ color: m?.color }}>{m?.name || "Allgemein"}</span>{tp ? `, ${tp.title}` : ""}.
        </p>
        <div>
          <label htmlFor="fn-note" className="mb-1 block text-xs text-slate-400">Was hast du gemacht? (optional)</label>
          <input id="fn-note" className={inputCls} value={note} maxLength={200} autoComplete="off" enterKeyHint="done"
            placeholder="z. B. Blatt 4, Aufgabe 2 gerechnet" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary}>{note.trim() ? "Speichern" : "Ohne Notiz weiter"}</button>
          <button type="button" className={btnGhost} onClick={() => { const text = note.trim(); onDetails({ ...log, note: text }); }}>Details</button>
          <button type="button" className="link-btn ml-auto" onClick={onDiscard}>Nicht eintragen</button>
        </div>
      </form>
    </Modal>
  );
}
