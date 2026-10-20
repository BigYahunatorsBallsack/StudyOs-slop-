import React from "react";
import { DONE_HW, HW_STATUS, TOPIC_STATES } from "../lib/constants.js";
import { dueInfo } from "../lib/data.js";
import { fmtMin, fmtShort, isHeld, iso } from "../lib/util.js";
import { Chip, Empty, Icon } from "./primitives.jsx";
import { hasCloze, parseTags, renderCloze } from "../lib/cards.js";
import { isOcc, occLabel } from "../lib/occlusion.js";
import { SwipeRow, useSwipe } from "./swipe.jsx";
import { WatchProgress } from "./links.jsx";
import { SubtaskChecklist } from "./subtasks.jsx";
import { Select } from "./select.jsx";
import { SelectRow, SelectToggle } from "./selection.jsx";

/* ---------------- Zeilen ---------------- */
export function SessionRow({ s, db, showDate }) {
  const m = db.mod(s.moduleId), held = isHeld(s);
  const toggleReview = () => {
    db.toggleSession(s.id, "reviewed");
    if (!s.reviewed) db.toast(`${m?.name || "Termin"} nachbereitet.`, { label: "Rückgängig", run: () => db.toggleSession(s.id, "reviewed") });
  };
  if (db.sel?.kind === "session") return <SelectRow db={db} kind="session" id={s.id} color={m?.color} muted={s.cancelled || s.reviewed} title={`${m?.name || "Ohne Modul"} · ${s.type}`} meta={`${fmtShort(s.date)}, ${s.start}–${s.end}${s.room ? ", " + s.room : ""}${s.cancelled ? ", fällt aus" : s.reviewed ? ", nachbereitet" : ""}`} />;
  return (
    <SwipeRow className={s.cancelled ? "row-muted" : ""} style={{ "--mod": m?.color }} onSwipeRight={s.cancelled ? null : toggleReview} rightLabel={s.reviewed ? "Nicht nachbereitet" : "Nachbereitet"} onLongPress={() => db.menu("session", s)}>
      <button onClick={() => db.openForm("session", s)} className="row-main">
        <p className={`row-title truncate ${s.cancelled ? "line-through" : ""}`}>{m?.name || "Ohne Modul"}</p>
        <p className="row-meta">
          <span className="font-semibold text-slate-300">{s.type}</span>{", "}
          {showDate && <>{fmtShort(s.date)}, </>}{s.start}–{s.end}{s.room ? <>{", "}{s.room}</> : null}
          {s.cancelled && <span className="ml-2 font-semibold">fällt aus</span>}
        </p>
        {!s.cancelled && <WatchProgress s={s} color={m?.color} className="mt-1" />}
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

/** Geplanter Lernblock: abhaken, Timer starten, bearbeiten */
export function BlockRow({ b, db, showDate }) {
  const m = db.mod(b.moduleId);
  const mins = Math.max(5, (Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3))) - (Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3))));
  if (db.sel?.kind === "block") return <SelectRow db={db} kind="block" id={b.id} color={m?.color || "var(--accent)"} muted={b.done} title={b.title} meta={`${fmtShort(b.date)}, ${b.start}–${b.end}${m ? ", " + m.name : ""}`} />;
  return (
    <SwipeRow className={`row-block ${b.done ? "row-muted" : ""}`} style={{ "--mod": m?.color || "var(--accent)" }} onSwipeRight={() => db.patch("blocks", b.id, { done: !b.done })} rightLabel={b.done ? "Nicht erledigt" : "Erledigt"}
      onSwipeLeft={b.done ? null : () => db.postpone("block", b)} onLongPress={() => db.menu("block", b)}>
      <div className="flex items-start gap-3">
        <button className="todo-check mt-0.5" role="checkbox" aria-checked={!!b.done} aria-label={`${b.title} erledigt`} onClick={() => db.patch("blocks", b.id, { done: !b.done })}><span aria-hidden="true">{b.done ? "✓" : ""}</span></button>
        <button className="row-main min-w-0 flex-1" onClick={() => db.openForm("block", b)}>
          <p className={`row-title truncate ${b.done ? "line-through" : ""}`}>{b.title}</p>
          <p className="row-meta truncate">Lernblock{showDate ? `, ${fmtShort(b.date)}` : ""}, {b.start}–{b.end}{m ? `, ${m.name}` : ""}</p>
        </button>
        {!b.done && <button className="btn btn-ghost shrink-0" onClick={() => db.focus({ moduleId: b.moduleId || "", minutes: Math.min(90, mins), kind: b.kind, blockId: b.id, note: b.title })}>Timer</button>}
      </div>
    </SwipeRow>
  );
}

