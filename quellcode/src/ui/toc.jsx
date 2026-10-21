/* Inhaltsverzeichnis über einer langen Notiz: einklappbar, Antippen springt zur Überschrift.
   Ob es offen ist, merkt sich das Gerät. Bei „Bewegung aus“ bzw. reduzierter Bewegung springt es ohne Scrollen. */
import React, { useState } from "react";
import { noteHeadings, TOC_MIN, tocDepth } from "../lib/toc.js";

const OPEN_KEY = "studyos-toc-offen";
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; } };
const still = () => {
  if (document.documentElement.dataset.motion === "off") return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** idPrefix muss zu <Markdown idPrefix> passen. */
export function NoteToc({ text, idPrefix }) {
  const items = noteHeadings(text);
  const [open, setOpen] = useState(readOpen);
  if (items.length < TOC_MIN) return null;
  const depth = tocDepth(items), listId = `${idPrefix}-toc`;
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(OPEN_KEY, n ? "1" : "0"); } catch { /* egal */ } };
  const jump = (line) => {
    const el = document.getElementById(`${idPrefix}-${line}`);
    if (!el) return;
    el.scrollIntoView({ behavior: still() ? "instant" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };
  return (
    <nav className="note-toc" aria-label="Inhaltsverzeichnis">
      <button type="button" className="note-toc-toggle" aria-expanded={open} aria-controls={listId} onClick={toggle}>
        <span>Inhalt</span><span className="row-meta">{items.length} Abschnitte</span>
        <span className="subtasks-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ol id={listId} className="note-toc-list">
          {items.map((x) => (
            <li key={x.line} style={{ paddingLeft: `${depth(x) * 0.9}rem` }}>
              <button type="button" className="note-toc-link" onClick={() => jump(x.line)}>{x.text}</button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
