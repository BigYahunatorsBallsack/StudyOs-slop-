import React, { useState, useEffect, useRef, useMemo } from "react";
import { WD_LONG } from "../lib/constants.js";
import { isActive, streakOf } from "../lib/data.js";
import { byTime, diffDays, fmtMin, fmtShort, isHeld, iso, isoWeek, nowHM, sum, wdIdx, weekStart } from "../lib/util.js";
import { Bar, Card } from "../ui/primitives.jsx";
import { btnGhost, btnPrimary } from "../ui/styles.js";
import { examDeadlines } from "../lib/stats.js";
import { nextUp } from "../lib/next.js";
import { SessionTri } from "../ui/session.jsx";
import { dueLabel, todoItems } from "../lib/todo.js";
import { PlaceLinks } from "../ui/links.jsx";
import { MensaCard } from "./Mensa.jsx";
import { mensaOf } from "../lib/mensa.js";
import { CommuteCard } from "./Commute.jsx";
import { commuteOf } from "../lib/transit.js";
import { WhatNowDialog } from "./WhatNow.jsx";
import { withoutArchived } from "../lib/study.js";

/* ---------------- Heute ---------------- */
export function Today({ db, onQuick, notice, whatNowOpen = false, setWhatNowOpen = () => {} }) {
  const data = withoutArchived(db.data), t = iso();
  const deadlines = examDeadlines(data, t);

  if (!data.modules.length) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="page-title">Willkommen{data.settings.name ? `, ${data.settings.name}` : ""}</h2>
          <p className="page-sub">In fünf Schritten ist dein Semester eingerichtet.</p>
        </div>
        <Card>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Module des Semesters anlegen (Name, ECTS, Status)</li>
            <li>Vorlesungen und Übungen als wöchentliche Serie eintragen, oder den TUMonline-Kalender abonnieren</li>
            <li>Themen bzw. Kapitel pro Modul anlegen</li>
            <li>Hausaufgaben mit Abgabedatum erfassen</li>
            <li>Nach jedem Termin „Nachbereitet“ abhaken und Lernzeit eintragen</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => db.openForm("module", null, true)}>Erstes Modul anlegen</button>
            <button className={btnGhost} onClick={() => db.goMore("daten")}>Sicherung importieren oder Beispiel ansehen</button>
          </div>
        </Card>
      </div>
    );
  }

  const todays = data.sessions.filter((s) => s.date === t).sort(byTime);
  const [nowOpen, setNowOpen] = [whatNowOpen, setWhatNowOpen];
  const blocksToday = (data.blocks || []).filter((b) => b.date === t);
  const plan = [...todays.map((s) => ({ s })), ...blocksToday.map((b) => ({ b, start: b.start }))].sort((a, b) => (a.s || a.b).start.localeCompare((b.s || b.b).start));
  const todo = todoItems(data, t);
  /* Prüfungen und Wiederholungsprüfungen als Countdown */
  const exams = [
    ...data.exams.filter((e) => e.date >= t && e.result !== "bestanden").map((e) => ({ e, date: e.date, retake: false })),
    ...data.exams.filter((e) => e.retakeDate && e.retakeDate >= t && e.result === "nicht bestanden").map((e) => ({ e, date: e.retakeDate, retake: true })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const minToday = sum(data.logs.filter((l) => l.date === t), (l) => l.minutes);
  const minWeek = sum(data.logs.filter((l) => l.date >= weekStart(t) && l.date <= t), (l) => l.minutes);
  const streak = streakOf(data.logs);
  const goalMin = (Number(data.settings.weeklyGoal) || 0) * 60;
  const cardsDue = data.cards.filter((c) => c.due <= t).length;
  const openReviews = todo.filter((x) => x.kind === "review").length;
  const nextDay = todays.length ? null : data.sessions.filter((s) => s.date > t && isActive(s)).sort(byTime)[0];
  const longDate = new Date(t + "T00:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long" });

  return (
    <div>
      <div className="mb-4">
        <h2 className="page-title">{WD_LONG[wdIdx(t)]}</h2>
        <p className="page-sub">{longDate}, Woche {isoWeek(t)}</p>
      </div>

      <NextUp db={db} openReviews={openReviews} cardsDue={cardsDue} />

      <div className="mt-3 flex gap-2">
        <button className="quick min-w-0 flex-1" onClick={onQuick} aria-label="Schnelleingabe öffnen">
          <span>Was steht an?</span>
          <span className="quick-plus" aria-hidden="true">+</span>
        </button>
        <button className="whatnow" onClick={() => setNowOpen(true)}>Was jetzt?</button>
      </div>
      {nowOpen && <WhatNowDialog db={db} onClose={() => setNowOpen(false)} />}

      <div className="minis mt-3" aria-label="Lernzeit">
        <span><b>{fmtMin(minToday)}</b> heute</span>
        <span><b>{fmtMin(minWeek)}</b>{goalMin ? ` von ${fmtMin(goalMin)}` : ""} diese Woche</span>
        <span><b>{streak}</b> {streak === 1 ? "Tag" : "Tage"} Serie</span>
      </div>
      {goalMin > 0 && <Bar value={minWeek} max={goalMin} label="Wochenziel Lernzeit" className="mt-2" />}

      {notice && <div className="mt-4">{notice}</div>}

      <Group title="Tagesplan" count={plan.length || undefined}>
        {plan.length ? (
          <ol className="timeline">
            {plan.map((x) => (x.s ? <TimelineRow key={x.s.id} s={x.s} db={db} /> : <TimelineBlock key={x.b.id} b={x.b} db={db} />))}
          </ol>
        ) : (
          <p className="text-sm text-slate-400">Heute keine Lehrveranstaltungen.{nextDay ? ` Als nächstes: ${db.mod(nextDay.moduleId)?.name || nextDay.type}, ${fmtShort(nextDay.date)} um ${nextDay.start}.` : ""}</p>
        )}
      </Group>

      <Group title="Zu erledigen" count={todo.length}>
        {todo.length ? <TodoList db={db} items={todo} /> : <p className="text-sm text-slate-400">Alles erledigt.</p>}
      </Group>

      {exams.length > 0 && (
        <Group title="Prüfungen" action={<button className="link-btn" onClick={() => db.goLearn("pruefungen")}>Lernplan</button>}>
          <div className="exam-chips">
            {exams.map(({ e, date, retake }) => { const m = db.mod(e.moduleId), n = diffDays(t, date); return (
              <button key={e.id + retake} className="exam-chip" style={{ "--mod": m?.color }} onClick={() => db.goLearn("pruefungen")}>
                <span className="exam-chip-days">{n === 0 ? "heute" : n === 1 ? "morgen" : `${n} Tage`}</span>
                <span className="exam-chip-name">{retake ? "Wiederholung: " : ""}{m?.name || "Prüfung"}</span>
              </button>
            ); })}
          </div>
        </Group>
      )}
      {commuteOf(db.data.settings) && db.cloud?.available && <div className="mt-6"><CommuteCard db={db} sessions={data.sessions} /></div>}
      {mensaOf(db.data.settings) && <div className="mt-6"><MensaCard canteen={mensaOf(db.data.settings)} /></div>}
    </div>
  );
}

