import React, { useState, useEffect, useRef } from "react";
import { DONE_HW, WD, WD_LONG } from "../lib/constants.js";
import { addDays, byTime, fmt, fmtMin, fmtShort, isHeld, iso, isoWeek, nowHM, sum, uid, wdIdx, weekStart } from "../lib/util.js";
import { BlockRow, HomeworkRow, SessionRow } from "../ui/rows.jsx";
import { Tabs } from "../ui/primitives.jsx";
import { SelectToggle } from "../ui/selection.jsx";
import { isActive } from "../lib/data.js";
import { SessionPopover, useHoverCard } from "../ui/session.jsx";
import { suggestBlocks } from "../lib/blocks.js";
import { sessionCoverage } from "../lib/study.js";
import { offDay } from "../lib/holidays.js";
import { dragTo, hourRange, movePatch, slotAt } from "../lib/gridmove.js";
import { toHM } from "../lib/blocks.js";
import { shortName } from "../lib/modules.js";
import { PullRefresh } from "../ui/pull.jsx";

const HOUR_PX = 46;
const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };

/* Überlappende Termine nebeneinander legen: Spuren pro Tag */
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
  const lanes = [], out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((e) => e.lane + 1)); cluster.forEach((e) => { e.lanes = n; }); cluster = []; lanes.length = 0; };
  for (const ev of sorted) {
    const s = toMin(ev.start), e = Math.max(s + 30, toMin(ev.end || ev.start));
    if (s >= clusterEnd && cluster.length) flush();
    let lane = lanes.findIndex((end) => end <= s);
    if (lane < 0) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
    const item = { ev, s, e, lane };
    cluster.push(item); out.push(item);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

export function WeekView({ db, compact = false }) {
  const { data } = db, t = iso();
  const [ws, setWs] = useState(weekStart(t));
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("studyos-week-mode") || "raster"; } catch { return "raster"; } });
  useEffect(() => { try { localStorage.setItem("studyos-week-mode", mode); } catch {} }, [mode]);
  const [month, setMonth] = useState(t.slice(0, 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const we = days[6];
  const weekSes = data.sessions.filter((s) => s.date >= ws && s.date <= we);
  const heldWeek = weekSes.filter((s) => isHeld(s) && isActive(s));
  const reviewed = heldWeek.filter((s) => s.reviewed).length;
  /* neben „Heute“ (breiter Bildschirm) nur Raster und Liste, ohne Lernblock-Vorschläge */
  const view = compact && mode === "monat" ? "raster" : mode;
  const isMonth = view === "monat";
  const shiftMonth = (n) => { const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const openWeek = (d) => { setWs(weekStart(d)); setMode("raster"); };
  const H = compact ? "h3" : "h2";

  return (
    <div className="space-y-4">
      {!compact && <PullRefresh db={db} />}
      <div className="flex items-end justify-between gap-2">
        <div>
          <H className={compact ? "section-title" : "page-title"}>{isMonth ? monthName(month) : `Woche ${isoWeek(ws)}`}</H>
          {!isMonth && <p className="page-sub">{fmt(ws)} bis {fmt(we)}{heldWeek.length ? `, ${reviewed} von ${heldWeek.length} nachbereitet` : ""}</p>}
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon" onClick={() => (isMonth ? shiftMonth(-1) : setWs(addDays(ws, -7)))} aria-label={isMonth ? "Vorheriger Monat" : "Vorherige Woche"}><span aria-hidden="true" className="block w-4 text-center">‹</span></button>
          <button className="btn btn-ghost" onClick={() => (isMonth ? setMonth(t.slice(0, 7)) : setWs(weekStart(t)))} disabled={isMonth ? month === t.slice(0, 7) : ws === weekStart(t)}>Heute</button>
          <button className="btn btn-ghost btn-icon" onClick={() => (isMonth ? shiftMonth(1) : setWs(addDays(ws, 7)))} aria-label={isMonth ? "Nächster Monat" : "Nächste Woche"}><span aria-hidden="true" className="block w-4 text-center">›</span></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={compact ? [["raster", "Raster"], ["liste", "Liste"]] : [["raster", "Raster"], ["liste", "Liste"], ["monat", "Monat"]]} value={view} onChange={setMode} label="Ansicht" />
        {!isMonth && <SelectToggle db={db} kind="session" ids={weekSes.map((s) => s.id)} />}
      </div>
      {!compact && !isMonth && <BlockSuggestions db={db} days={days} />}
      {isMonth ? <MonthGrid db={db} month={month} onPick={openWeek} /> : view === "raster" ? <WeekGrid db={db} days={days} weekSes={weekSes} /> : <WeekList db={db} days={days} weekSes={weekSes} />}
    </div>
  );
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

/* Monatsübersicht: Punkte für Abgaben (Modulfarbe) und Prüfungen (pink), Feiertage und Ferien gedämpft.
   Ein Tag öffnet seine Woche im Raster. */
function MonthGrid({ db, month, onPick }) {
  const { data } = db, t = iso();
  const first = `${month}-01`, start = weekStart(first);
  const weeks = [];
  for (let w = start; w.slice(0, 7) <= month || weeks.length === 0; w = addDays(w, 7)) { weeks.push(w); if (weeks.length > 6) break; }
  const hwBy = new Map(), exBy = new Map(), sesBy = new Map();
  const add = (map, d, x) => { if (!map.has(d)) map.set(d, []); map.get(d).push(x); };
  data.homework.forEach((h) => h.due && add(hwBy, h.due, h));
  data.exams.forEach((e) => { if (e.date) add(exBy, e.date, e); if (e.retakeDate && e.result === "nicht bestanden") add(exBy, e.retakeDate, e); });
  data.sessions.forEach((s) => !s.cancelled && add(sesBy, s.date, s));
  return (
    <div className="month" role="grid" aria-label={monthName(month)}>
      <div className="month-row month-head" role="row">
        {WD.map((d) => <span key={d} role="columnheader">{d}</span>)}
      </div>
      {weeks.map((w) => (
        <div key={w} className="month-row" role="row">
          {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((d) => {
            const hw = hwBy.get(d) || [], ex = exBy.get(d) || [], ses = sesBy.get(d) || [], off = offDay(d, data.settings);
            const open = hw.filter((h) => !DONE_HW.has(h.status));
            const parts = [`${Number(d.slice(8))}. ${monthName(d.slice(0, 7))}`, off?.label, ex.length ? `${ex.length} ${ex.length === 1 ? "Prüfung" : "Prüfungen"}` : "", hw.length ? `${hw.length} ${hw.length === 1 ? "Abgabe" : "Abgaben"}${open.length < hw.length ? ` (${hw.length - open.length} erledigt)` : ""}` : "", ses.length ? `${ses.length} ${ses.length === 1 ? "Termin" : "Termine"}` : ""].filter(Boolean);
            return (
              <button key={d} role="gridcell" className={`month-day ${d.slice(0, 7) !== month ? "other" : ""} ${d === t ? "today" : ""} ${off ? "off" : ""} ${ex.length ? "has-exam" : ""}`} onClick={() => onPick(d)} aria-label={parts.join(", ")} title={parts.slice(1).join(", ") || undefined}>
                <span className="month-num">{Number(d.slice(8))}</span>
                <span className="month-dots" aria-hidden="true">
                  {ex.map((e) => <span key={e.id + (e.retakeDate === d ? "r" : "")} className="mdot mdot-exam" />)}
                  {hw.slice(0, 4).map((h) => <span key={h.id} className={`mdot ${DONE_HW.has(h.status) ? "mdot-done" : ""}`} style={{ "--mod": db.mod(h.moduleId)?.color }} />)}
                  {hw.length > 4 && <span className="mdot-more">+{hw.length - 4}</span>}
                </span>
                {ses.length > 0 && <span className="month-ses" aria-hidden="true">{ses.length}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekGrid({ db, days, weekSes }) {
  const { data } = db, t = iso();
  const hover = useHoverCard();
  const cardSession = hover.card && data.sessions.find((x) => x.id === hover.card.id);
  /* Freie Stelle angetippt: kleine Auswahl „Termin“ / „Lernblock“ mit dieser Uhrzeit */
  const [slot, setSlot] = useState(null);
  const slotRef = useRef(null);
  useEffect(() => {
    if (!slot) return undefined;
    const away = (e) => { if (!slotRef.current?.contains(e.target)) setSlot(null); };
    const esc = (e) => { if (e.key === "Escape") setSlot(null); };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [slot]);
  useEffect(() => setSlot(null), [days[0]]);
  const addAt = (kind) => {
    const { date, min } = slot;
    setSlot(null);
    db.openForm(kind, { date, start: toHM(min), end: toHM(Math.min(23 * 60 + 59, min + (kind === "block" ? 60 : 90))) }, true);
  };
  /* Am PC: Termine und Lernblöcke ziehen (verschieben) oder am unteren Rand ziehen (verlängern) */
  const [drag, setDrag] = useState(null); /* Vorschau { id, date, start, end } */
  const dragRef = useRef(null), gridRef = useRef(null), swallowClick = useRef(false);
  /* Mehrfachauswahl: Antippen hakt Termine (bzw. Lernblöcke) an, statt Karte oder Formular zu öffnen */
  const selKind = db.sel?.kind, picked = (kind, id) => selKind === kind && db.sel.ids.includes(id);
  const startDrag = (e, ev) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || selKind === (ev.isBlock ? "block" : "session")) return;
    const coll = ev.isBlock ? "blocks" : "sessions";
    const item = data[coll].find((x) => x.id === ev.id);
    if (!item) return;
    dragRef.current = { item, coll, mode: e.target.closest(".ev-resize") ? "resize" : "move", x0: e.clientX, y0: e.clientY, active: false, next: null };
  };
  useEffect(() => {
    const move = (e) => {
      const g = dragRef.current;
      if (!g) return;
      if (!g.active && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 5) return;
      if (!g.active) { g.active = true; hover.close(); document.body.classList.add("grid-dragging"); }
      const col = g.mode === "move" && [...(gridRef.current?.querySelectorAll("[data-day]") || [])].find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
      g.next = { date: col ? col.dataset.day : g.item.date, ...dragTo(g.item, g.mode, ((e.clientY - g.y0) / HOUR_PX) * 60) };
      setDrag({ id: g.item.id, ...g.next });
    };
    const up = () => {
      const g = dragRef.current;
      dragRef.current = null;
      if (!g || !g.active) return;
      document.body.classList.remove("grid-dragging");
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
      setDrag(null);
      const p = g.next && movePatch(g.item, g.next);
      if (!p || !Object.keys(p).length) return;
      const prev = Object.fromEntries(Object.keys(p).map((k) => [k, g.item[k] ?? (k === "locked" ? [] : "")]));
      db.patch(g.coll, g.item.id, p);
      const name = g.coll === "blocks" ? g.item.title : `${db.mod(g.item.moduleId)?.name || "Termin"} (${g.item.type || "Termin"})`;
      const when = `${fmtShort(g.next.date)} ${g.next.start}–${g.next.end}`;
      db.toast(`„${name}“ ${g.mode === "resize" ? "geht jetzt bis" : "liegt jetzt"} ${g.mode === "resize" ? g.next.end : when}.`, { label: "Rückgängig", run: () => db.patch(g.coll, g.item.id, prev) });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); document.body.classList.remove("grid-dragging"); };
  }, [data]);
  /* Lange drücken (Touch) oder Rechtsklick öffnet das Schnellmenü; Android meldet langes Drücken zusätzlich als Kontextmenü */
  const press = useRef({ timer: 0, at: 0, x: 0, y: 0 });
  const menuOf = (kind, id) => {
    const item = data[kind === "block" ? "blocks" : "sessions"].find((x) => x.id === id);
    if (!item || Date.now() - press.current.at < 800) return;
    press.current.at = Date.now();
    hover.close(); db.menu(kind, item);
  };
  const pressProps = (kind, id) => ({
    onContextMenu: (e) => { e.preventDefault(); clearTimeout(press.current.timer); menuOf(kind, id); },
    onPointerDown: (e) => {
      clearTimeout(press.current.timer);
      if (e.pointerType === "mouse") return;
      Object.assign(press.current, { x: e.clientX, y: e.clientY, timer: setTimeout(() => { swallowClick.current = true; menuOf(kind, id); }, 480) });
    },
    onPointerMove: (e) => { if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) clearTimeout(press.current.timer); },
    onPointerUp: () => { clearTimeout(press.current.timer); if (swallowClick.current) setTimeout(() => { swallowClick.current = false; }, 0); },
    onPointerCancel: () => clearTimeout(press.current.timer),
  });
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []);
  /* Wochenende nur, wenn dort etwas ist: Termine, Prüfungen, Abgaben, Lernblöcke (oder heute) */
  const weekend = days.slice(5).filter((d) => d === t || weekSes.some((s) => s.date === d) || data.exams.some((e) => e.date === d) || data.homework.some((h) => h.due === d) || (data.blocks || []).some((b) => b.date === d));
  const shown = [...days.slice(0, 5), ...weekend];
  const preview = (x) => (drag && x.id === drag.id ? { ...x, date: drag.date, start: drag.start, end: drag.end } : x);
  const exams = data.exams.filter((e) => shown.includes(e.date) && e.time).map((e) => ({ ...e, isExam: true, start: e.time, end: `${String(Math.min(23, toMin(e.time) / 60 + 2 | 0)).padStart(2, "0")}:${String(toMin(e.time) % 60).padStart(2, "0")}` }));
  const allBlocks = (data.blocks || []).map((b) => ({ ...b, isBlock: true }));
  const timed = [...weekSes, ...allBlocks].map(preview).filter((x) => shown.includes(x.date)).concat(exams);
  /* Uhrzeiten nach dem, was in der Woche liegt; beim Ziehen nur wachsen (nicht schrumpfen), damit das Raster nicht springt */
  const base = hourRange([...weekSes, ...allBlocks].filter((x) => shown.includes(x.date)).concat(exams));
  const moved = drag ? { startH: Math.floor(toMin(drag.start) / 60), endH: Math.ceil(toMin(drag.end) / 60) } : base;
  const startH = Math.min(base.startH, moved.startH), endH = Math.max(base.endH, moved.endH);
  const height = (endH - startH) * HOUR_PX;
  const y = (min) => ((min - startH * 60) / 60) * HOUR_PX;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const hwByDay = (d) => data.homework.filter((h) => h.due === d);
  const anyAllDay = shown.some((d) => hwByDay(d).length || data.exams.some((e) => e.date === d && !e.time));
  const nowMin = toMin(nowHM());

  return (
    <div>
      <div className="grid-week grid-head" style={{ "--days": shown.length }}>
        <span />
        {shown.map((d) => (
          <div key={d} className={`grid-day ${d === t ? "today" : ""} ${offDay(d, data.settings) ? "off" : ""}`} title={offDay(d, data.settings)?.label}>{WD[wdIdx(d)]}<b>{Number(d.slice(8))}</b>{offDay(d, data.settings) && <span className="grid-off">{offDay(d, data.settings).label}</span>}</div>
        ))}
      </div>
      {anyAllDay && (
        <div className="grid-week mb-1" style={{ "--days": shown.length }}>
          <span className="self-center text-[10px] text-slate-500">fällig</span>
          {shown.map((d) => (
            <div key={d} className="allday">
              {hwByDay(d).map((h) => { const m = db.mod(h.moduleId); return (
                <button key={h.id} className="text-left" onClick={() => db.openForm("homework", h)} aria-label={`Abgabe ${h.title}, ${m?.name || ""}, ${fmt(d)}`}>
                  <span className="ad-hw block" style={{ "--mod": m?.color, textDecoration: ["bearbeitet", "abgegeben", "bewertet"].includes(h.status) ? "line-through" : undefined }}>{h.title}</span>
                </button>
              ); })}
            </div>
          ))}
        </div>
      )}
      <div className="grid-week" style={{ "--days": shown.length }} ref={gridRef} onClickCapture={(e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } }}>
        <div className="grid-hours" style={{ height }}>
          {hours.map((h) => <span key={h} className="grid-hour" style={{ top: y(h * 60) }}>{h}</span>)}
        </div>
        {shown.map((d) => {
          const items = layoutDay(timed.filter((s) => s.date === d));
          return (
            <div key={d} data-day={d} className={`grid-col ${d === t ? "today" : ""}`} style={{ height }} aria-label={`${WD_LONG[wdIdx(d)]} ${fmt(d)}`} role="group"
              onClick={(e) => { if (selKind || (e.target !== e.currentTarget && !e.target.classList.contains("grid-line"))) return; const r = e.currentTarget.getBoundingClientRect(); setSlot({ date: d, min: slotAt(startH * 60 + ((e.clientY - r.top) / HOUR_PX) * 60) }); }}>
              {hours.slice(1, -1).map((h) => <span key={h} className="grid-line" style={{ top: y(h * 60) }} />)}
              {slot?.date === d && (
                <div ref={slotRef} className="grid-slot" style={{ top: y(slot.min) }} role="dialog" aria-label={`Neu am ${fmt(d)} um ${toHM(slot.min)}`}>
                  <span className="grid-slot-time">{toHM(slot.min)}</span>
                  <button className="btn btn-primary" onClick={() => addAt("session")} autoFocus>Termin</button>
                  <button className="btn btn-ghost" onClick={() => addAt("block")}>Lernblock</button>
                </div>
              )}
              {d === t && nowMin >= startH * 60 && nowMin <= endH * 60 && <span className="grid-now" style={{ top: y(nowMin) }} aria-hidden="true" />}
              {items.map(({ ev, s, e, lane, lanes }) => {
                const m = db.mod(ev.moduleId);
                const tall = ((e - s) / 60) * HOUR_PX > 34;
                /* Der Name beginnt mit dem sichtbaren Text (für Sprachsteuerung), danach die Einzelheiten */
                const shown = (a, b) => (tall && b ? `${a} ${b}: ` : `${a}: `);
                if (ev.isBlock) return (
                  <button key={ev.id} className={`ev ev-block ev-move ${ev.done ? "ev-done" : ""} ${drag?.id === ev.id ? "ev-dragging" : ""} ${picked("block", ev.id) ? "ev-selected" : ""}`} aria-label={`${shown(shortName(ev.title), m ? shortName(m.name) : "Lernen")}Lernblock ${ev.title}${m ? ", " + m.name : ""}, ${ev.start} bis ${ev.end}${ev.done ? ", erledigt" : ""}`}
                    {...(selKind === "block" ? { "aria-pressed": picked("block", ev.id), onClick: () => db.select("block", ev.id) }
                      : withDrag({ ...pressProps("block", ev.id), onClick: () => db.openForm("block", ev) }, (e) => startDrag(e, ev)))}
                    style={{ "--mod": m?.color || "var(--accent)", top: y(s) + 1, height: Math.max(20, ((e - s) / 60) * HOUR_PX - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: "auto" }}>
                    <b>{shortName(ev.title)}</b>
                    {tall && " "}{tall && <span>{m ? shortName(m.name) : "Lernen"}</span>}
                    <span className="ev-resize" aria-hidden="true" />
                  </button>
                );
                const cov = ev.isExam || ev.cancelled ? null : sessionCoverage(ev);
                const cls = ev.isExam ? "" : ev.cancelled ? "ev-cancelled" : ev.reviewed ? "ev-done" : isHeld(ev) ? "ev-review" : "";
                const label = shown(ev.isExam ? "Prüfung" : shortName(m?.name), ev.isExam ? shortName(m?.name) : ev.type) + (ev.isExam ? `Prüfung ${m?.name || ""} um ${ev.start}` : `${ev.type} ${m?.name || ""}, ${ev.start} bis ${ev.end}${ev.room ? ", " + ev.room : ""}${ev.cancelled ? ", fällt aus" : ev.reviewed ? ", nachbereitet" : isHeld(ev) ? ", noch nicht nachbereitet" : ""}${cov ? `, ${cov.label}` : ""}`);
                return (
                  <button key={ev.id} className={`ev ${cls} ${ev.isExam ? "" : "ev-move"} ${hover.card?.id === ev.id ? "ev-active" : ""} ${drag?.id === ev.id ? "ev-dragging" : ""} ${picked("session", ev.id) ? "ev-selected" : ""}`} aria-label={label} title={ev.isExam ? label : undefined}
                    {...(ev.isExam ? { onClick: () => db.goLearn("pruefungen") }
                      : selKind === "session" ? { "aria-pressed": picked("session", ev.id), onClick: () => db.select("session", ev.id) }
                      : withDrag(chain(hover.trigger(ev.id, () => db.openForm("session", data.sessions.find((x) => x.id === ev.id) || ev)), pressProps("session", ev.id)), (e) => startDrag(e, ev)))}
                    style={{ "--mod": ev.isExam ? "var(--danger)" : m?.color, top: y(s) + 1, height: Math.max(20, ((e - s) / 60) * HOUR_PX - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: "auto", color: ev.isExam ? "#fff" : undefined }}>
                    <b>{ev.isExam ? "Prüfung" : shortName(m?.name)}</b>
                    {tall && " "}{tall && <span>{ev.isExam ? shortName(m?.name) : ev.type}</span>}
                    {!ev.isExam && <span className="ev-resize" aria-hidden="true" />}
                    {cov && <span className="ev-cov" data-tier={cov.ratio >= 0.9 ? "ok" : cov.ratio >= 0.34 ? "warn" : "low"} aria-hidden="true"><span style={{ width: `${Math.round(cov.ratio * 100)}%` }} /></span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {cardSession && <SessionPopover s={cardSession} db={db} anchor={hover.card.anchor} onClose={hover.close} onEnter={hover.keep} onLeave={hover.leave} />}
    </div>
  );
}

/* Eigener pointerdown zusätzlich zu dem der Hover-Karte */
const withDrag = (props, onDown) => ({ ...props, onPointerDown: (e) => { props.onPointerDown?.(e); onDown(e); } });
/* Handler mehrerer Prop-Sätze nacheinander ausführen */
const chain = (a, b) => ({ ...a, ...b, ...Object.fromEntries(Object.keys(b).filter((k) => a[k]).map((k) => [k, (e) => { a[k](e); b[k](e); }])) });

function WeekList({ db, days, weekSes }) {
  const { data } = db, t = iso();
  return (
    <div className="space-y-5">
      {days.map((d) => {
        const ses = weekSes.filter((s) => s.date === d).sort(byTime);
        const hw = data.homework.filter((h) => h.due === d);
        const ex = data.exams.filter((e) => e.date === d);
        const mins = sum(data.logs.filter((l) => l.date === d), (l) => l.minutes);
        const bl = (data.blocks || []).filter((b) => b.date === d).sort(byTime);
        const isToday = d === t, empty = !ses.length && !hw.length && !ex.length && !bl.length;
        return (
          <section key={d} aria-label={`${WD_LONG[wdIdx(d)]} ${fmt(d)}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className={`section-title ${isToday ? "text-sky-300" : ""}`}>{WD_LONG[wdIdx(d)]} <span className="text-sm font-normal text-slate-400">{d.slice(8)}.{d.slice(5, 7)}.{isToday ? ", heute" : ""}{offDay(d, data.settings) ? `, ${offDay(d, data.settings).label}` : ""}</span></h3>
              <div className="flex items-center gap-2">
                {mins > 0 && <span className="text-xs text-slate-400">{fmtMin(mins)} gelernt</span>}
                <button className="btn btn-ghost btn-icon" onClick={() => db.openForm("session", { date: d }, true)} aria-label={`Termin am ${fmt(d)} hinzufügen`}><span aria-hidden="true" className="block w-4 text-center">+</span></button>
              </div>
            </div>
            {empty ? <p className="text-sm text-slate-500">frei</p> : (
              <ul className="rows">
                {ex.map((e) => { const m = db.mod(e.moduleId); return (
                  <li key={e.id} className="row" style={{ "--mod": "var(--danger)" }}>
                    <p className="row-title">Prüfung {m?.name}</p>
                    <p className="row-meta">{e.time}{e.room ? `, ${e.room}` : ""}</p>
                  </li>
                ); })}
                {ses.map((s) => <SessionRow key={s.id} s={s} db={db} />)}
                {bl.map((b) => <BlockRow key={b.id} b={b} db={db} />)}
                {hw.map((h) => <HomeworkRow key={h.id} h={h} db={db} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* Vorschläge für Lernblöcke in den Lücken der angezeigten Woche */
function BlockSuggestions({ db, days }) {
  const [open, setOpen] = useState(false);
  const list = open ? suggestBlocks(db.data, days) : [];
  const add = (items) => {
    const fresh = items.map((x) => ({ id: uid(), moduleId: x.moduleId, title: x.title, kind: x.kind, date: x.date, start: x.start, end: x.end, done: false, created: iso() }));
    db.withUndo(`${fresh.length} ${fresh.length === 1 ? "Lernblock" : "Lernblöcke"} eingeplant.`, (d) => ({ ...d, blocks: [...(d.blocks || []), ...fresh] }));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Vorschläge ausblenden" : "Lernblöcke vorschlagen"}</button>
        <button className="link-btn" onClick={() => db.openForm("block", { date: days.find((d) => d >= iso()) || days[0] }, true)}>+ Lernblock</button>
      </div>
      {open && (
        <div className="surface mt-2">
          {list.length ? (
            <>
              <p className="text-xs text-slate-400">Freie Zeit zwischen deinen Veranstaltungen (mit 15 Minuten Puffer):</p>
              <ul className="mt-2 space-y-2">
                {list.map((x, i) => { const m = db.mod(x.moduleId); return (
                  <li key={i} className="flex items-center gap-3" style={{ "--mod": m?.color }}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{WD[wdIdx(x.date)]} {x.start}–{x.end}</span>
                      <span className="block truncate text-xs text-slate-400">{x.title}{m ? `, ${m.name}` : ""}</span>
                    </span>
                    <button className="btn btn-ghost" onClick={() => add([x])} aria-label={`Lernblock ${WD[wdIdx(x.date)]} ${x.start} übernehmen`}>+</button>
                  </li>
                ); })}
              </ul>
              {list.length > 1 && <button className="btn btn-primary mt-3" onClick={() => { add(list); setOpen(false); }}>Alle {list.length} übernehmen</button>}
            </>
          ) : <p className="text-sm text-slate-400">Keine passenden Lücken (mindestens 60 Minuten) an den restlichen Tagen mit Veranstaltungen. Mit › zur nächsten Woche blättern.</p>}
        </div>
      )}
    </div>
  );
}
