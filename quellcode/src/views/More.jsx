import React, { useState, useEffect, useRef, useMemo } from "react";
import { DONE_HW, WD } from "../lib/constants.js";
import { isActive } from "../lib/data.js";
import { addDays, fmt, fmtH, fmtMin, isHeld, iso, parseDec, sum, wdIdx } from "../lib/util.js";
import { workloadOverview } from "../lib/study.js";
import { Bar, Card, Dot, Empty, Stat, Tabs } from "../ui/primitives.jsx";
import { HomeworkRow } from "../ui/rows.jsx";
import { SelectToggle } from "../ui/selection.jsx";
import { btnPrimary, focusRing, inputBase, inputFlex } from "../ui/styles.js";
import { DataView } from "./Data.jsx";
import { gopStatus, gradeForecast } from "../lib/tum.js";
import { achievements } from "../lib/progress.js";
import { effortVsGrade, gradeTimeline, heatmap, learningRhythm, minutesBySemester } from "../lib/stats.js";
import { Select } from "../ui/select.jsx";

/* ---------------- Mehr ---------------- */
export function More({ db, sub, setSub }) {
  return (
    <div className="space-y-4">
      <h2 className="page-title mb-1">Mehr</h2>
      <Tabs items={[["rueckblick", "Wochenrückblick"], ["erfolge", "Erfolge"], ["hausaufgaben", "Alle Hausaufgaben"], ["studium", "Studienfortschritt"], ["daten", "Daten & Einstellungen"]]} value={sub} onChange={setSub} label="Weitere Bereiche" />
      {sub === "rueckblick" && <Review db={db} />}
      {sub === "erfolge" && <Achievements data={db.data} />}
      {sub === "hausaufgaben" && <HomeworkAll db={db} />}
      {sub === "studium" && <Progress db={db} />}
      {sub === "daten" && <DataView db={db} />}
    </div>
  );
}

