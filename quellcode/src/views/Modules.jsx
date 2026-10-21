import React, { useEffect, useState } from "react";
import { DONE_HW, MODULE_STATUS, RING_COLORS } from "../lib/constants.js";
import { dueInfo, isActive, moduleStats } from "../lib/data.js";
import { byOrder, byTime, diffDays, fmt, fmtDec, fmtH, fmtMin, fmtShort, isHeld, iso, pct, sum } from "../lib/util.js";
import { Bar, Card, Empty, RingLegend, Stat, Tabs, TriRing } from "../ui/primitives.jsx";
import { sortNotes } from "../lib/notes.js";
import { CardList, ExamCountdown, HomeworkRow, NoteRow, RoomLabel, SessionRow, TopicRow } from "../ui/rows.jsx";
import { SelectToggle } from "../ui/selection.jsx";
import { btnGhost, btnPrimary, focusRing } from "../ui/styles.js";
import { MergeModules } from "./MergeModules.jsx";
import { CurriculumDialog } from "./Curriculum.jsx";
import { mergeSuggestions } from "../lib/modules.js";
import { bonusForecast, recordingBacklog, sheetBars, studyDiary, workload } from "../lib/study.js";
import { MODULE_SORTS, nextUp, readModuleSort, saveModuleSort, sortModules } from "../lib/overview.js";
import { rememberOpened } from "../lib/recent.js";
import { isGop } from "../lib/tum.js";
import { curriculumOf, gopCodes } from "../lib/curriculum.js";
import { ModuleLinkButtons } from "../ui/modlinks.jsx";
import { readView, saveView } from "../lib/view.js";