/* Ein Termin im Tagesplan: Uhrzeit, Modul, Raum und die drei Schalter */
function TimelineRow({ s, db }) {
  const m = db.mod(s.moduleId), now = nowHM();
  const state = s.date === iso() && s.start <= now && now < (s.end || s.start) ? "live" : isHeld(s) ? "past" : "next";
  return (
    <li className={`tl-row tl-${state} ${s.cancelled ? "row-muted" : ""}`} style={{ "--mod": m?.color }}>
      <div className="tl-time"><b>{s.start}</b><span>{s.end}</span></div>
      <div className="tl-body">
        <button className="row-main" onClick={() => db.openForm("session", s)}>
          <p className={`row-title truncate ${s.cancelled ? "line-through" : ""}`}>{m?.name || "Ohne Modul"}</p>
          <p className="row-meta truncate">{s.type}{s.room ? `, ${s.room}` : ""}{s.cancelled ? ", fällt aus" : state === "live" ? ", läuft gerade" : ""}</p>
        </button>
        {!s.cancelled && <div className="mt-2"><SessionTri s={s} db={db} compact color={m?.color} /></div>}
        {!s.cancelled && <PlaceLinks room={s.room} live={m?.liveUrl} className="mt-1.5" />}
      </div>
    </li>
  );
}

