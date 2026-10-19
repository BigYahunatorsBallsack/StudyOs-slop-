import React, { useState, useEffect } from "react";
import { WD, WD_LONG } from "../lib/constants.js";
import { addDays, byTime, fmt, fmtMin, isHeld, iso, isoWeek, nowHM, sum, uid, wdIdx, weekStart } from "../lib/util.js";
import { BlockRow, HomeworkRow, SessionRow } from "../ui/rows.jsx";
import { Tabs } from "../ui/primitives.jsx";
import { isActive } from "../lib/data.js";
import { SessionPopover, useHoverCard } from "../ui/session.jsx";
import { suggestBlocks } from "../lib/blocks.js";
import { sessionCoverage } from "../lib/study.js";

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

export function WeekView({ db }) {
  const { data } = db, t = iso();
  const [ws, setWs] = useState(weekStart(t));
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("studyos-week-mode") || "raster"; } catch { return "raster"; } });
  useEffect(() => { try { localStorage.setItem("studyos-week-mode", mode); } catch {} }, [mode]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const we = days[6];
  const weekSes = data.sessions.filter((s) => s.date >= ws && s.date <= we);
  const heldWeek = weekSes.filter((s) => isHeld(s) && isActive(s));
  const reviewed = heldWeek.filter((s) => s.reviewed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="page-title">Woche {isoWeek(ws)}</h2>
          <p className="page-sub">{fmt(ws)} bis {fmt(we)}{heldWeek.length ? `, ${reviewed} von ${heldWeek.length} nachbereitet` : ""}</p>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon" onClick={() => setWs(addDays(ws, -7))} aria-label="Vorherige Woche"><span aria-hidden="true" className="block w-4 text-center">‹</span></button>
          <button className="btn btn-ghost" onClick={() => setWs(weekStart(t))} disabled={ws === weekStart(t)}>Heute</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setWs(addDays(ws, 7))} aria-label="Nächste Woche"><span aria-hidden="true" className="block w-4 text-center">›</span></button>
        </div>
      </div>
      <Tabs items={[["raster", "Raster"], ["liste", "Liste"]]} value={mode} onChange={setMode} label="Ansicht" />
      <BlockSuggestions db={db} days={days} />
      {mode === "raster" ? <WeekGrid db={db} days={days} weekSes={weekSes} /> : <WeekList db={db} days={days} weekSes={weekSes} />}
    </div>
  );
}