/* ---------------- Module ---------------- */
export function ModuleList({ db }) {
  const { data } = db;
  const [merge, setMerge] = useState(null); /* { preset, target } */
  const suggestions = mergeSuggestions(data.modules.filter((m) => !m.archived), data.settings.mergeDismissed || []);
  const [showArchive, setShowArchive] = useState(false);
  const [plan, setPlan] = useState(false);
  const archived = data.modules.filter((m) => m.archived);
  /* Sortierung pro Gerät: nach Semester oder nach dem, was als Nächstes fällig ist */
  const [order, setOrderState] = useState(readModuleSort);
  const setOrder = (v) => { setOrderState(v); saveModuleSort(v); };
  const next = new Map(data.modules.filter((m) => !m.archived && m.status !== "bestanden").map((m) => [m.id, nextUp(data, m.id)]));
  const groups = MODULE_STATUS.map((st) => [st, sortModules(data.modules.filter((m) => m.status === st && !m.archived), order, (m) => next.get(m.id))]).filter(([, l]) => l.length);
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
      {data.modules.length > 1 && <div className="mt-3"><Tabs items={MODULE_SORTS} value={order} onChange={setOrder} label="Sortierung" /></div>}
      {data.modules.length > 0 && <button className="link-btn mt-3 mr-4" onClick={() => setPlan(true)}>Aus Studienplan übernehmen …</button>}
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
            {list.map((m) => { const s = moduleStats(data, m.id), up = next.get(m.id); return (
              <li key={m.id} className="contents">
                <button onClick={() => db.goModule(m.id)} className="tile" style={{ "--mod": m.color }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="tile-swatch" aria-hidden="true" />
                    {m.status === "belegt" && <span aria-hidden="true"><TriRing s={s} size={40} /></span>}
                  </div>
                  <span className="tile-name">{m.name}</span>
                  {up && <span className={`tile-next font-num ${up.urgent ? "tile-next-urgent" : ""}`} title={up.label}><span className="sr-only">{up.label}</span><span aria-hidden="true">{up.text}</span></span>}
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
  const { data } = db, m = db.mod(id), s = moduleStats(data, id), t = iso(), gop = gopCodes(curriculumOf(data));
  const [sub, setSubState] = useState(() => readView().moduleSub || "uebersicht");
  const setSub = (v) => { setSubState(v); saveView({ moduleSub: v }); };
  const [merge, setMerge] = useState(false);
  useEffect(() => rememberOpened("module", id), [id]);
  const [sesFilter, setSesFilter] = useState("anstehend");
  const sessions = data.sessions.filter((x) => x.moduleId === id).sort(byTime);
  const hw = data.homework.filter((x) => x.moduleId === id).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const topics = data.topics.filter((x) => x.moduleId === id).sort(byOrder);
  const logs = data.logs.filter((x) => x.moduleId === id).sort((a, b) => b.date.localeCompare(a.date));
  const notes = sortNotes(data.notes.filter((x) => x.moduleId === id));
  const pinned = notes.filter((x) => x.pinned);
  const cards = data.cards.filter((x) => x.moduleId === id);
  const exams = data.exams.filter((x) => x.moduleId === id).sort((a, b) => a.date.localeCompare(b.date));
  const nextSes = sessions.find((x) => !isHeld(x) && isActive(x));
  const nextHw = hw.find((x) => !DONE_HW.has(x.status));
  const nextExam = exams.find((x) => x.date >= t);
  const nextDue = nextHw && dueInfo(nextHw.due, false, nextHw.dueTime);
  const topicMin = (tid) => sum(logs.filter((l) => l.topicId === tid), (l) => l.minutes);
  const shownSes = sesFilter === "anstehend" ? sessions.filter((x) => !isHeld(x)) : sesFilter === "offen" ? sessions.filter((x) => isHeld(x) && !x.reviewed && isActive(x)).reverse() : sessions.filter(isHeld).reverse();

  const subs = [["uebersicht", "Übersicht"], ["termine", `Termine (${sessions.length})`], ["ha", `Hausaufgaben (${hw.length})`], ["themen", `Themen (${topics.length})`], ["lernzeit", "Lernzeit"], ["notizen", `Notizen (${notes.length})`], ["karten", `Karten (${cards.length})`]];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className={`tap text-sm text-slate-400 hover:text-slate-200 ${focusRing} rounded`}>← Alle Module</button>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-8 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{m.name}</h2>
          <p className="text-xs text-slate-400">{m.code ? m.code + " · " : ""}{m.ects} ECTS · Semester {m.semester} · {m.status}{m.grade ? ` · Note ${String(m.grade).replace(".", ",")}` : ""}{isGop(m, gop) ? " · GOP" : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ModuleLinkButtons m={m} settings={data.settings} className={btnGhost} />
        <button className={btnGhost} onClick={() => db.openForm("module", m)}>Bearbeiten</button>
        <button className={btnGhost} onClick={() => setMerge(true)}>Zusammenführen</button>
      </div>
      {merge && <MergeModules db={db} preset={[id, ...mergeSuggestions(data.modules).filter((g) => g.modules.some((x) => x.id === id)).flatMap((g) => g.modules.map((x) => x.id)).filter((x) => x !== id)]} target={id} onClose={() => setMerge(false)} onDone={(tid) => tid !== id && db.goModule(tid)} />}
      <Tabs items={subs} value={sub} onChange={setSub} label="Modulbereiche" swipe />

      {sub === "uebersicht" && (
        <div className="space-y-4">
          {nextExam && nextExam.result !== "bestanden" && <ExamCountdown e={nextExam} db={db} showModule={false} />}
          <Card title="Als Nächstes">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-2"><span className="text-slate-400">Termin</span><span className="text-right">{nextSes ? <>{fmtShort(nextSes.date)} {nextSes.start} · {nextSes.type}{nextSes.room || nextSes.change?.was?.room ? " · " : ""}<RoomLabel s={nextSes} /></> : "–"}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-400">Abgabe</span><span className="text-right">{nextHw ? <>{nextHw.title} · <span className={nextDue.urgent ? nextDue.cls : ""}>{nextDue.when}</span></> : "–"}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-400">Prüfung</span><span className="text-right">{nextExam ? `${fmt(nextExam.date)} (in ${diffDays(t, nextExam.date)} T.)` : <button className="text-sky-400 hover:underline" onClick={() => db.openForm("exam", { moduleId: id }, true)}>eintragen</button>}</span></li>
            </ul>
          </Card>
          <RecordingBacklog b={recordingBacklog(data, id)} db={db} />
          {pinned.length > 0 && <Card title="Angeheftet"><ul className="rows">{pinned.map((n) => <NoteRow key={n.id} n={n} db={db} meta={fmt(n.updated)} />)}</ul></Card>}
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
          <SheetPoints s={sheetBars(data, id)} color={m.color} />
          <WorkloadCard w={workload(data, id)} m={m} db={db} />
          <DiaryPreview logs={logs.filter((l) => l.note)} onAll={() => setSub("lernzeit")} />
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
            <div className="flex items-center gap-3">
              <SelectToggle db={db} kind="session" ids={shownSes.map((x) => x.id)} />
              <button className={btnPrimary} onClick={() => db.openForm("session", { moduleId: id }, true)}>+ Termin / Serie</button>
            </div>
          </div>
          {shownSes.length ? <ul className="rows">{shownSes.map((x) => <SessionRow key={x.id} s={x} db={db} showDate />)}</ul> : <Empty art="flag">Keine Termine in dieser Ansicht.</Empty>}
        </div>
      )}

      {sub === "ha" && (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-3"><SelectToggle db={db} kind="homework" ids={hw.map((h) => h.id)} /><button className={btnPrimary} onClick={() => db.openForm("homework", { moduleId: id }, true)}>+ Hausaufgabe</button></div>
          {hw.length ? <ul className="rows">{hw.map((h) => <HomeworkRow key={h.id} h={h} db={db} />)}</ul> : <Empty art="check">Noch keine Hausaufgaben. Genieß die Ruhe.</Empty>}
        </div>
      )}

      {sub === "themen" && (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button className={btnPrimary} onClick={() => db.openForm("topic", { moduleId: id }, true)}>+ Thema</button>
          </div>
          {topics.length ? <ul className="rows">{topics.map((x) => <TopicRow key={x.id} x={x} db={db} minutes={topicMin(x.id)} />)}</ul> : <Empty art="star">Lege die Kapitel aus Skript oder Vorlesung als Themen an, um deinen Lernstand zu verfolgen.</Empty>}
        </div>
      )}

      {sub === "lernzeit" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm text-slate-300">Gesamt: <span className="font-num">{fmtMin(s.minutes)}</span></p>
            <button className={btnPrimary} onClick={() => db.openForm("log", { moduleId: id, date: t }, true)}>+ Lerneinheit</button></div>
          <WorkloadCard w={workload(data, id)} m={m} db={db} />
          <Diary days={studyDiary(data.logs, id)} db={db} color={m.color} />
        </div>
      )}

      {sub === "notizen" && (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-3"><SelectToggle db={db} kind="note" ids={notes.map((n) => n.id)} /><button className={btnPrimary} onClick={() => db.openForm("note", { moduleId: id }, true)}>+ Notiz</button></div>
          {notes.length ? (
            <ul className="rows">
              {notes.map((n) => { const ses = data.sessions.find((x) => x.id === n.sessionId); return (
                <NoteRow key={n.id} n={n} db={db} meta={`${fmt(n.updated)}${ses ? ` · ${fmtShort(ses.date)} ${ses.type}` : ""}`} />
              ); })}
            </ul>
          ) : <Empty art="book">Noch keine Notizen.</Empty>}
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

/* Aufzeichnungs-Rückstand: vergangene Vorlesungen, weder besucht noch ganz angeschaut; antippen zeigt die Liste */
function RecordingBacklog({ b, db }) {
  const [open, setOpen] = useState(false);
  if (!b.list.length) return null;
  return (
    <div>
      <button className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {b.list.length} {b.list.length === 1 ? "Aufzeichnung" : "Aufzeichnungen"} offen · {fmtMin(b.minutes)}
      </button>
      {open && <ul className="rows mt-2">{b.list.map(({ s }) => <SessionRow key={s.id} s={s} db={db} showDate />)}</ul>}
    </div>
  );
}

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

/* Punkte pro Blatt als Pixel-Balken: erreicht von maximal, Linie für die Bonusgrenze, auf offenen Blättern
   der Anteil, der noch im Schnitt nötig ist. Für Screenreader eine Zusammenfassung, als Tabelle aufklappbar. */
export function SheetPoints({ s, color }) {
  if (!s) return null;
  const num = (x) => fmtDec(Math.round(x * 10) / 10);
  const p = (x) => `${Math.round(x * 100)} %`;
  const ok = (b) => s.limit === null || b.points / b.max >= s.limit;
  const summary = [
    s.bars.map((b) => (b.graded ? `${b.title}: ${num(b.points)} von ${num(b.max)}` : `${b.title}: offen, ${num(b.max)} möglich`)).join("; "),
    s.limit !== null ? `Bonusgrenze ${p(s.limit)}` : "",
    s.need !== null ? `auf den offenen Blättern im Schnitt ${p(s.need)} nötig` : "",
  ].filter(Boolean).join(". ");
  return (
    <Card title="Punkte pro Blatt">
      <div className="sheetbars" role="img" aria-label={`Punkte pro Blatt. ${summary}`} style={{ "--mod": color }}>
        {s.limit !== null && <span className="sheetbars-limit" style={{ bottom: `${s.limit * 100}%` }} aria-hidden="true"><span>{p(s.limit)}</span></span>}
        {s.bars.map((b) => (
          <span key={b.id} className={`sheetbar ${b.graded ? (ok(b) ? "sheetbar-ok" : "sheetbar-low") : "sheetbar-open"}`}
            title={b.graded ? `${b.title}: ${num(b.points)} von ${num(b.max)} Punkten (${p(b.points / b.max)})` : `${b.title}: noch offen, ${num(b.max)} Punkte möglich`}>
            {b.graded && <span className="sheetbar-fill" style={{ height: `${Math.min(100, (b.points / b.max) * 100)}%` }} />}
            {!b.graded && s.need !== null && <span className="sheetbar-need" style={{ bottom: `${Math.min(100, s.need * 100)}%` }} />}
          </span>
        ))}
      </div>
      <div className="sheetbars-x font-num" aria-hidden="true">{s.bars.map((b) => <span key={b.id}>{b.short}</span>)}</div>
      <p className="mt-2 text-[11px] text-slate-500">
        Gefüllt: erreichte Punkte, leer: noch offen.{s.limit !== null ? ` Linie: Bonusgrenze ${p(s.limit)}.` : ""}{s.need !== null ? ` Strich auf offenen Blättern: im Schnitt nötig (${p(s.need)}).` : ""}
      </p>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-slate-400">Als Tabelle</summary>
        <table className="sheet-table mt-2 w-full">
          <thead><tr><th scope="col">Blatt</th><th scope="col">Punkte</th><th scope="col">Anteil</th></tr></thead>
          <tbody>
            {s.bars.map((b) => (
              <tr key={b.id}><th scope="row">{b.title}</th><td className="font-num">{b.graded ? `${num(b.points)} / ${num(b.max)}` : `– / ${num(b.max)}`}</td><td className="font-num">{b.graded ? p(b.points / b.max) : s.need !== null ? `nötig ${p(s.need)}` : "offen"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

/* Arbeitsaufwand nach ECTS: Soll bis heute gegen Lernzeit und besuchte Termine */
export function WorkloadCard({ w, m, db }) {
  if (!w) return null;
  const goal = Number(m?.weeklyGoal) || 0;
  const color = w.state === "ok" ? "var(--ok)" : w.state === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <Card title="Arbeitsaufwand">
      <p className="text-sm text-slate-300"><b className="stat-value text-base">{fmtH(w.istH)}</b> von etwa <b>{fmtH(w.sollH)}</b> bis heute</p>
      <Bar value={w.istH} max={Math.max(w.sollH, w.istH, 0.1)} color={color} className="mt-2" label="Arbeitsaufwand im Soll" />
      <p className="mt-2 text-xs text-slate-400">
        {w.ects} ECTS entsprechen etwa {Math.round(w.totalH)} h Arbeit, verteilt auf {w.weeks} Wochen also rund {fmtH(w.perWeekH)} pro Woche. Gezählt: {fmtH(w.selfH)} Lernzeit und {fmtH(w.presenceH)} besuchte Termine.
        {w.state !== "ok" && " Lernzeit trägst du über den Timer oder „+ Lerneinheit“ ein."}
      </p>
      {(Math.abs(w.gapH) >= 0.1 || w.needPerWeekH !== null) && (
        <p className={`notice mt-2 ${w.state === "ok" ? "notice-ok" : w.state === "warn" ? "notice-warn" : "notice-danger"}`}>
          {w.gapH >= 0.1 ? <>Du liegst <b>{fmtH(w.gapH)}</b> hinter dem Soll.</> : w.gapH <= -0.1 ? <>Du liegst <b>{fmtH(-w.gapH)}</b> vor dem Soll.</> : <>Du liegst genau im Soll.</>}
          {w.needPerWeekH !== null && <> Für die vollen {Math.round(w.totalH)} h brauchst du in den restlichen {Math.round(w.leftWeeks)} {Math.round(w.leftWeeks) === 1 ? "Woche" : "Wochen"} rund <b>{fmtH(w.needPerWeekH)}</b> pro Woche.</>}
        </p>
      )}
      {db && m && w.goalSuggestH !== null && w.goalSuggestH !== goal && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>{goal ? `Wochenziel: ${fmtDec(goal)} h.` : "Noch kein Wochenziel."} Nach ECTS wären es etwa {fmtDec(w.goalSuggestH)} h Lernzeit pro Woche (Termine schon abgezogen).</span>
          <button className={btnGhost} onClick={() => { db.patch("modules", m.id, { weeklyGoal: w.goalSuggestH }); db.toast(`Wochenziel für ${m.name}: ${fmtDec(w.goalSuggestH)} h.`); }}>Als Wochenziel übernehmen</button>
        </div>
      )}
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

/* Die letzten Lernnotizen in der Modulübersicht */
function DiaryPreview({ logs, onAll }) {
  if (!logs.length) return null;
  return (
    <Card title="Lerntagebuch" action={<button className="link-btn" onClick={onAll}>Alle ansehen</button>}>
      <ul className="space-y-1.5 text-sm">
        {logs.slice(0, 3).map((l) => (
          <li key={l.id} className="flex gap-2">
            <span className="font-num shrink-0 text-xs leading-5 text-slate-500">{fmtShort(l.date)}</span>
            <span className="min-w-0 flex-1 break-words">{l.note}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* Lerntagebuch: Lerneinheiten nach Tagen, mit der Notiz in voller Länge */
function Diary({ days, db, color }) {
  if (!days.length) return <Empty art="hourglass">Noch keine Lerneinheiten. Nach einer Fokusphase im Timer kannst du in einer Zeile notieren, was du gemacht hast.</Empty>;
  return (
    <section aria-label="Lerntagebuch" className="space-y-3">
      <h3 className="section-title">Lerntagebuch</h3>
      {days.map((d) => (
        <div key={d.date}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-slate-400">
            <span className="font-semibold">{fmtShort(d.date)}</span><span className="font-num">{fmtMin(d.minutes)}</span>
          </div>
          <ul className="rows">
            {d.logs.map((l) => { const tp = db.data.topics.find((x) => x.id === l.topicId); return (
              <li key={l.id} className="row" style={{ "--mod": color }}>
                <button onClick={() => db.openForm("log", l)} className="row-main flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm ${l.note ? "" : "text-slate-500"}`}>{l.note || "Ohne Notiz"}</p>
                    <p className="row-meta">{l.at ? `${l.at}, ` : ""}{l.kind}{tp ? `, ${tp.title}` : ""}</p>
                  </div>
                  <span className="stat-value shrink-0 text-base">{fmtMin(l.minutes)}</span>
                </button>
              </li>
            ); })}
          </ul>
        </div>
      ))}
    </section>
  );
}
