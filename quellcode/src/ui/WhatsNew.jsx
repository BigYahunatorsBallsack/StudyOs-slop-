/* „Was ist neu“: einmal nach einem Update eine wegklickbare Karte, unter Mehr jederzeit die ganze Liste */
import React, { useEffect, useState } from "react";
import { WHATS_NEW, freshItems, markSeen, readSeen } from "../lib/whatsnew.js";
import { Card } from "./primitives.jsx";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
const SHOWN = 5;

export function WhatsNewCard({ ready, hasData, onAll }) {
  const [items, setItems] = useState(null);
  /* einmal nach dem Laden entscheiden; beim allerersten Start (ohne Daten) nur still merken */
  useEffect(() => {
    if (!ready || items !== null) return;
    const cur = WHATS_NEW[0], seen = readSeen();
    if (!cur) { setItems([]); return; }
    const fresh = freshItems(cur, seen, hasData);
    if (!seen && !fresh.length) markSeen(cur.items);
    setItems(fresh);
  }, [ready]);
  if (!items || !items.length) return null;
  const close = () => { markSeen(WHATS_NEW[0].items); setItems([]); };
  return (
    <section className="notice notice-info mb-4" aria-label="Was ist neu">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="notice-title">Neu in StudyOS{APP_VERSION ? ` ${APP_VERSION}` : ""}</p>
          <ul className="whatsnew-list">{items.slice(0, SHOWN).map((t, j) => <li key={j}>{t}</li>)}</ul>
          <button className="link-btn mt-2" onClick={() => { close(); onAll(); }}>{items.length > SHOWN ? `Alle ${items.length} ansehen` : "Alle ansehen"}</button>
        </div>
        <button onClick={close} className="btn btn-icon" aria-label="Was ist neu schließen">✕</button>
      </div>
    </section>
  );
}

/* Mehr → Was ist neu */
export function WhatsNewList() {
  useEffect(() => { if (WHATS_NEW[0]) markSeen(WHATS_NEW[0].items); }, []);
  if (!WHATS_NEW.length) return <p className="text-sm text-slate-400">Keine Neuigkeiten in dieser Version.</p>;
  return (
    <div className="space-y-4">
      {WHATS_NEW.map((s, i) => (
        <Card key={s.version || "neu"} title={s.version ? `Version ${s.version}` : i === 0 ? "Zuletzt dazugekommen" : "Neu"}>
          <ul className="whatsnew-list text-sm">{s.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        </Card>
      ))}
    </div>
  );
}