function WeekGrid({ db, days, weekSes }) {
  const { data } = db, t = iso();
  const hover = useHoverCard();
  const cardSession = hover.card && data.sessions.find((x) => x.id === hover.card.id);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []);
  /* Wochenende nur, wenn dort etwas ist: Termine, Prüfungen, Abgaben, Lernblöcke (oder heute) */
  const weekend = days.slice(5).filter((d) => d === t || weekSes.some((s) => s.date === d) || data.exams.some((e) => e.date === d) || data.homework.some((h) => h.due === d) || (data.blocks || []).some((b) => b.date === d));
  const shown = [...days.slice(0, 5), ...weekend];
  const active = weekSes.filter((s) => shown.includes(s.date));
  const exams = data.exams.filter((e) => shown.includes(e.date) && e.time);
  const blocks = (data.blocks || []).filter((b) => shown.includes(b.date)).map((b) => ({ ...b, isBlock: true }));
  const timed = [...active, ...blocks, ...exams.map((e) => ({ ...e, isExam: true, start: e.time, end: `${String(Math.min(23, toMin(e.time) / 60 + 2 | 0)).padStart(2, "0")}:${String(toMin(e.time) % 60).padStart(2, "0")}` }))];
  const startH = Math.min(8, ...timed.map((s) => Math.floor(toMin(s.start) / 60)));
  const endH = Math.max(19, ...timed.map((s) => Math.ceil(toMin(s.end || s.start) / 60)));
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
          <div key={d} className={`grid-day ${d === t ? "today" : ""}`}>{WD[wdIdx(d)]}<b>{Number(d.slice(8))}</b></div>
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
      <div className="grid-week" style={{ "--days": shown.length }}>
        <div className="grid-hours" style={{ height }}>
          {hours.map((h) => <span key={h} className="grid-hour" style={{ top: y(h * 60) }}>{h}</span>)}
        </div>
        {shown.map((d) => {
          const items = layoutDay(timed.filter((s) => s.date === d));
          return (
            <div key={d} className={`grid-col ${d === t ? "today" : ""}`} style={{ height }} aria-label={`${WD_LONG[wdIdx(d)]} ${fmt(d)}`} role="group">
              {hours.slice(1, -1).map((h) => <span key={h} className="grid-line" style={{ top: y(h * 60) }} />)}
              {d === t && nowMin >= startH * 60 && nowMin <= endH * 60 && <span className="grid-now" style={{ top: y(nowMin) }} aria-hidden="true" />}
              {items.map(({ ev, s, e, lane, lanes }) => {
                const m = db.mod(ev.moduleId);
                const tall = ((e - s) / 60) * HOUR_PX > 34;
                /* Der Name beginnt mit dem sichtbaren Text (für Sprachsteuerung), danach die Einzelheiten */
                const shown = (a, b) => (tall && b ? `${a} ${b}: ` : `${a}: `);
                if (ev.isBlock) return (
                  <button key={ev.id} className={`ev ev-block ${ev.done ? "ev-done" : ""}`} aria-label={`${shown(shortName(ev.title), m ? shortName(m.name) : "Lernen")}Lernblock ${ev.title}${m ? ", " + m.name : ""}, ${ev.start} bis ${ev.end}${ev.done ? ", erledigt" : ""}`}
                    onClick={() => db.openForm("block", ev)}
                    style={{ "--mod": m?.color || "var(--accent)", top: y(s) + 1, height: Math.max(20, ((e - s) / 60) * HOUR_PX - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: "auto" }}>
                    <b>{shortName(ev.title)}</b>
                    {tall && " "}{tall && <span>{m ? shortName(m.name) : "Lernen"}</span>}
                  </button>
                );
                const cov = ev.isExam || ev.cancelled ? null : sessionCoverage(ev);
                const cls = ev.isExam ? "" : ev.cancelled ? "ev-cancelled" : ev.reviewed ? "ev-done" : isHeld(ev) ? "ev-review" : "";
                const label = shown(ev.isExam ? "Prüfung" : shortName(m?.name), ev.isExam ? shortName(m?.name) : ev.type) + (ev.isExam ? `Prüfung ${m?.name || ""} um ${ev.start}` : `${ev.type} ${m?.name || ""}, ${ev.start} bis ${ev.end}${ev.room ? ", " + ev.room : ""}${ev.cancelled ? ", fällt aus" : ev.reviewed ? ", nachbereitet" : isHeld(ev) ? ", noch nicht nachbereitet" : ""}${cov ? `, ${cov.label}` : ""}`);
                return (
                  <button key={ev.id} className={`ev ${cls} ${hover.card?.id === ev.id ? "ev-active" : ""}`} aria-label={label} title={ev.isExam ? label : undefined}
                    {...(ev.isExam ? { onClick: () => db.goLearn("pruefungen") } : hover.trigger(ev.id, () => db.openForm("session", ev)))}
                    style={{ "--mod": ev.isExam ? "var(--danger)" : m?.color, top: y(s) + 1, height: Math.max(20, ((e - s) / 60) * HOUR_PX - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: "auto", color: ev.isExam ? "#fff" : undefined }}>
                    <b>{ev.isExam ? "Prüfung" : shortName(m?.name)}</b>
                    {tall && " "}{tall && <span>{ev.isExam ? shortName(m?.name) : ev.type}</span>}
                    {cov && <span className="ev-cov" data-tier={cov.ratio >= 0.9 ? "ok" : cov.ratio >= 0.34 ? "warn" : "low"} aria-hidden="true"><span style={{ width: `${Math.round(cov.ratio * 100)}%` }} /></span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Gestrichelt: geplante Lernblöcke. Umrandet: stattgefunden, aber noch nicht nachbereitet. Der Streifen unten zeigt, wie viel du besucht oder von der Aufzeichnung angeschaut hast (rot unter einem Drittel, gelb bis 90 %, grün darüber). Zum Abhaken mit der Maus kurz auf einem Termin verweilen bzw. auf dem Handy antippen.</p>
      {cardSession && <SessionPopover s={cardSession} db={db} anchor={hover.card.anchor} onClose={hover.close} onEnter={hover.keep} onLeave={hover.leave} />}
    </div>
  );
}

/* Kurzname für schmale Spalten: Klammerzusätze weg, lange Namen als Initialen */
function shortName(name = "") {
  const clean = name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (clean.length <= 14) return clean;
  const words = clean.split(/\s+/).filter(Boolean);
  /* Initialen wie an der Uni üblich: „Einführung in die Informatik“ wird „EidI“ */
  return words.length > 1 ? words.map((w) => w[0]).join("") : clean.slice(0, 12) + "…";
}

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
              <h3 className={`section-title ${isToday ? "text-sky-300" : ""}`}>{WD_LONG[wdIdx(d)]} <span className="text-sm font-normal text-slate-400">{d.slice(8)}.{d.slice(5, 7)}.{isToday ? ", heute" : ""}</span></h3>
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
