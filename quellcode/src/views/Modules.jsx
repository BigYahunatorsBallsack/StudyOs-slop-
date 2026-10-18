import React, { useState, useEffect, useRef, useMemo } from "react";
import { DONE_HW, MODULE_STATUS, RING_COLORS } from "../lib/constants.js";
import { isActive, moduleStats } from "../lib/data.js";
import { byOrder, byTime, diffDays, fmt, fmtDec, fmtMin, fmtShort, isHeld, iso, pct, sum } from "../lib/util.js";
import { Bar, Card, Empty, RingLegend, Stat, Tabs, TriRing } from "../ui/primitives.jsx";
import { CardList, HomeworkRow, LogRow, SessionRow, TopicRow } from "../ui/rows.jsx";
import { btnGhost, btnPrimary, focusRing } from "../ui/styles.js";
import { MergeModules } from "./MergeModules.jsx";
import { CurriculumDialog } from "./Curriculum.jsx";
import { mergeSuggestions } from "../lib/modules.js";
import { bonusForecast, workload } from "../lib/study.js";

/* ---------------- Module ---------------- */
export function ModuleList({ db }) {
  const { data } = db;
  const [merge, setMerge] = useState(null); /* { preset, target } */
  const suggestions = mergeSuggestions(data.modules.filter((m) => !m.archived), data.settings.mergeDismissed || []);
  const [showArchive, setShowArchive] = useState(false);
  const [plan, setPlan] = useState(false);
  const archived = data.modules.filter((m) => m.archived);
  const groups = MODULE_STATUS.map((st) => [st, data.modules.filter((m) => m.status === st && !m.archived).sort((a, b) => (a.semester || 0) - (b.semester || 0) || a.name.localeCompare(b.name))]).filter(([, l]) => l.length);
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="page-title">Module</h2>
          {data.modules.length > 0 && <p className="page-sub">{data.modules.length} Module, {sum(data.modules.filter((m) => m.status === "bestanden"), (m) => m.ects)} ECTS bestanden</p>}
        </div>
        <button className={btnPrimary} onClick={() => db.openForm("module", null, true)}>Modul anlegen</button>
      </div>
      {data.modules.length === 0 ? <Empty action={<div className="flex flex-wrap justify-center gap-2"><button className={btnPrimary} onClick={() => db.openForm("module", null, true)}>Modul anlegen</button><button className={btnGhost} onClick={() => setPlan(true)}>Aus Studienplan</button></div>}>Noch keine Module.</Empty> : <RingLegend />}
      {data.modules.length > 0 && <button className="link-btn mt-3 mr-4" onClick={() => setPlan(true)}>Studienplan TUM Informatik …</button>}
      {plan && <CurriculumDialog db={db} onClose={() => setPlan(false)} />}
      {suggestions.map((g) => (
        <div key={g.key} className="notice notice-info mt-3">
          <p className="notice-title">Gehören diese Module zusammen?</p>
          <p className="mt-1">{g.modules.map((m) => m.name).join(", ")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => setMerge({ preset: g.modules.map((m) => m.id), target: g.target.id })}>Zusammenführen …</button>
            <button className="btn btn-ghost" onClick={() => db.dismissMerge(g.key)}>Getrennt lassen</button>
          </div>
        </div>
      ))}
      {data.modules.length > 1 && !suggestions.length && <button className="link-btn mt-3" onClick={() => setMerge({ preset: [] })}>Module zusammenführen …</button>}
      {merge && <MergeModules db={db} preset={merge.preset} target={merge.target} onClose={() => setMerge(null)} />}
      {archived.length > 0 && (
        <section>
          <div className="group-head">
            <h3 className="section-title">Archiv<span className="count">{archived.length}</span></h3>
            <button className="link-btn" onClick={() => setShowArchive(!showArchive)} aria-expanded={showArchive}>{showArchive ? "Ausblenden" : "Anzeigen"}</button>
          </div>
          {showArchive && (
            <ul className="rows">
              {archived.map((m) => (
                <li key={m.id} className="row row-muted" style={{ "--mod": m.color }}>
                  <button className="row-main flex items-center gap-3" onClick={() => db.goModule(m.id)}>
                    <span className="row-title min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="row-meta shrink-0">Sem. {m.semester}{m.grade ? `, ${String(m.grade).replace(".", ",")}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {groups.map(([st, list]) => (
        <section key={st}>
          <div className="group-head"><h3 className="section-title">{st[0].toUpperCase() + st.slice(1)}<span className="count">{sum(list, (m) => m.ects)} ECTS</span></h3></div>
          <ul className="tiles">
            {list.map((m) => { const s = moduleStats(data, m.id); return (
              <li key={m.id} className="contents">
                <button onClick={() => db.goModule(m.id)} className="tile" style={{ "--mod": m.color }} aria-label={`${m.name}, ${m.ects} ECTS, ${s.openReviews} Termine offen`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="tile-swatch" aria-hidden="true" />
                    {m.status === "belegt" && <TriRing s={s} size={40} />}
                  </div>
                  <span className="tile-name">{m.name}</span>
                  <span className="tile-meta">
                    {m.grade ? `Note ${String(m.grade).replace(".", ",")}, ` : ""}{m.ects} ECTS{m.status === "belegt" ? `, ${s.openReviews ? `${s.openReviews} nachzubereiten` : "alles nachbereitet"}` : ""}
                  </span>
                  <WorkloadLine w={workload(data, m.id)} />
                </button>
              </li>
            ); })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ModuleDetail({ db, id, onBack }) {
  const { data } = db, m = db.mod(id), s = moduleStats(data, id), t = iso();
  const [sub, setSub] = useState("uebersicht");
  const [merge, setMerge] = useState(false);
  const [sesFilter, setSesFilter] = useState("anstehend");
  const sessions = data.sessions.filter((x) => x.moduleId === id).sort(byTime);
  const hw = data.homework.filter((x) => x.moduleId === id).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const topics = data.topics.filter((x) => x.moduleId === id).sort(byOrder);
  const logs = data.logs.filter((x) => x.moduleId === id).sort((a, b) => b.date.localeCompare(a.date));
  const notes = data.notes.filter((x) => x.moduleId === id).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  const cards = data.cards.filter((x) => x.moduleId === id);
  const exams = data.exams.filter((x) => x.moduleId === id).sort((a, b) => a.date.localeCompare(b.date));
  const nextSes = sessions.find((x) => !isHeld(x) && isActive(x));
  const nextHw = hw.find((x) => !DONE_HW.has(x.status));
  const nextExam = exams.find((x) => x.date >= t);
  const topicMin = (tid) => sum(logs.filter((l) => l.topicId === tid), (l) => l.minutes);
  const shownSes = sesFilter === "anstehend" ? sessions.filter((x) => !isHeld(x)) : sesFilter === "offen" ? sessions.filter((x) => isHeld(x) && !x.reviewed && isActive(x)).reverse() : sessions.filter(isHeld).reverse();

  const subs = [["uebersicht", "Übersicht"], ["termine", `Termine (${sessions.length})`], ["ha", `Hausaufgaben (${hw.length})`], ["themen", `Themen (${topics.length})`], ["lernzeit", "Lernzeit"], ["notizen", `Notizen (${notes.length})`], ["karten", `Karten (${cards.length})`]];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className={`text-sm text-slate-400 hover:text-slate-200 ${focusRing} rounded`}>← Alle Module</button>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-8 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{m.name}</h2>
          <p className="text-xs text-slate-400">{m.code ? m.code + " · " : ""}{m.ects} ECTS · Semester {m.semester} · {m.status}{m.grade ? ` · Note ${String(m.grade).replace(".", ",")}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={btnGhost} onClick={() => db.openForm("module", m)}>Bearbeiten</button>
        <button className={btnGhost} onClick={() => setMerge(true)}>Zusammenführen</button>
      </div>
      {merge && <MergeModules db={db} preset={[id, ...mergeSuggestions(data.modules).filter((g) => g.modules.some((x) => x.id === id)).flatMap((g) => g.modules.map((x) => x.id)).filter((x) => x !== id)]} target={id} onClose={() => setMerge(false)} onDone={(tid) => tid !== id && db.goModule(tid)} />}
      <Tabs items={subs} value={sub} onChange={setSub} label="Modulbereiche" />

      {sub === "uebersicht" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <TriRing s={s} size={96} />
              <div className="min-w-0 flex-1 space-y-2">
                {[["Nachbereitung", s.reviewQuote, `${s.reviewed}/${s.held} Termine`, RING_COLORS.review], ["Hausaufgaben", s.hwQuote, `${s.hwDone}/${s.hwTotal} bearbeitet`, RING_COLORS.hw], ["Themen", s.topicQuote, `${s.topicsDone}/${s.topicsTotal} geübt oder sicher`, RING_COLORS.topics]].map(([l, v, d, c]) => (
                  <div key={l}>
                    <div className="flex justify-between text-xs"><span className="text-slate-300">{l}</span><span className="font-num text-slate-400">{pct(v)}</span></div>
                    <Bar value={v || 0} color={c} className="mt-1" label={l} />
                    <p className="mt-0.5 text-[11px] text-slate-500">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Gesamtfortschritt" value={pct(s.overall)} />
            <Stat label="Lernzeit" value={fmtMin(s.minutes)} />
            <Stat label="Punkte HA" value={s.pointsQuote === null ? "–" : pct(s.pointsQuote)} sub={s.maxPts ? `${s.pts}/${s.maxPts}` : "noch nichts bewertet"} />
            <Stat label="Karten fällig" value={cards.filter((c) => c.due <= t).length} sub={`${cards.length} gesamt`} />
          </div>
          {s.bonusPct > 0 && (
            <Card title="Notenbonus (Hausaufgaben)">
              <div className="relative">
                <Bar value={s.pointsQuote || 0} max={1} color={(s.pointsQuote || 0) * 100 >= s.bonusPct ? "#34d399" : "#fbbf24"} label="Punkte für den Bonus" />
                <span className="absolute -top-1 h-4 w-0.5 rounded bg-slate-200" style={{ left: `${Math.min(100, s.bonusPct)}%` }} aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {s.maxPts ? <>{fmtDec(s.pts)} von {fmtDec(s.maxPts)} Punkten ({pct(s.pointsQuote)}), Grenze {fmtDec(s.bonusPct)} %</> : "Trage bei bewerteten Hausaufgaben Punkte ein, um den Stand zu sehen."}
              </p>
              <BonusForecast f={bonusForecast(data, id)} />
            </Card>
          )}
          <WorkloadCard w={workload(data, id)} />
          <Card title="Als Nächstes">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-2"><span className="text-slate-400">Termin</span><span className="text-right">{nextSes ? `${fmtShort(nextSes.date)} ${nextSes.start} · ${nextSes.type}` : "–"}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-400">Abgabe</span><span className="text-right">{nextHw ? `${nextHw.title} · ${fmtShort(nextHw.due)}` : "–"}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-400">Prüfung</span><span className="text-right">{nextExam ? `${fmt(nextExam.date)} (in ${diffDays(t, nextExam.date)} T.)` : <button className="text-sky-400 hover:underline" onClick={() => db.openForm("exam", { moduleId: id }, true)}>eintragen</button>}</span></li>
            </ul>
          </Card>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[["session", "+ Termin / Serie"], ["homework", "+ Hausaufgabe"], ["topic", "+ Thema"], ["log", "+ Lerneinheit"], ["note", "+ Notiz"], ["card", "+ Karte"]].map(([k, l]) => (
              <button key={k} className={`${btnGhost} py-2.5`} onClick={() => db.openForm(k, { moduleId: id, ...(k === "log" ? { date: t } : {}) }, true)}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {sub === "termine" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs items={[["anstehend", "Anstehend"], ["offen", `Nachzubereiten (${s.openReviews})`], ["vergangen", "Vergangen"]]} value={sesFilter} onChange={setSesFilter} label="Filter Termine" />
            <button className={btnPrimary} onClick={() => db.openForm("session", { moduleId: id }, true)}>+ Termin / Serie</button>
          </div>
          {shownSes.length ? <ul className="rows">{shownSes.map((x) => <SessionRow key={x.id} s={x} db={db} showDate />)}</ul> : <Empty>Keine Termine in dieser Ansicht. Tipp: Beim Anlegen „Wöchentlich wiederholen bis“ setzen, um das ganze Semester einzutragen.</Empty>}
        </div>
      )}

      {sub === "ha" && (
        <div className="space-y-3">
          <div className="flex justify-end"><button className={btnPrimary} onClick={() => db.openForm("homework", { moduleId: id }, true)}>+ Hausaufgabe</button></div>
          {hw.length ? <ul className="rows">{hw.map((h) => <HomeworkRow key={h.id} h={h} db={db} />)}</ul> : <Empty>Noch keine Hausaufgaben.</Empty>}
        </div>
      )}

      {sub === "themen" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">Stand antippen zum Ändern, Sterne für Selbsteinschätzung.</p>
            <button className={btnPrimary} onClick={() => db.openForm("topic", { moduleId: id }, true)}>+ Thema</button>
          </div>
          {topics.length ? <ul className="rows">{topics.map((x) => <TopicRow key={x.id} x={x} db={db} minutes={topicMin(x.id)} />)}</ul> : <Empty>Lege die Kapitel aus Skript oder Vorlesung als Themen an, um deinen Lernstand zu verfolgen.</Empty>}
        </div>
      )}

      {sub === "lernzeit" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm text-slate-300">Gesamt: <span className="font-num">{fmtMin(s.minutes)}</span></p>
            <button className={btnPrimary} onClick={() => db.openForm("log", { moduleId: id, date: t }, true)}>+ Lerneinheit</button></div>
          {logs.length ? <ul className="rows">{logs.map((l) => <LogRow key={l.id} l={l} db={db} />)}</ul> : <Empty>Noch keine Lerneinheiten.</Empty>}
        </div>
      )}

      {sub === "notizen" && (
        <div className="space-y-3">
          <div className="flex justify-end"><button className={btnPrimary} onClick={() => db.openForm("note", { moduleId: id }, true)}>+ Notiz</button></div>
          {notes.length ? (
            <ul className="rows">
              {notes.map((n) => { const ses = data.sessions.find((x) => x.id === n.sessionId); return (
                <li key={n.id}>
                  <button onClick={() => db.openNote(n.id)} className={`w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:bg-slate-800/50 ${focusRing}`}>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-slate-500">{fmt(n.updated)}{ses ? ` · ${fmtShort(ses.date)} ${ses.type}` : ""}</p>
                    {n.text && <p className="font-num mt-1 max-h-10 overflow-hidden whitespace-pre-wrap text-xs text-slate-400">{n.text}</p>}
                  </button>
                </li>
              ); })}
            </ul>
          ) : <Empty>Noch keine Notizen.</Empty>}
        </div>
      )}

      {sub === "karten" && (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button className={btnGhost} disabled={!cards.some((c) => c.due <= t)} onClick={() => db.goLearn("karten", id)}>Fällige lernen</button>
            <button className={btnPrimary} onClick={() => db.openForm("card", { moduleId: id }, true)}>+ Karte</button>
          </div>
          <CardList cards={cards} db={db} />
        </div>
      )}
    </div>
  );
}

const fmtH = (h) => (h < 10 ? h.toFixed(1).replace(".", ",") : Math.round(h)) + " h";

/* Was ist für den Notenbonus noch nötig? */
export function BonusForecast({ f }) {
  if (!f || f.state === "open") return f ? <p className="mt-2 text-xs text-slate-500">Für eine Prognose: Maximalpunkte bei den Blättern eintragen (oder eine Blatt-Serie anlegen).</p> : null;
  const num = (x) => fmtDec(Math.round(x * 10) / 10);
  const text = {
    reached: <>Bonus erreicht. Glückwunsch!</>,
    ok: <>Noch <b>{num(f.need)} Punkte</b> auf {f.remaining} {f.remaining === 1 ? "Blatt" : "Blätter"}, also <b>⌀ {num(f.perSheet)}</b> pro Blatt ({Math.round(f.needPct * 100)} %). Das schaffst du in deinem aktuellen Schnitt ({Math.round(f.currentPct * 100)} %).</>,
    tight: <>Noch <b>{num(f.need)} Punkte</b> auf {f.remaining} {f.remaining === 1 ? "Blatt" : "Blätter"}, also <b>⌀ {num(f.perSheet)}</b> pro Blatt ({Math.round(f.needPct * 100)} %).{f.currentPct !== null ? ` Mehr als dein bisheriger Schnitt (${Math.round(f.currentPct * 100)} %).` : ""}</>,
    impossible: <>Mit den eingetragenen Blättern ist der Bonus nicht mehr erreichbar (nötig wären {Math.round(f.needPct * 100)} % der restlichen Punkte). Stimmen Anzahl und Maximalpunkte der Blätter?</>,
  }[f.state];
  return <p className={`notice mt-2 ${f.state === "reached" || f.state === "ok" ? "notice-ok" : f.state === "tight" ? "notice-warn" : "notice-danger"}`}>{text}</p>;
}

/* Arbeitsaufwand nach ECTS: Soll bis heute gegen Lernzeit und besuchte Termine */
export function WorkloadCard({ w }) {
  if (!w) return null;
  const color = w.state === "ok" ? "var(--ok)" : w.state === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <Card title="Arbeitsaufwand">
      <p className="text-sm text-slate-300"><b className="stat-value text-base">{fmtH(w.istH)}</b> von etwa <b>{fmtH(w.sollH)}</b> bis heute</p>
      <Bar value={w.istH} max={Math.max(w.sollH, w.istH, 0.1)} color={color} className="mt-2" label="Arbeitsaufwand im Soll" />
      <p className="mt-2 text-xs text-slate-400">
        {w.ects} ECTS entsprechen etwa {Math.round(w.totalH)} h Arbeit, verteilt auf {w.weeks} Wochen also rund {fmtH(w.perWeekH)} pro Woche. Gezählt: {fmtH(w.selfH)} Lernzeit und {fmtH(w.presenceH)} besuchte Termine.
        {w.state !== "ok" && " Lernzeit trägst du über den Timer oder „+ Lerneinheit“ ein."}
      </p>
    </Card>
  );
}

/* Kleine Ampel auf der Modulkachel */
function WorkloadLine({ w }) {
  if (!w) return null;
  const color = w.state === "ok" ? "var(--ok)" : w.state === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <span className="tile-meta mt-1 flex items-center gap-1.5" title="Arbeitsaufwand bis heute: Lernzeit und besuchte Termine gegenüber dem ECTS-Soll">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {fmtH(w.istH)} von {fmtH(w.sollH)} Aufwand
    </span>
  );
}
