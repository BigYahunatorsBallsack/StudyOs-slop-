/* Tastenkürzel für die Desktop-Nutzung. Greifen nicht, solange ein Eingabefeld oder Dialog aktiv ist. */
import React from "react";
import { Modal } from "./primitives.jsx";

export const SHORTCUTS = [
  ["Allgemein", [["?", "Diese Übersicht"], ["/ oder Strg + K", "Suchen"], ["E", "Schnelleingabe"], ["Esc", "Dialog schließen"]]],
  ["Neu anlegen", [["N", "Notiz"], ["H", "Hausaufgabe"], ["L", "Lerneinheit"], ["S", "Termin (Session)"], ["P", "Prüfung"]]],
  ["Navigation", [["1 bis 5", "Heute, Module, Woche, Lernen, Mehr"], ["T", "Timer"], ["K / J", "Liste: vorheriger / nächster Eintrag"], ["Enter", "Eintrag öffnen"]]],
  ["Timer", [["Leertaste", "Start / Pause (im Timer)"]]],
];

const isTyping = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/* Nächstes/vorheriges Listenelement im Hauptbereich fokussieren */
function moveFocus(dir) {
  const rows = [...document.querySelectorAll("main li")]
    .map((li) => li.querySelector("button, a[href], [tabindex]:not([tabindex='-1'])"))
    .filter((el) => el && el.offsetParent !== null);
  if (!rows.length) return;
  const cur = rows.findIndex((el) => el === document.activeElement || el.closest("li")?.contains(document.activeElement));
  const next = rows[cur < 0 ? (dir > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, cur + dir))];
  next.focus();
  next.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Liefert den keydown-Handler; `act` enthält die App-Aktionen. */
export function shortcutHandler(act) {
  return (e) => {
    if (e.defaultPrevented) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); act.search(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('[role="dialog"]') || isTyping(e.target)) return;
    const k = e.key;
    const map = {
      "/": act.search, "?": act.help, e: act.quick, E: act.quick,
      n: () => act.create("note"), h: () => act.create("homework"), l: () => act.create("log"), s: () => act.create("session"), p: () => act.create("exam"),
      t: act.timer, j: () => moveFocus(1), k: () => moveFocus(-1),
      1: () => act.tab("heute"), 2: () => act.tab("module"), 3: () => act.tab("woche"), 4: () => act.tab("lernen"), 5: () => act.tab("mehr"),
    };
    const fn = map[k] || map[k.toLowerCase?.()];
    if (fn) { e.preventDefault(); fn(); }
  };
}

export function ShortcutHelp({ onClose }) {
  return (
    <Modal title="Tastenkürzel" onClose={onClose}>
      <div className="space-y-4">
        {SHORTCUTS.map(([group, items]) => (
          <section key={group}>
            <h3 className="mb-1 text-sm font-semibold text-slate-400">{group}</h3>
            <dl className="space-y-1">
              {items.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-slate-300">{label}</dt>
                  <dd><kbd className="kbd">{key}</kbd></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