/** Notiz in der Liste eines Moduls: antippen öffnet sie, lange drücken das Schnellmenü */
export function NoteRow({ n, db, meta }) {
  const { bind } = useSwipe({ onLongPress: () => db.menu("note", n) });
  if (db.sel?.kind === "note") return <SelectRow db={db} kind="note" id={n.id} color={db.mod(n.moduleId)?.color} title={n.title} meta={meta} />;
  return (
    <li {...bind}>
      <button onClick={() => db.openNote(n.id)} className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:bg-slate-800/50">
        <p className="text-sm font-medium">{n.title}</p>
        <p className="text-xs text-slate-500">{meta}</p>
        {n.text && <p className="font-num mt-1 max-h-10 overflow-hidden whitespace-pre-wrap text-xs text-slate-400">{n.text}</p>}
      </button>
    </li>
  );
}

export function HomeworkRow({ h, db }) {
  const m = db.mod(h.moduleId), done = DONE_HW.has(h.status), dl = dueInfo(h.due, done);
  const toggleDone = () => {
    const prev = h.status, next = done ? "in Arbeit" : "abgegeben";
    db.setHwStatus(h.id, next);
    db.toast(done ? `„${h.title}“ wieder offen.` : `„${h.title}“ abgegeben.`, { label: "Rückgängig", run: () => db.setHwStatus(h.id, prev) });
  };
  if (db.sel?.kind === "homework") return <SelectRow db={db} kind="homework" id={h.id} color={m?.color} muted={done} title={h.title} meta={`${m?.name || ""}${m ? " · " : ""}${dl.text}`} />;
  return (
    <SwipeRow className={done ? "row-muted" : ""} style={{ "--mod": m?.color }} onSwipeRight={toggleDone} rightLabel={done ? "Wieder offen" : "Abgegeben"}
      onSwipeLeft={done ? null : () => db.postpone("homework", h)} onLongPress={() => db.menu("homework", h)}>
      <div className="flex items-start gap-3">
        <button onClick={() => db.openForm("homework", h)} className="row-main min-w-0 flex-1">
          <p className={`row-title truncate ${done ? "line-through" : ""}`}>{h.title}</p>
          <p className="row-meta truncate">{m?.name}{h.files?.length ? ` · ${h.files.length} ${h.files.length === 1 ? "Anhang" : "Anhänge"}` : ""}</p>
          <p className={`text-xs font-semibold ${dl.cls}`}>{h.missed && !done ? "nicht abgegeben, " : ""}{dl.text}{h.dueTime && !done ? `, ${h.dueTime} Uhr` : ""}{h.status === "bewertet" && h.maxPoints ? `, ${h.points ?? 0} von ${h.maxPoints} Punkten` : ""}</p>
        </button>
        {!done && <button className="btn btn-ghost btn-icon shrink-0" onClick={() => db.focusOn("homework", h)} aria-label={`Timer starten: ${h.title}`} title="Timer starten"><Icon name="play" className="h-4 w-4" /></button>}
        <label className="sr-only" htmlFor={"hw-" + h.id}>Status von {h.title}</label>
        <Select id={"hw-" + h.id} value={h.status} onChange={(e) => db.setHwStatus(h.id, e.target.value)} className="field w-32 shrink-0 py-1.5 text-xs">
          {HW_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
      </div>
      <SubtaskChecklist h={h} db={db} color={m?.color} />
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
  if (!cards.length) return <Empty art="card">Noch keine Karteikarten. Der Stapel wartet auf seine erste Karte.</Empty>;
  return (
    <>
    <div className="mb-1 flex justify-end"><SelectToggle db={db} kind="card" ids={cards.map((c) => c.id)} /></div>
    <ul className="rows">
      {[...cards].sort((a, b) => a.due.localeCompare(b.due)).map((c) => { const m = db.mod(c.moduleId); if (db.sel?.kind === "card") return <SelectRow key={c.id} db={db} kind="card" id={c.id} color={m?.color} title={isOcc(c) ? occLabel(c) : String(hasCloze(c.front) ? renderCloze(c.front, true) : c.front || "").replace(/\*\*/g, "")} meta={m?.name || ""} />; return (
        <li key={c.id} className="row" style={{ "--mod": m?.color }}>
          <button onClick={() => db.openForm("card", c)} className="row-main flex items-start gap-3">
            <p className="min-w-0 flex-1 truncate text-sm">{isOcc(c) ? <><span className="occ-tag">Bild</span>{occLabel(c)}</> : hasCloze(c.front) ? renderCloze(c.front, true).replace(/\*\*/g, "") : c.front}{c.tags ? <span className="ml-2 text-[11px] text-slate-500">{parseTags(c.tags).map((t) => "#" + t).join(" ")}</span> : null}</p>
            <span className={`shrink-0 text-xs font-semibold ${c.due <= t ? "text-amber-300" : "text-slate-500"}`}>{c.due <= t ? "fällig" : fmtShort(c.due)}</span>
          </button>
        </li>
      ); })}
    </ul>
    </>
  );
}