/* Abzeichen: freigeschaltete in Farbe, die übrigen grau mit Fortschritt */
export function Achievements({ data }) {
  const list = useMemo(() => achievements(data), [data]);
  const done = list.filter((b) => b.done).length;
  const num = (v) => String(v).replace(".", ",");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300"><b className="font-num">{done}</b> von {list.length} Abzeichen freigeschaltet</p>
      <ul className="badges">
        {list.map((b) => (
          <li key={b.id} className={`badge ${b.done ? "badge-done" : "badge-locked"}`}>
            <span className={`badge-icon px-icon px-${b.icon}`} aria-hidden="true" />
            <span className="badge-title">{b.title}</span>
            <span className="badge-desc">{b.desc}</span>
            {b.done ? <span className="badge-state">Freigeschaltet</span>
              : <><Bar value={b.value} max={b.goal} label={`Fortschritt ${b.title}`} className="mt-1.5 w-full" /><span className="badge-state font-num">{num(b.value)} / {num(b.goal)}</span></>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomeworkAll({ db }) {
  const { data } = db;
  const [filter, setFilter] = useState("offen");
  const [mod, setMod] = useState("all");
  const list = data.homework
    .filter((h) => mod === "all" || h.moduleId === mod)
    .filter((h) => (filter === "offen" ? !DONE_HW.has(h.status) : filter === "erledigt" ? DONE_HW.has(h.status) : true))
    .sort((a, b) => (filter === "erledigt" ? (b.due || "").localeCompare(a.due || "") : (a.due || "9999").localeCompare(b.due || "9999")));
  const open = data.homework.filter((h) => !DONE_HW.has(h.status));
  const overdue = open.filter((h) => h.due && h.due < iso()).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">{open.length} offen{overdue ? <span className="text-rose-400"> · {overdue} überfällig</span> : null} · {data.homework.length - open.length} erledigt</p>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs items={[["offen", "Offen"], ["erledigt", "Erledigt"], ["alle", "Alle"]]} value={filter} onChange={setFilter} label="Filter Hausaufgaben" />
        <label htmlFor="hwa-mod" className="sr-only">Modul filtern</label>
        <Select id="hwa-mod" className={inputFlex} value={mod} onChange={(e) => setMod(e.target.value)}>
          <option value="all">Alle Module</option>
          {data.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <button className={btnPrimary} onClick={() => db.openForm("homework", mod === "all" ? null : { moduleId: mod }, true)}>+ Hausaufgabe</button>
        <SelectToggle db={db} kind="homework" ids={list.map((h) => h.id)} />
      </div>
      {list.length ? <ul className="rows">{list.map((h) => <HomeworkRow key={h.id} h={h} db={db} />)}</ul> : <Empty art="bowl">Keine Hausaufgaben in dieser Ansicht. Zeit für die Mensa.</Empty>}
    </div>
  );
}

export function Review({ db }) {
  const { data } = db, t = iso();
  const metrics = (from, to) => {
    const inR = (x) => x && x >= from && x <= to;
    const held = data.sessions.filter((s) => inR(s.date) && isHeld(s) && isActive(s));
    return {
      minutes: sum(data.logs.filter((l) => inR(l.date)), (l) => l.minutes),
      units: data.logs.filter((l) => inR(l.date)).length,
      reviewed: data.sessions.filter((s) => inR(s.reviewedAt)).length,
      hwDone: data.homework.filter((h) => inR(h.doneAt)).length,
      held: held.length, heldReviewed: held.filter((s) => s.reviewed).length,
      cards: data.cards.filter((c) => inR(c.lastReview)).length,
    };
  };
  const from = addDays(t, -6), cur = metrics(from, t), prev = metrics(addDays(t, -13), addDays(t, -7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const dayMin = days.map((d) => sum(data.logs.filter((l) => l.date === d), (l) => l.minutes));
  const maxDay = Math.max(30, ...dayMin);
  const perMod = data.modules.map((m) => ({ m, min: sum(data.logs.filter((l) => l.moduleId === m.id && l.date >= from && l.date <= t), (l) => l.minutes) })).filter((x) => x.min > 0).sort((a, b) => b.min - a.min);
  const delta = (a, b) => { const d = a - b; if (!d) return <span className="text-slate-500">± 0</span>; return <span className={d > 0 ? "text-emerald-400" : "text-rose-400"}>{d > 0 ? "+" : "−"}{Math.abs(d)}</span>; };
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Letzte 7 Tage ({fmt(from)} – {fmt(t)}) im Vergleich zur Vorwoche</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Lernzeit" value={fmtMin(cur.minutes)} sub={<>Vorwoche {fmtMin(prev.minutes)}</>} />
        <Stat label="Termine nachbereitet" value={cur.reviewed} sub={<>{delta(cur.reviewed, prev.reviewed)} zur Vorwoche</>} />
        <Stat label="Hausaufgaben erledigt" value={cur.hwDone} sub={<>{delta(cur.hwDone, prev.hwDone)} zur Vorwoche</>} />
        <Stat label="Karten wiederholt" value={cur.cards} sub="mind. einmal" />
      </div>
      <Card title="Lernzeit pro Tag">
        <div className="flex h-36 items-end gap-2" role="img" aria-label={"Lernzeit pro Tag: " + days.map((d, i) => `${WD[wdIdx(d)]} ${dayMin[i]} Minuten`).join(", ")}>
          {days.map((d, i) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-num text-[10px] text-slate-500">{dayMin[i] || ""}</span>
              <div className="w-full rounded-t-md bg-sky-500/80" style={{ height: `${(dayMin[i] / maxDay) * 100}px`, minHeight: dayMin[i] ? 3 : 0 }} />
              <span className={`text-[11px] ${d === t ? "font-semibold text-sky-300" : "text-slate-400"}`}>{WD[wdIdx(d)]}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Nachbereitungsquote der Woche">
        <p className="text-sm"><span className="font-num text-xl font-semibold">{cur.heldReviewed}/{cur.held}</span> <span className="text-slate-400">stattgefundene Termine nachbereitet</span></p>
        <Bar value={cur.heldReviewed} max={cur.held || 1} className="mt-2" label="Nachbereitungsquote" />
      </Card>
      <Card title="Lernzeit pro Modul">
        {perMod.length ? (
          <ul className="rows">
            {perMod.map(({ m, min }) => (
              <li key={m.id}><div className="mb-1 flex justify-between text-sm"><span className="truncate">{m.name}</span><span className="font-num text-slate-400">{fmtMin(min)}</span></div><Bar value={min} max={perMod[0].min} color={m.color} label={m.name} /></li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">In den letzten 7 Tagen keine Lernzeit eingetragen.</p>}
      </Card>
      <EctsCompare db={db} />
      <Heatmap logs={data.logs} />
      <Rhythm data={data} />
    </div>
  );
}

/* Wann du lernst, und wie Lernzeit und Note bei dir zusammenhängen */
function Rhythm({ data }) {
  const r = learningRhythm(data.logs);
  const eg = effortVsGrade(data);
  const maxP = Math.max(1, ...r.parts.map((p) => p.minutes)), maxW = Math.max(1, ...r.weekdays);
  if (!data.logs.length) return null;
  return (
    <Card title="Dein Lernrhythmus">
      {r.timed > 0 ? (
        <>
          <p className="text-sm text-slate-300">Am meisten schaffst du <b>{r.best.label.toLowerCase()}</b>.</p>
          <ul className="mt-3 space-y-1.5">
            {r.parts.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-400">{p.label}</span>
                <Bar value={p.minutes} max={maxP} label={p.label} className="flex-1" />
                <span className="font-num w-16 shrink-0 text-right text-xs text-slate-400">{fmtMin(p.minutes)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="text-xs text-slate-500">Tageszeiten erscheinen, sobald du Lernzeit über den Timer oder am selben Tag einträgst.</p>}
      <div className="mt-4 flex items-end gap-1.5" role="img" aria-label="Lernzeit nach Wochentag">
        {r.weekdays.map((m, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-md" style={{ height: `${Math.max(3, (m / maxW) * 64)}px`, background: m ? "var(--accent)" : "var(--surface-2)" }} title={`${WD[i]}: ${fmtMin(m)}`} />
            <span className="text-[11px] text-slate-500">{WD[i]}</span>
          </div>
        ))}
      </div>
      {eg.length >= 2 && (
        <>
          <p className="mt-5 text-sm font-semibold">Lernzeit und Note</p>
          <ul className="mt-2 space-y-1 text-sm">
            {eg.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="font-num shrink-0 text-xs text-slate-400">{x.perEcts.toFixed(1).replace(".", ",")} h/ECTS</span>
                <span className="font-num w-10 shrink-0 text-right font-semibold">{x.grade.toFixed(1).replace(".", ",")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Nur eingetragene Lernzeit, ohne Vorlesungen. Richtwert laut Modulhandbuch: 30 h pro ECTS insgesamt.</p>
        </>
      )}
    </Card>
  );
}

export function Heatmap({ logs, weeks = 20 }) {
  const scroller = useRef(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  const grid = useMemo(() => heatmap(logs, weeks), [logs, weeks]);
  const total = grid.flat().reduce((s, c) => s + c.minutes, 0);
  const active = grid.flat().filter((c) => c.minutes > 0).length;
  const months = grid.map((col, i) => { const d = col[0].date; return i === 0 || d.slice(5, 7) !== grid[i - 1][0].date.slice(5, 7) ? MONTHS[Number(d.slice(5, 7)) - 1] : ""; });
  return (
    <Card title={`Aktivität (${weeks} Wochen)`}>
      <p className="mb-2 text-xs text-slate-400">{fmtMin(total)} an {active} Tagen</p>
      <div ref={scroller} className="no-scrollbar overflow-x-auto">
        <div className="inline-flex gap-[3px]" role="img" aria-label={`Lernaktivität der letzten ${weeks} Wochen: ${fmtMin(total)} an ${active} Tagen`}>
          <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[9px] leading-[11px] text-slate-500">{WD.map((w, i) => <span key={w} className="h-[11px]">{i % 2 === 0 ? w : ""}</span>)}</div>
          {grid.map((col, i) => (
            <div key={col[0].date} className="flex flex-col gap-[3px]">
              <span className="h-[13px] text-[9px] leading-[13px] text-slate-500">{months[i]}</span>
              {col.map((c) => <span key={c.date} title={`${fmt(c.date)}: ${fmtMin(c.minutes)}`} className={`hm h-[11px] w-[11px] rounded-[2px] ${c.future ? "hm-f" : "hm" + c.level}`} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">weniger{[0, 1, 2, 3, 4].map((l) => <span key={l} className={`hm h-[11px] w-[11px] rounded-[2px] hm${l}`} />)}mehr</div>
    </Card>
  );
}
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function Progress({ db }) {
  const { data } = db, target = Number(data.settings.targetEcts) || 180;
  const e = (st) => sum(data.modules.filter((m) => m.status === st), (m) => m.ects);
  const passed = e("bestanden"), enrolled = e("belegt"), planned = e("geplant");
  const graded = data.modules.filter((m) => m.status === "bestanden" && m.grade);
  const gEcts = sum(graded, (m) => m.ects), gSum = sum(graded, (m) => m.grade * m.ects);
  const avg = gEcts ? gSum / gEcts : null;
  const [goal, setGoal] = useState("2,0");
  const remaining = Math.max(0, target - passed);
  const goalN = parseDec(goal);
  const need = remaining > 0 && goalN >= 1 && goalN <= 5 ? (goalN * (gEcts + remaining) - gSum) / remaining : null;
  const semesters = [...new Set(data.modules.map((m) => m.semester || 0))].sort((a, b) => a - b);
  const timeline = gradeTimeline(data), bySem = minutesBySemester(data);
  const maxSem = Math.max(0, ...bySem.map((x) => x.minutes));
  const seg = (v, c, l) => <div title={`${l}: ${v} ECTS`} style={{ width: `${Math.min(100, (v / target) * 100)}%`, background: c }} className="h-full" />;
  return (
    <div className="space-y-4">
      <Card title="ECTS">
        <p className="text-sm"><span className="font-num text-3xl font-semibold">{passed}</span><span className="text-slate-400"> / {target} bestanden</span></p>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-800" role="img" aria-label={`${passed} bestanden, ${enrolled} belegt, ${planned} geplant von ${target} ECTS`}>
          {seg(passed, "#34d399", "bestanden")}{seg(enrolled, "#38bdf8", "belegt")}{seg(planned, "#475569", "geplant")}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span><span className="text-emerald-400">●</span> bestanden {passed}</span><span><span className="text-sky-400">●</span> belegt {enrolled}</span><span><span className="text-slate-500">●</span> geplant {planned}</span><span>offen {Math.max(0, target - passed - enrolled - planned)}</span>
        </div>
      </Card>
      <GopCard db={db} />
      <Card title="Notenschnitt (ECTS-gewichtet)">
        <p className="font-num text-3xl font-semibold">{avg ? avg.toFixed(2).replace(".", ",") : "–"}</p>
        <Forecast data={data} db={db} />
        <p className="text-xs text-slate-500">aus {graded.length} benoteten Modulen ({gEcts} ECTS). Nicht berücksichtigt: Gewichtungsregeln deiner Prüfungsordnung.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="goal" className="mb-1 block text-xs text-slate-400">Zielschnitt</label>
            <input id="goal" type="text" inputMode="decimal" className={`${inputBase} w-24 text-sm`} value={goal} onChange={(ev) => setGoal(ev.target.value)} />
          </div>
          <p className="pb-2 text-sm text-slate-300">
            {need === null ? "–" : need < 1 ? "Nicht mehr erreichbar (benötigt besser als 1,0)." : need > 4 ? "Sicher erreichbar, auch mit 4,0." : <>Benötigt im Rest ({remaining} ECTS): <b className="font-num">Ø {need.toFixed(2).replace(".", ",")}</b></>}
          </p>
        </div>
      </Card>
      {(timeline.length > 0 || bySem.length > 0) && (
        <Card title="Verlauf nach Semester">
          <ul className="rows">
            {[...new Set([...timeline.map((x) => x.semester), ...bySem.map((x) => x.semester)])].sort((a, b) => a - b).map((sem) => {
              const g = timeline.find((x) => x.semester === sem), m = bySem.find((x) => x.semester === sem);
              return (
                <li key={sem} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-300">Semester {sem}</span>
                    <span className="font-num text-xs text-slate-400">{m ? fmtMin(m.minutes) : "–"} · {g ? `Ø ${g.avg.toFixed(2).replace(".", ",")} (${g.ects} ECTS)` : "noch keine Note"}</span>
                  </div>
                  <Bar value={m ? m.minutes : 0} max={maxSem || 1} className="mt-1" label={`Lernzeit Semester ${sem}`} />
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Lernzeit je Semester der Module; der Schnitt ist kumuliert bis einschließlich dieses Semesters.</p>
        </Card>
      )}
      <Card title="Module nach Semester">
        {!data.modules.length ? <p className="text-sm text-slate-400">Noch keine Module.</p> : semesters.map((sem) => {
          const list = data.modules.filter((m) => (m.semester || 0) === sem);
          return (
            <div key={sem} className="mb-3 last:mb-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="section-title">Semester {sem} <span className="text-sm font-normal text-slate-400">{sum(list, (m) => m.ects)} ECTS{list.every((m) => m.archived) ? ", archiviert" : ""}</span></p>
                {list.some((m) => !m.archived) ? <button className="link-btn" onClick={() => db.archiveSemester(sem, true)}>Archivieren</button>
                  : <button className="link-btn" onClick={() => db.archiveSemester(sem, false)}>Zurückholen</button>}
              </div>
              <ul className="divide-y divide-slate-800">
                {list.map((m) => (
                  <li key={m.id}><button onClick={() => db.goModule(m.id)} className={`flex w-full items-center gap-3 py-2 text-left text-sm hover:text-sky-300 ${focusRing}`}>
                    <Dot color={m.color} /><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="text-xs text-slate-400">{m.status}</span><span className="font-num w-10 text-right text-xs">{m.ects}</span><span className="font-num w-8 text-right text-xs">{m.grade ? String(m.grade).replace(".", ",") : ""}</span>
                  </button></li>
                ))}
              </ul>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

const g2 = (n) => n.toFixed(2).replace(".", ",");

/* Grundlagen- und Orientierungsprüfung: ECTS aus den GOP-Modulen nach der Regel des Studienplans */
function GopCard({ db }) {
  const g = gopStatus(db.data);
  if (!g) return null;
  const goal = g.stage?.ects || 0;
  const cls = g.reached ? "notice-ok" : !g.stage ? "notice-info" : g.enough ? "notice-info" : "notice-warn";
  const until = g.stage ? (g.curriculum.gop.hint && g.stages.length === 1 ? g.curriculum.gop.hint : `bis Ende des ${g.stage.bySemester}. Semesters`) : "";
  return (
    <Card title="Grundlagenprüfung (GOP)">
      <p className="text-sm"><span className="font-num text-3xl font-semibold">{g.passed}</span><span className="text-slate-400">{goal ? ` / ${goal}` : ""} ECTS aus GOP-Modulen bestanden</span></p>
      {goal > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" role="img" aria-label={`${g.passed} von ${goal} ECTS`}><div className="h-full" style={{ width: `${Math.min(100, (g.passed / goal) * 100)}%`, background: g.reached ? "#34d399" : "#fbbf24" }} /></div>}
      {g.stages.length > 1 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
          {g.stages.map((s) => <li key={s.bySemester}>{g.passed >= s.ects ? "✓" : "○"} {s.ects} ECTS bis Ende des {s.bySemester}. Semesters</li>)}
        </ul>
      )}
      <p className={`notice ${cls} mt-3`}>
        {!g.stage ? "Wähle unter „Daten & Einstellungen“ deinen Studienplan, dann rechnet StudyOS aus, wie viele ECTS dir fehlen."
          : g.reached ? "Geschafft: Die GOP ist bestanden."
          : !g.enough ? `Es fehlen ${g.need} ECTS, aber die offenen GOP-Module bringen nicht mehr genug. Bitte sofort bei der Studienberatung melden.`
          : <>Es fehlen noch <b>{g.need} ECTS</b> {until}. Reicht zum Beispiel: {g.combos.slice(0, 3).map((c) => c.map((m) => m.name).join(" + ")).join(" oder ")}.</>}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {g.modules.map((m) => {
          const ex = g.open.find((x) => x.id === m.id)?.exam;
          return (
            <li key={m.id} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="font-num shrink-0 text-xs text-slate-400">{m.ects} ECTS</span>
              <span className={`shrink-0 text-xs font-semibold ${m.status === "bestanden" ? "text-emerald-300" : "text-slate-400"}`}>{m.status === "bestanden" ? "bestanden" : ex ? `Prüfung ${fmt(ex.date)}` : "offen"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">Gezählt werden Module mit Häkchen „Grundlagenprüfung“ oder den Nummern aus {g.curriculum ? `dem Studienplan ${g.curriculum.name}` : "deinem Studienplan"}. Maßgeblich ist deine FPSO.</p>
    </Card>
  );
}

/* Prognose mit erwarteten Noten der laufenden und geplanten Module */
function Forecast({ data, db }) {
  const f = gradeForecast(data);
  const open = data.modules.filter((m) => (m.status === "belegt" || m.status === "geplant") && Number(m.ects) > 0 && !m.archived);
  const [show, setShow] = useState(false);
  if (!open.length) return null;
  return (
    <div className="mt-3">
      {f.forecast !== null && <p className="text-sm text-slate-300">Mit deinen erwarteten Noten ({f.expectedCount} {f.expectedCount === 1 ? "Modul" : "Module"}, {f.expectedEcts} ECTS): <b className="font-num">Ø {g2(f.forecast)}</b></p>}
      <button className="link-btn mt-1" onClick={() => setShow(!show)} aria-expanded={show}>{show ? "Erwartete Noten ausblenden" : "Was wäre wenn: erwartete Noten eintragen"}</button>
      {show && (
        <ul className="mt-2 space-y-1.5">
          {open.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-xs text-slate-500">({m.ects})</span></span>
              <input className="field w-16 py-1 text-sm" inputMode="decimal" placeholder="–" aria-label={`Erwartete Note ${m.name}`} defaultValue={m.expectedGrade ? String(m.expectedGrade).replace(".", ",") : ""}
                onBlur={(e) => { const v = parseDec(e.target.value); const ok = v >= 1 && v <= 5 ? v : null; if ((m.expectedGrade ?? null) !== ok) db.patch("modules", m.id, { expectedGrade: ok }); }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Lernzeit aller belegten Module gegen das ECTS-Soll (30 h je ECTS), wer am weitesten zurückliegt, oben */
function EctsCompare({ db }) {
  const list = workloadOverview(db.data);
  if (!list.length) return null;
  const color = (w) => (w.state === "ok" ? "var(--ok)" : w.state === "warn" ? "var(--warn)" : "var(--danger)");
  return (
    <Card title="Lernzeit gegen ECTS-Soll">
      <p className="mb-3 text-xs text-slate-400">Seit Semesterbeginn: Lernzeit und besuchte Termine gegenüber 30 h je ECTS, gleichmäßig über das Semester verteilt.</p>
      <ul className="space-y-3">
        {list.map(({ m, w }) => (
          <li key={m.id}>
            <button className={`block w-full rounded-md text-left ${focusRing}`} onClick={() => db.goModule(m.id)}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{m.name}</span>
                <span className="font-num shrink-0 text-xs text-slate-400">{fmtH(w.istH)} / {fmtH(w.sollH)}</span>
              </div>
              <Bar value={w.istH} max={Math.max(w.sollH, w.istH, 0.1)} color={color(w)} label={`${m.name}: Arbeitsaufwand im Soll`} />
              <p className="mt-0.5 text-[11px]" style={{ color: w.gapH >= 0.1 ? color(w) : undefined }}>
                {w.gapH >= 0.1 ? `${fmtH(w.gapH)} Rückstand` : w.gapH <= -0.1 ? `${fmtH(-w.gapH)} vor dem Soll` : "im Soll"}{w.needPerWeekH !== null ? `, nötig: ${fmtH(w.needPerWeekH)} pro Woche` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
