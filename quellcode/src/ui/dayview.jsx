/* Bausteine für „Heute“: Zeitstrahl, Morgen-Vorschau, Fokus auf einen Eintrag, Restzeit in der Kopfzeile */
import React, { useEffect, useState } from "react";
import { dueInfo } from "../lib/data.js";
import { FOCUS_EVENT, gapText, getFocus, liveSession, nextGap, resolveFocus, setFocus } from "../lib/dayview.js";
import { blockDone, toMin } from "../lib/blocks.js";
import { shortName } from "../lib/modules.js";
import { fmtShort, iso, nowHM } from "../lib/util.js";
import { focusTimer } from "./actions.jsx";
import { burst } from "./pixel.jsx";

/* Fokus: alle offenen Ansichten hören mit */
export function useFocus() {
  const [f, setF] = useState(getFocus);
  useEffect(() => {
    const on = () => setF(getFocus());
    window.addEventListener(FOCUS_EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(FOCUS_EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return f;
}

/** Der eine Eintrag im Fokus: Timer starten, abhaken (beendet den Fokus), Fokus beenden */
export function FocusView({ db, kind, item }) {
  const m = db.mod(item.moduleId);
  const end = () => setFocus(null);
  let title, meta, doneLabel, check;
  if (kind === "homework") {
    title = item.title; meta = [dueInfo(item.due, false, item.dueTime).text, m?.name].filter(Boolean).join(", "); doneLabel = "Abgegeben";
    check = () => db.hwDone(item, true);
  } else if (kind === "session") {
    title = m?.name || "Termin"; meta = `Nachbereiten: ${item.type} vom ${fmtShort(item.date)}`; doneLabel = "Nachbereitet";
    check = () => { db.toggleSession(item.id, "reviewed"); db.toast(`${title} nachbereitet.`, { label: "Rückgängig", run: () => db.toggleSession(item.id, "reviewed") }); };
  } else {
    title = item.title; meta = [`Lernblock ${item.start}–${item.end}`, m?.name].filter(Boolean).join(", "); doneLabel = "Erledigt";
    check = () => db.patch("blocks", item.id, blockDone(true));
  }
  return (
    <section className="hero focus-hero" style={{ "--mod": m?.color }} aria-label="Fokus">
      <p className="hero-when">Fokus</p>
      <p className="hero-title">{title}</p>
      <p className="hero-meta">{meta}</p>
      <div className="hero-actions">
        <button className="btn btn-solid" onClick={() => focusTimer(db, kind, item)}>Timer starten</button>
        <button className="btn" onClick={(e) => { burst(e.currentTarget); end(); check(); }}>{doneLabel}</button>
        <button className="btn" onClick={end}>Fokus beenden</button>
      </div>
    </section>
  );
}

/** Gemerkter Fokus, solange der Eintrag existiert und offen ist; sonst wird er vergessen */
export function useFocusedItem(data) {
  const f = useFocus();
  const r = resolveFocus(data, f);
  const stale = !!f && (!r || r.done);
  useEffect(() => { if (stale) setFocus(null); }, [stale]);
  return stale ? null : r;
}

/** Schmale Leiste: Termine und Lernblöcke des Tages in Modulfarben, Jetzt-Strich, darunter die nächste freie Lücke */
export function TimeStrip({ db, strip, data }) {
  const span = strip.to - strip.from;
  const pos = (hm) => `${((Math.min(strip.to, Math.max(strip.from, toMin(hm))) - strip.from) / span) * 100}%`;
  const gap = strip.now !== null ? nextGap(data, iso(), nowHM()) : null;
  const hh = (min) => String(Math.floor(min / 60)).padStart(2, "0");
  return (
    <section className="daystrip-wrap mt-1 mb-3" aria-label="Zeitstrahl">
      <ol className="daystrip">
        {strip.items.map((x) => { const m = db.mod(x.moduleId); return (
          <li key={x.kind + x.id} className={`daystrip-item ${x.kind === "block" ? "daystrip-block" : ""} ${x.past || x.done ? "daystrip-past" : ""} ${x.live ? "daystrip-live" : ""}`}
            style={{ "--mod": m?.color || "var(--accent)", left: pos(x.start), width: `calc(${pos(x.end)} - ${pos(x.start)})` }}
            title={`${x.start}–${x.end} ${m?.name || x.title}`}>
            <span className="sr-only">{x.start} bis {x.end}: {m?.name || x.title}{x.kind === "block" ? ` (Lernblock ${x.title})` : `, ${x.title}`}{x.live ? ", läuft gerade" : ""}</span>
          </li>
        ); })}
        {strip.now !== null && strip.now >= strip.from && strip.now <= strip.to && <li className="daystrip-now" style={{ left: `${((strip.now - strip.from) / span) * 100}%` }} aria-hidden="true" />}
      </ol>
      <div className="daystrip-scale" aria-hidden="true"><span>{hh(strip.from)}</span><span>{hh(strip.to)}</span></div>
      {gap && <p className="daystrip-gap">{gapText(gap)}</p>}
    </section>
  );
}

/** Ab 18 Uhr: was morgen ansteht */
export function TomorrowCard({ db, p }) {
  const f = p.first, fm = f ? db.mod(f.moduleId) : null;
  return (
    <section className="tomorrow surface mt-3" aria-label="Morgen">
      <h3 className="section-title">Morgen</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {f && <li><button className="row-main text-left" onClick={() => db.openForm("session", f)}><b className="font-num">{f.start}</b> {fm?.name || f.type}{f.room ? `, ${f.room}` : ""}<span className="row-meta">{fm ? `, ${f.type}` : ""}</span></button></li>}
        {p.exams.map(({ e, retake }) => (
          <li key={e.id + retake}><button className="row-main text-left" onClick={() => db.goLearn("pruefungen")}><b>{retake ? "Wiederholungsprüfung" : "Prüfung"}</b> {db.mod(e.moduleId)?.name || ""}{e.time && !retake ? ` um ${e.time}` : ""}{e.room && !retake ? `, ${e.room}` : ""}</button></li>
        ))}
        {p.homework.map((h) => (
          <li key={h.id}><button className="row-main text-left" onClick={() => db.openForm("homework", h)}><b>Abgabe</b> {h.title}{h.dueTime ? ` bis ${h.dueTime}` : ""}{db.mod(h.moduleId) ? `, ${db.mod(h.moduleId).name}` : ""}</button></li>
        ))}
      </ul>
    </section>
  );
}

/** Kopfzeile: während eines Termins klein die Restzeit, z. B. „DS · noch 35 min“ */
export function LiveLeft({ data }) {
  const [now, setNow] = useState(nowHM);
  useEffect(() => { const id = setInterval(() => setNow(nowHM()), 15000); return () => clearInterval(id); }, []);
  const live = liveSession(data.sessions || [], iso(), now);
  if (!live) return null;
  const m = (data.modules || []).find((x) => x.id === live.s.moduleId);
  const name = m ? shortName(m.name) : live.s.type;
  const left = live.left < 60 ? `${live.left} min` : `${Math.floor(live.left / 60)} h ${live.left % 60} min`;
  return <span className="live-left font-num" title={`${m?.name || live.s.type} läuft bis ${live.s.end}`}>{name} · noch {left}</span>;
}