/* Ein Lernblock im Tagesplan */
function TimelineBlock({ b, db }) {
  const m = db.mod(b.moduleId), now = nowHM();
  const state = b.start <= now && now < b.end ? "live" : b.end <= now ? "past" : "next";
  const mins = Math.max(5, (Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3))) - (Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3))));
  return (
    <li className={`tl-row tl-block tl-${state} ${b.done ? "row-muted" : ""}`} style={{ "--mod": m?.color || "var(--accent)" }}>
      <div className="tl-time"><b>{b.start}</b><span>{b.end}</span></div>
      <div className="tl-body">
        <button className="row-main" onClick={() => db.openForm("block", b)}>
          <p className={`row-title truncate ${b.done ? "line-through" : ""}`}>{b.title}</p>
          <p className="row-meta truncate">Lernblock{m ? `, ${m.name}` : ""}{state === "live" && !b.done ? ", jetzt" : ""}</p>
        </button>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => db.patch("blocks", b.id, { done: !b.done })} aria-pressed={!!b.done}>{b.done ? "Erledigt ✓" : "Erledigt"}</button>
          {!b.done && <button className="btn btn-ghost" onClick={() => db.focus({ moduleId: b.moduleId || "", minutes: Math.min(90, mins), kind: b.kind, blockId: b.id })}>Timer starten</button>}
        </div>
      </div>
    </li>
  );
}

