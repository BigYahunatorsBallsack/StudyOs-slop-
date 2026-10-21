/* Gruppenabgabe im Formular: Partner als Namen, bisherige Partner des Moduls zum Antippen. */
import React, { useState } from "react";
import { cleanPartners, MAX_PARTNERS, splitNames } from "../lib/partners.js";

export function PartnerInput({ id, value, onChange, suggestions = [] }) {
  const list = cleanPartners(value);
  const [draft, setDraft] = useState("");
  const add = (names) => { const n = cleanPartners([...list, ...names]); if (n.length !== list.length) onChange(n); setDraft(""); };
  const open = suggestions.filter((s) => !list.some((x) => x.toLowerCase() === s.toLowerCase()));
  return (
    <div className="partner-input">
      {list.length > 0 && (
        <ul className="partner-list">
          {list.map((p) => (
            <li key={p} className="chip partner-chip">
              {p}
              <button type="button" className="partner-remove" onClick={() => onChange(list.filter((x) => x !== p))} aria-label={`${p} entfernen`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX_PARTNERS && (
        <input id={id} className="field w-full" value={draft} autoComplete="off" placeholder={list.length ? "Weitere Person" : "z. B. Max, Lea"}
          onChange={(e) => { const v = e.target.value; if (/[,;]$/.test(v)) add(splitNames(v)); else setDraft(v); }}
          onBlur={() => draft.trim() && add(splitNames(draft))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) add(splitNames(draft)); } else if (e.key === "Backspace" && !draft && list.length) onChange(list.slice(0, -1)); }} />
      )}
      {open.length > 0 && list.length < MAX_PARTNERS && (
        <div className="partner-suggest" role="group" aria-label="Bisherige Partner">
          {open.map((s) => <button type="button" key={s} className="chip" onClick={() => add([s])}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}
