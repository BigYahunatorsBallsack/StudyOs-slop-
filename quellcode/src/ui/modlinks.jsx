/* Links pro Modul: Bearbeiten im Modul-Formular und die Knopfzeile oben auf der Modulseite. */
import React from "react";
import { linkName, moduleLinks, newLink } from "../lib/modlinks.js";

/** Formularfeld: Name und Adresse je Zeile; ohne Namen gilt der erkannte (Moodle, Artemis, Zulip …). */
export function LinkEditor({ id, value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const set = (lid, p) => onChange(list.map((l) => (l.id === lid ? { ...l, ...p } : l)));
  return (
    <div id={id} className="link-editor" role="group" aria-label="Links">
      {list.length > 0 && (
        <ul className="link-editor-list">
          {list.map((l, i) => (
            <li key={l.id}>
              <input className="field link-editor-name py-1.5 text-sm" value={l.name} placeholder={linkName(l.url) || "Name"} autoComplete="off"
                onChange={(e) => set(l.id, { name: e.target.value })} aria-label={`Name von Link ${i + 1}`} />
              <input className="field min-w-0 flex-1 py-1.5 text-sm" type="url" inputMode="url" value={l.url} placeholder="https://…" autoComplete="off"
                onChange={(e) => set(l.id, { url: e.target.value })} aria-label={`Adresse von Link ${i + 1}`} />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => onChange(list.filter((x) => x.id !== l.id))} aria-label={`Link ${l.name || linkName(l.url) || i + 1} entfernen`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div><button type="button" className="btn" onClick={() => onChange([...list, newLink()])} disabled={list.length >= 12}>+ Link</button></div>
    </div>
  );
}

/** Knöpfe für die Links des Moduls (eigene, Aufzeichnungen, Artemis-Kurs aus dem Abo), öffnen in neuem Tab. */
export function ModuleLinkButtons({ m, settings, className }) {
  return moduleLinks(m, settings).map((l) => (
    <a key={l.url} className={className} href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>
  ));
}
