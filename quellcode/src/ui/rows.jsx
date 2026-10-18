import React, { useState, useEffect, useRef, useMemo } from "react";
import { DONE_HW, HW_STATUS, TOPIC_STATES } from "../lib/constants.js";
import { dueInfo } from "../lib/data.js";
import { fmtMin, fmtShort, isHeld, iso } from "../lib/util.js";
import { Chip, Empty } from "./primitives.jsx";
import { hasCloze, parseTags, renderCloze } from "../lib/cards.js";
import { SwipeRow } from "./swipe.jsx";

/* ---------------- Zeilen ---------------- */
export function SessionRow({ s, db, showDate }) {
  const m = db.mod(s.moduleId), held = isHeld(s);
  const toggleReview = () => {
    db.toggleSession(s.id, "reviewed");
    if (!s.reviewed) db.toast(`${m?.name || "Termin"} nachbereitet.`, { label: "Rückgängig", run: () => db.toggleSession(s.id, "reviewed") });
  };
  return (
    <SwipeRow className={s.cancelled ? "row-muted" : ""} style={{ "--mod": m?.color }} onSwipeRight={s.cancelled ? null : toggleReview} rightLabel={s.reviewed ? "Nicht nachbereitet" : "Nachbereitet"}>
      <button onClick={() => db.openForm("session", s)} className="row-main">
        <p className={`row-title truncate ${s.cancelled ? "line-through" : ""}`}>{m?.name || "Ohne Modul"}</p>
        <p className="row-meta">
          <span className="font-semibold text-slate-300">{s.type}</span>{", "}
          {showDate && <>{fmtShort(s.date)}, </>}{s.start}–{s.end}{s.room ? <>{", "}{s.room}</> : null}
          {s.cancelled && <span className="ml-2 font-semibold">fällt aus</span>}
        </p>
      </button>
      {!s.cancelled && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip color={m?.color} on={s.prepared} label="Vorbereitet" onClick={() => db.toggleSession(s.id, "prepared")} />
          <Chip color={m?.color} on={s.attended} label="Besucht" onClick={() => db.toggleSession(s.id, "attended")} />
          <Chip color={m?.color} on={s.reviewed} label="Nachbereitet" warn={held && !s.reviewed} onClick={() => db.toggleSession(s.id, "reviewed")} />
        </div>
      )}
    </SwipeRow>
  );
}

export function HomeworkRow({ h, db }) {
  const m = db.mod(h.moduleId), done = DONE_HW.has(h.status), dl = dueInfo(h.due, done);
  const toggleDone = () => {
    const prev = h.status, next = done ? "in Arbeit" : "abgegeben";
    db.setHwStatus(h.id, next);
    db.toast(done ? `„${h.title}“ wieder offen.` : `„${h.title}“ abgegeben.`, { label: "Rückgängig", run: () => db.setHwStatus(h.id, prev) });
  };
  return (
    <SwipeRow className={done ? "row-muted" : ""} style={{ "--mod": m?.color }} onSwipeRight={toggleDone} rightLabel={done ? "Wieder offen" : "Abgegeben"}>
      <div className="flex items-start gap-3">
        <button onClick={() => db.openForm("homework", h)} className="row-main min-w-0 flex-1">
          <p className={`row-title truncate ${done ? "line-through" : ""}`}>{h.title}</p>
          <p className="row-meta truncate">{m?.name}</p>
          <p className={`text-xs font-semibold ${dl.cls}`}>{dl.text}{h.dueTime && !done ? `, ${h.dueTime} Uhr` : ""}{h.status === "bewertet" && h.maxPoints ? `, ${h.points ?? 0} von ${h.maxPoints} Punkten` : ""}</p>
        </button>
        <label className="sr-only" htmlFor={"hw-" + h.id}>Status von {h.title}</label>
        <select id={"hw-" + h.id} value={h.status} onChange={(e) => db.setHwStatus(h.id, e.target.value)} className="field w-32 shrink-0 py-1.5 text-xs">
          {HW_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
    </SwipeRow>
  );
}

export function TopicRow({ x, db, minutes }) {
  const m = db.mod(x.moduleId);
  return (
    <li className="row" style={{ "--mod": m?.color }}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => db.openForm("topic", x)} className="row-main min-w-0">
          <p className="row-title">{x.title}</p>
          <p className="row-meta">{minutes ? fmtMin(minutes) + " gelernt" : "noch keine Lernzeit"}</p>
        </button>
        <div className="flex shrink-0" role="group" aria-label={`Selbsteinschätzung ${x.title}`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => db.patch("topics", x.id, { rating: x.rating === n ? 0 : n })} aria-label={`${n} von 5`} aria-pressed={(x.rating || 0) >= n}
              className={`px-0.5 text-base leading-none ${(x.rating || 0) >= n ? "text-amber-300" : "text-slate-600 hover:text-slate-400"}`}>★</button>
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label={`Stand ${x.title}`}>
        {TOPIC_STATES.map((st, i) => {
          const active = x.state === st, reached = TOPIC_STATES.indexOf(x.state) >= i;
          return (
            <button key={st} onClick={() => db.patch("topics", x.id, { state: st })} aria-pressed={active} className="chip justify-center px-1"
              style={reached ? { background: active ? m?.color || "var(--accent)" : `color-mix(in srgb, ${m?.color || "var(--accent)"} 25%, transparent)`, color: active ? "var(--on-module)" : "var(--text)" } : undefined}>
              {st}
            </button>
          );
        })}
      </div>
    </li>
  );
}

export function LogRow({ l, db }) {
  const m = db.mod(l.moduleId), tp = db.data.topics.find((x) => x.id === l.topicId);
  return (
    <li className="row" style={{ "--mod": m?.color }}>
      <button onClick={() => db.openForm("log", l)} className="row-main flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="row-title truncate">{m?.name || "Allgemein"}</p>
          <p className="row-meta truncate">{fmtShort(l.date)}, {l.kind}{tp ? `, ${tp.title}` : ""}{l.note ? `: ${l.note}` : ""}</p>
        </div>
        <span className="stat-value shrink-0 text-base">{fmtMin(l.minutes)}</span>
      </button>
    </li>
  );
}

export function CardList({ cards, db }) {
  const t = iso();
  if (!cards.length) return <Empty>Noch keine Karteikarten.</Empty>;
  return (
    <ul className="rows">
      {[...cards].sort((a, b) => a.due.localeCompare(b.due)).map((c) => { const m = db.mod(c.moduleId); return (
        <li key={c.id} className="row" style={{ "--mod": m?.color }}>
          <button onClick={() => db.openForm("card", c)} className="row-main flex items-start gap-3">
            <p className="min-w-0 flex-1 truncate text-sm">{hasCloze(c.front) ? renderCloze(c.front, true).replace(/\*\*/g, "") : c.front}{c.tags ? <span className="ml-2 text-[11px] text-slate-500">{parseTags(c.tags).map((t) => "#" + t).join(" ")}</span> : null}</p>
            <span className={`shrink-0 text-xs font-semibold ${c.due <= t ? "text-amber-300" : "text-slate-500"}`}>{c.due <= t ? "fällig" : fmtShort(c.due)}</span>
          </button>
        </li>
      ); })}
    </ul>
  );
}
