/* Schnellmenü (lange drücken, Rechtsklick) und Verschieben (nach links wischen) für Einträge in Listen */
import React, { useState } from "react";
import { DONE_HW } from "../lib/constants.js";
import { postponeTargets } from "../lib/postpone.js";
import { addDays, fmtShort, iso } from "../lib/util.js";
import { Modal } from "./primitives.jsx";

const minutesOf = (b) => Math.max(5, (Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3))) - (Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3))));

/** Aktionen je Art; jede Aktion ist { label, run, danger? } */
export function itemActions(db, kind, item) {
  const m = db.mod(item.moduleId);
  if (kind === "homework") {
    const done = DONE_HW.has(item.status);
    return [
      { label: done ? "Wieder offen" : "Abgegeben", run: () => db.hwDone(item, !done) },
      !done && { label: "Verschieben …", run: () => db.postpone("homework", item) },
      !done && { label: "Timer starten", run: () => db.focusOn("homework", item) },
      { label: "Bearbeiten", run: () => db.openForm("homework", item) },
      { label: "Löschen", danger: true, run: () => db.remove("homework", item.id) },
    ].filter(Boolean);
  }
  if (kind === "block") {
    return [
      { label: item.done ? "Nicht erledigt" : "Erledigt", run: () => db.patch("blocks", item.id, { done: !item.done }) },
      !item.done && { label: "Verschieben …", run: () => db.postpone("block", item) },
      !item.done && { label: "Timer starten", run: () => db.focus({ moduleId: item.moduleId || "", minutes: Math.min(90, minutesOf(item)), kind: item.kind, blockId: item.id, note: item.title }) },
      { label: "Bearbeiten", run: () => db.openForm("block", item) },
      { label: "Löschen", danger: true, run: () => db.remove("block", item.id) },
    ].filter(Boolean);
  }
  if (kind === "session") {
    return [
      !item.cancelled && { label: item.reviewed ? "Nicht nachbereitet" : "Nachbereitet", run: () => db.toggleSession(item.id, "reviewed") },
      !item.cancelled && { label: item.attended ? "Nicht besucht" : "Besucht", run: () => db.toggleSession(item.id, "attended") },
      !item.cancelled && !item.reviewed && { label: "Timer zum Nachbereiten", run: () => db.focusOn("session", item) },
      { label: "Notiz", run: () => db.openForm("note", { moduleId: item.moduleId, sessionId: item.id }, true) },
      /^https:\/\//i.test(m?.liveUrl || "") && { label: "Aufzeichnung öffnen", run: () => window.open(m.liveUrl, "_blank", "noopener") },
      { label: "Bearbeiten", run: () => db.openForm("session", item) },
      { label: "Löschen", danger: true, run: () => db.remove("session", item.id) },
    ].filter(Boolean);
  }
  if (kind === "exam") {
    return [
      !item.registered && { label: "Angemeldet", run: () => db.patch("exams", item.id, { registered: true }) },
      { label: "Lernplan", run: () => db.goLearn("pruefungen") },
      { label: "Bearbeiten", run: () => db.openForm("exam", item) },
    ].filter(Boolean);
  }
  return [];
}

export const menuTitle = (db, kind, item) => (kind === "session" ? `${db.mod(item.moduleId)?.name || "Termin"}, ${fmtShort(item.date)}` : kind === "exam" ? `Prüfung ${db.mod(item.moduleId)?.name || ""}` : item.title || "Eintrag");

export function ItemMenu({ db, kind, item, onClose }) {
  const acts = itemActions(db, kind, item);
  return (
    <Modal title={menuTitle(db, kind, item)} onClose={onClose}>
      <ul className="menu-list">
        {acts.map((a) => (
          <li key={a.label}><button className={`menu-item ${a.danger ? "menu-danger" : ""}`} onClick={() => { onClose(); a.run(); }}>{a.label}</button></li>
        ))}
      </ul>
    </Modal>
  );
}

/** Neue Frist bzw. neuer Tag; bei überfälligen Abgaben zusätzlich „Nicht abgegeben“ */
export function PostponeSheet({ db, kind, item, onClose }) {
  const t = iso(), current = kind === "homework" ? item.due : item.date;
  const [date, setDate] = useState(current && current > t ? addDays(current, 1) : addDays(t, 1));
  const go = (d) => { onClose(); db.moveTo(kind, item, d); };
  return (
    <Modal title={`${item.title || "Eintrag"} verschieben`} onClose={onClose}>
      <ul className="menu-list">
        {postponeTargets(current, t).map((x) => (
          <li key={x.label}><button className="menu-item" onClick={() => go(x.date)}>{x.label}<span className="menu-meta">{fmtShort(x.date)}</span></button></li>
        ))}
      </ul>
      <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (date) go(date); }}>
        <label className="min-w-0 flex-1 text-xs text-slate-400">Anderer Tag
          <input type="date" className="field mt-1 w-full" value={date} min={t} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-solid" type="submit">Verschieben</button>
      </form>
      {kind === "homework" && current && current < t && (
        <button className="link-btn mt-4" onClick={() => { onClose(); db.hwMissed(item); }}>Nicht abgegeben, aus der Liste nehmen</button>
      )}
    </Modal>
  );
}