/* Eine Checkliste für alles Offene; ein Kreis pro Eintrag erledigt ihn */
function TodoList({ db, items }) {
  const [all, setAll] = useState(false);
  const t = iso();
  const shown = all ? items : items.slice(0, 6);
  const check = (x) => {
    if (x.kind === "homework") {
      const prev = x.item.status;
      db.setHwStatus(x.id, "abgegeben");
      db.toast(`„${x.item.title}“ abgegeben.`, { label: "Rückgängig", run: () => db.setHwStatus(x.id, prev) });
    } else if (x.kind === "review") {
      db.toggleSession(x.id, "reviewed");
      db.toast(`${db.mod(x.moduleId)?.name || "Termin"} nachbereitet.`, { label: "Rückgängig", run: () => db.toggleSession(x.id, "reviewed") });
    } else if (x.kind === "register") {
      db.patch("exams", x.id, { registered: true });
      db.toast("Als angemeldet markiert.", { label: "Rückgängig", run: () => db.patch("exams", x.id, { registered: false }) });
    }
  };
  return (
    <>
      <ul className="todo">
        {shown.map((x) => {
          const m = x.moduleId ? db.mod(x.moduleId) : null;
          const late = x.kind !== "cards" && x.due < t;
          let title, meta, open;
          if (x.kind === "homework") { title = x.item.title; meta = `Abgabe ${dueLabel(x.due, t)}${m ? `, ${m.name}` : ""}`; open = () => db.openForm("homework", x.item); }
          else if (x.kind === "review") { title = m?.name || "Termin"; meta = `Nachbereiten: ${x.item.type} vom ${fmtShort(x.item.date)}`; open = () => db.openForm("session", x.item); }
          else if (x.kind === "register") { title = `Zur Prüfung ${m?.name || ""} anmelden`; meta = `Anmeldeschluss ${dueLabel(x.due, t)}`; open = () => db.openForm("exam", x.item); }
          else { title = `${x.count} ${x.count === 1 ? "Karteikarte" : "Karteikarten"} wiederholen`; meta = "fällig"; open = () => db.goLearn("karten", ""); }
          return (
            <li key={x.kind + x.id} className="todo-row" style={{ "--mod": m?.color }}>
              {x.kind === "cards"
                ? <span className="todo-check todo-check-go" aria-hidden="true">›</span>
                : <button className="todo-check" onClick={() => check(x)} aria-label={`Erledigt: ${title}`} />}
              <button className="todo-body" onClick={open}>
                <span className="row-title block truncate">{title}</span>
                <span className={`row-meta block truncate ${late ? "todo-late" : ""}`}>{meta}</span>
              </button>
              {m && <span className="todo-dot" aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
      {items.length > 6 && <button className="link-btn mt-2" onClick={() => setAll(!all)}>{all ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}</button>}
    </>
  );
}

function Group({ title, count, action, children }) {
  return (
    <section>
      <div className="group-head">
        <h3 className="section-title">{title}{count !== undefined && <span className="count">{count}</span>}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* Die große Karte oben: färbt sich in der Modulfarbe des wichtigsten nächsten Eintrags */
function NextUp({ db, openReviews, cardsDue }) {
  const data = withoutArchived(db.data);
  const n = nextUp(data);
  if (n.type === "calm") {
    const hint = openReviews ? `${openReviews} ${openReviews === 1 ? "Termin wartet" : "Termine warten"} auf Nachbereitung.` : cardsDue ? `${cardsDue} Karteikarten sind fällig.` : "Gute Gelegenheit für eine Wiederholung oder eine Pause.";
    return (
      <section className="hero hero-calm" aria-label="Als Nächstes">
        <p className="hero-when">Als Nächstes</p>
        <p className="hero-title">Nichts Dringendes</p>
        <p className="hero-meta">{hint}</p>
        <div className="hero-actions">
          <button className="btn" onClick={() => db.goLearn("timer")}>Timer starten</button>
          {cardsDue > 0 && <button className="btn" onClick={() => db.goLearn("karten", "")}>Karten lernen</button>}
        </div>
      </section>
    );
  }
  const m = db.mod(n.moduleId), x = n.item;
  let title, meta, actions;
  if (n.type === "session") {
    title = m?.name || "Termin";
    meta = `${x.type}, ${x.start}–${x.end}${x.room ? `, ${x.room}` : ""}`;
    actions = (<>
      {n.live || isHeld(x) ? <button className="btn btn-solid" onClick={() => db.toggleSession(x.id, "reviewed")}>{x.reviewed ? "Nachbereitet ✓" : "Nachbereitet"}</button>
        : <button className="btn btn-solid" onClick={() => db.toggleSession(x.id, "prepared")}>{x.prepared ? "Vorbereitet ✓" : "Vorbereitet"}</button>}
      <button className="btn" onClick={() => db.openForm("note", { moduleId: x.moduleId, sessionId: x.id }, true)}>Notiz</button>
      <button className="btn" onClick={() => db.openForm("session", x)}>Details</button>
    </>);
  } else if (n.type === "exam") {
    title = m?.name || "Prüfung";
    meta = [x.room, x.notes].filter(Boolean).join(", ") || "Viel Erfolg!";
    actions = (<>
      <button className="btn btn-solid" onClick={() => db.goLearn("pruefungen")}>Lernplan</button>
      <button className="btn" onClick={() => db.openForm("log", { date: iso(), moduleId: x.moduleId }, true)}>Lernzeit eintragen</button>
    </>);
  } else {
    title = x.title;
    meta = m?.name || "";
    actions = (<>
      <button className="btn btn-solid" onClick={() => { const prev = x.status; db.setHwStatus(x.id, "abgegeben"); db.toast(`„${x.title}“ abgegeben.`, { label: "Rückgängig", run: () => db.setHwStatus(x.id, prev) }); }}>Abgegeben</button>
      <button className="btn" onClick={() => db.openForm("homework", x)}>Details</button>
    </>);
  }
  return (
    <section className="hero" style={{ "--mod": m?.color }} aria-label="Als Nächstes">
      <p className="hero-when">{n.when}</p>
      <p className="hero-title">{title}</p>
      <p className="hero-meta">{meta}</p>
      <div className="hero-actions">{actions}</div>
    </section>
  );
}
