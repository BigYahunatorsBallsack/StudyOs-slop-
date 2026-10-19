import React, { useState, useEffect, useRef } from "react";
import { allTags, cardsToCsv, hasCloze, parseCardsCsv, parseTags, renderCloze, schedule } from "../lib/cards.js";
import { WD_LONG } from "../lib/constants.js";
import { moduleStats } from "../lib/data.js";
import { modOpts } from "../lib/forms.js";
import { buildPlan } from "../lib/plan.js";
import { byOrder, diffDays, fmt, fmtH, fmtMin, fmtShort, iso, saveFile, sum, uid, wdIdx } from "../lib/util.js";
import { Bar, Card, Dot, Empty, Stat, Tabs } from "../ui/primitives.jsx";
import { CardList, LogRow } from "../ui/rows.jsx";
import { btnGhost, btnPrimary, focusRing, inputCls, inputFlex } from "../ui/styles.js";
import { useRemaining } from "../ui/timer.jsx";
import { ShareDeck } from "./Share.jsx";
import { PlaceLinks } from "../ui/links.jsx";
import { ExamMode } from "./ExamMode.jsx";
import { Markdown } from "../ui/markdown.jsx";
import { weakByTag, weakCards } from "../lib/progress.js";
import { Select } from "../ui/select.jsx";
import { AMBIENT_KINDS, ambientOf, ambientVolumeOf } from "../lib/ambient.js";
import { ringBlocks } from "../lib/timer.js";
import { isOcc, occLabel } from "../lib/occlusion.js";
import { OcclusionImage } from "../ui/Occlusion.jsx";
import { workload } from "../lib/study.js";

/* ---------------- Lernen ---------------- */
export function Learn({ db, sub, setSub, timer, cardFilter, setCardFilter }) {
  return (
    <div className="space-y-4">
      <h2 className="page-title mb-1">Lernen</h2>
      <Tabs items={[["timer", "Timer"], ["einheiten", "Lerneinheiten"], ["karten", "Karteikarten"], ["pruefungen", "Prüfungen & Lernplan"]]} value={sub} onChange={setSub} label="Lernbereiche" />
      {sub === "timer" && <TimerView db={db} timer={timer} />}
      {sub === "einheiten" && <LogsView db={db} />}
      {sub === "karten" && <CardsView db={db} filter={cardFilter} setFilter={setCardFilter} />}
      {sub === "pruefungen" && <ExamsView db={db} />}
    </div>
  );
}

export function TimerView({ db, timer: timerIn }) {
  const timer = { ...timerIn, remaining: useRemaining(timerIn) };
  const { data } = db;
  const toggleRef = useRef(null);
  toggleRef.current = () => (timerIn.running ? timerIn.pause() : timerIn.start());
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]') || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
      e.preventDefault(); toggleRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const total = (timer.mode === "focus" ? timer.length : timer.brk) * 60;
  const mm = String(Math.floor(timer.remaining / 60)).padStart(2, "0"), ss = String(timer.remaining % 60).padStart(2, "0");
  const topics = data.topics.filter((x) => x.moduleId === timer.moduleId).sort(byOrder);
  const prog = total ? (total - timer.remaining) / total : 0;
  const m = db.mod(timer.moduleId);
  const ambient = ambientOf(data.settings);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col items-center gap-4">
          <Tabs items={[["focus", "Fokus"], ["break", "Pause"]]} value={timer.mode} onChange={timer.setMode} label="Timer-Modus" />
          <div className="relative">
            <PixelRing prog={prog} color={timer.mode === "focus" ? m?.color || "var(--accent-2)" : "var(--ok)"} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span role="timer" aria-label={`${mm} Minuten ${ss} Sekunden verbleibend`} className="font-num text-5xl font-semibold">{mm}:{ss}</span>
              <span className="text-xs text-slate-400">{timer.mode === "focus" ? "Fokus" : "Pause"}</span>
            </div>
          </div>
          {/* Pixel-Begleiter (nur Retro): tippt während der Fokusphase, schläft in der Pause */}
          <span className="px-buddy" data-state={timerIn.running ? "run" : "idle"} data-mode={timer.mode} aria-hidden="true" />
          <div className="grid w-full max-w-sm grid-cols-2 gap-2">
            <div className="col-span-2">
              <label htmlFor="tm-mod" className="mb-1 block text-xs text-slate-400">Modul</label>
              <Select id="tm-mod" className={inputCls} value={timer.moduleId} onChange={(e) => timer.set({ moduleId: e.target.value, topicId: "" })}>
                {modOpts(data, true).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <WorkloadHint w={timer.moduleId ? workload(data, timer.moduleId) : null} />
            </div>
            <div>
              <label htmlFor="tm-top" className="mb-1 block text-xs text-slate-400">Thema</label>
              <Select id="tm-top" className={inputCls} value={timer.topicId} onChange={(e) => timer.set({ topicId: e.target.value })} disabled={!topics.length}>
                <option value="">– kein Thema –</option>
                {topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="tm-len" className="mb-1 block text-xs text-slate-400">Fokusdauer</label>
              <Select id="tm-len" className={inputCls} value={timer.length} onChange={(e) => timer.setLength(Number(e.target.value))} disabled={timer.running}>
                {[15, 25, 45, 50, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
              </Select>
            </div>
          </div>
          <div className="grid w-full max-w-sm grid-cols-2 gap-2">
            <div className="col-span-2">
              <span id="tm-amb" className="mb-1 block text-xs text-slate-400">Musik in der Fokusphase</span>
              <Tabs items={AMBIENT_KINDS} value={ambient} onChange={(v) => db.patchSettings({ ambient: v })} label="Musik in der Fokusphase" />
            </div>
            {ambient !== "off" && (
              <div className="col-span-2">
                <label htmlFor="tm-vol" className="mb-1 block text-xs text-slate-400">Lautstärke</label>
                <input id="tm-vol" type="range" min="0" max="1" step="0.05" className="w-full accent-sky-500" value={ambientVolumeOf(data.settings)} onChange={(e) => db.patchSettings({ ambientVolume: Number(e.target.value) })} />
              </div>
            )}
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={data.settings.sound !== false} onChange={(e) => db.patchSettings({ sound: e.target.checked })} />
              Signalton und Vibration am Ende einer Phase
            </label>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button className={btnPrimary} onClick={timer.running ? timer.pause : timer.start}>{timer.running ? "Pausieren" : timer.remaining === total ? "Starten" : "Fortsetzen"}</button>
            <button className={btnGhost} onClick={timer.reset}>Zurücksetzen</button>
            {timer.mode === "focus" && timer.remaining < total && <button className={btnGhost} onClick={timer.stopAndLog}>Beenden & eintragen</button>}
          </div>
          <p className="max-w-sm text-center text-xs text-slate-500">Nach einer Fokusphase wird die Lerneinheit mit Modul, Thema und Dauer gleich eingetragen; dazu kannst du in einer Zeile notieren, was du gemacht hast. Der Timer läuft weiter, wenn du den Bereich wechselst.</p>
        </div>
      </Card>
    </div>
  );
}

/* Unter der Modulwahl: Wie steht das Modul gegenüber dem ECTS-Soll? */
function WorkloadHint({ w }) {
  if (!w) return null;
  const color = w.state === "ok" ? "var(--ok)" : w.state === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
      <span className="h-2 w-2 shrink-0" style={{ background: color }} aria-hidden="true" />
      {w.gapH > 0.05 ? `${fmtH(w.gapH)} hinter dem ECTS-Soll (${fmtH(w.istH)} von ${fmtH(w.sollH)})` : `Im ECTS-Soll: ${fmtH(w.istH)} von ${fmtH(w.sollH)}`}
    </p>
  );
}

/* Karten, die oft vergessen werden, und die Themen (Tags) dahinter; „Üben“ fragt sie unabhängig von der Fälligkeit ab */
function WeakSpots({ db, cards, onPractice }) {
  const [all, setAll] = useState(false);
  const groups = weakByTag(cards, (c) => parseTags(c.tags)).filter((g) => g.tag).slice(0, 5);
  const shown = all ? cards : cards.slice(0, 5);
  const plain = (s) => String(s || "").replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, "$1").replace(/[#*_`>$]/g, "").trim();
  return (
    <Card title="Schwachstellen">
      <p className="text-sm text-slate-300">{cards.length} {cards.length === 1 ? "Karte vergisst" : "Karten vergisst"} du oft oder findest sie schwer.{groups.length ? " Am häufigsten: " : ""}{groups.map((g, i) => <React.Fragment key={g.tag}>{i ? ", " : ""}<b>#{g.tag}</b> ({g.count})</React.Fragment>)}{groups.length ? "." : ""}</p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((c) => { const m = db.mod(c.moduleId); return (
          <li key={c.id}>
            <button className={`flex w-full items-center gap-2 rounded-md text-left text-sm ${focusRing}`} onClick={() => db.openForm("card", c)}>
              <Dot color={m?.color} />
              <span className="min-w-0 flex-1 truncate">{isOcc(c) ? occLabel(c) : plain(c.front) || "Ohne Vorderseite"}</span>
              <span className="font-num shrink-0 text-xs text-slate-400">{c.lapses ? `${c.lapses}× vergessen` : "schwer"}</span>
            </button>
          </li>
        ); })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btnPrimary} onClick={onPractice}>Schwachstellen üben ({cards.length})</button>
        {cards.length > 5 && <button className="link-btn" onClick={() => setAll(!all)}>{all ? "Weniger anzeigen" : `Alle ${cards.length} anzeigen`}</button>}
      </div>
    </Card>
  );
}

/* Fortschritt als Ring aus Pixel-Blöcken: jeder Block steht für einen gleich langen Teil der Phase, der jüngste blinkt kurz auf */
function PixelRing({ prog, color }) {
  const blocks = ringBlocks(40, 84, 100);
  const filled = Math.min(blocks.length, Math.floor(prog * blocks.length + 1e-9));
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" shapeRendering="crispEdges" aria-hidden="true" className="px-ring">
      {blocks.map((b, i) => <rect key={i} x={b.x - 5} y={b.y - 5} width="10" height="10" style={{ fill: i < filled ? color : "var(--hm0)" }} className={i === filled - 1 ? "px-ring-new" : undefined} />)}
    </svg>
  );
}

export function LogsView({ db }) {
  const { data } = db;
  const [mod, setMod] = useState("all");
  const logs = data.logs.filter((l) => mod === "all" || l.moduleId === mod).sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="lg-f" className="sr-only">Modul filtern</label>
        <Select id="lg-f" className={`${inputFlex}`} value={mod} onChange={(e) => setMod(e.target.value)}>
          <option value="all">Alle Module</option>
          {modOpts(data, true).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <button className={btnPrimary} onClick={() => db.openForm("log", { date: iso(), moduleId: mod === "all" ? "" : mod }, true)}>+ Lerneinheit</button>
      </div>
      <p className="text-sm text-slate-300">Summe: <span className="font-num">{fmtMin(sum(logs, (l) => l.minutes))}</span> in {logs.length} Einheiten</p>
      {logs.length ? <ul className="rows">{logs.map((l) => <LogRow key={l.id} l={l} db={db} />)}</ul> : <Empty>Noch keine Lerneinheiten. Trage sie manuell ein oder nutze den Timer.</Empty>}
    </div>
  );
}

export function CardsView({ db, filter, setFilter }) {
  const { data } = db, t = iso();
  const [queue, setQueue] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [tag, setTag] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const byModule = data.cards.filter((c) => !filter || c.moduleId === filter);
  const tags = allTags(byModule);
  const pool = byModule.filter((c) => !tag || parseTags(c.tags).includes(tag));
  const textCards = pool.filter((c) => !isOcc(c)); /* Bild-Karten gehen nicht in CSV und geteilte Links */
  const importCsv = (file) => {
    if (!file || !filter) return;
    const r = new FileReader();
    r.onload = () => {
      const { cards, skipped } = parseCardsCsv(String(r.result));
      if (!cards.length) { setCsvMsg("Keine Karten erkannt. Erwartet: Vorderseite; Rückseite; Tags (optional)."); return; }
      const today = iso();
      const fresh = cards.map((c) => ({ ...c, id: uid(), moduleId: filter, topicId: "", created: today, ease: 2.5, interval: 0, reps: 0, due: today }));
      db.withUndo(`${fresh.length} Karten importiert.`, (d) => ({ ...d, cards: [...d.cards, ...fresh] }));
      setCsvMsg(`${fresh.length} Karten importiert${skipped.length ? `, ${skipped.length} Zeilen übersprungen (Zeile ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? " …" : ""})` : ""}.`);
    };
    r.readAsText(file);
  };
  const exportCsv = async () => {
    const name = db.mod(filter)?.name || "alle";
    const res = await saveFile(`studyos-karten-${name.replace(/[^\wäöüÄÖÜß-]+/g, "-")}.csv`, cardsToCsv(textCards, (id) => db.mod(id)?.name || ""), "text/csv;charset=utf-8");
    if (res !== "aborted") setCsvMsg(`${textCards.length} Karten exportiert.`);
  };
  const due = pool.filter((c) => c.due <= t);
  const q = queue ? queue.filter((id) => data.cards.some((c) => c.id === id)) : null;
  const current = q && q.length ? data.cards.find((c) => c.id === q[0]) : null;

  const weak = weakCards(pool);
  const practice = () => { setQueue(weak.map((c) => c.id)); setRevealed(false); setDone(0); };
  const start = () => { const ids = due.map((c) => c.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } setQueue(ids); setRevealed(false); setDone(0); };
  const rate = (r) => {
    if (!current) return;
    db.patch("cards", current.id, (c) => schedule(c, r));
    setQueue((qq) => { const rest = qq.filter((id) => id !== current.id); return r === 0 ? [...rest, current.id] : rest; });
    if (r !== 0) setDone((n) => n + 1);
    setRevealed(false);
  };
  const rateRef = useRef(rate); rateRef.current = rate;
  useEffect(() => {
    if (!current) return;
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === " " || e.key === "Enter") { if (e.target.tagName !== "BUTTON") { e.preventDefault(); setRevealed(true); } }
      else if (revealed && ["1", "2", "3", "4"].includes(e.key)) rateRef.current(Number(e.key) - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, revealed]);

  const m = current ? db.mod(current.moduleId) : null;
  const preview = (r) => { if (!current) return ""; const n = schedule(current, r).interval; return n === 0 ? "heute" : n === 1 ? "1 Tag" : `${n} Tage`; };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cf" className="sr-only">Modul filtern</label>
        <Select id="cf" className={`${inputFlex}`} value={filter} onChange={(e) => { setFilter(e.target.value); setTag(""); setQueue(null); }}>
          <option value="">Alle Module</option>
          {data.modules.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        {tags.length > 0 && (
          <>
            <label htmlFor="ct" className="sr-only">Tag filtern</label>
            <Select id="ct" className={`${inputFlex}`} value={tag} onChange={(e) => { setTag(e.target.value); setQueue(null); }}>
              <option value="">Alle Tags</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </Select>
          </>
        )}
        <div className="card-add">
          <button className={btnGhost} onClick={() => db.openForm("card", { moduleId: filter }, true)}>+ Karte</button>
          <button className={btnGhost} onClick={() => db.openForm("card", { moduleId: filter, occ: {} }, true)}>+ Bild-Karte</button>
        </div>
      </div>

      {current ? (
        <Card>
          <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-2"><Dot color={m?.color} />{m?.name}</span>
            <span className="font-num">{done} gelernt · {q.length} übrig</span>
          </div>
          <div className="min-h-[140px] rounded-xl bg-slate-950 p-4">
            {isOcc(current) ? <><p className="mb-2 text-sm font-semibold">{current.front}</p><OcclusionImage db={db} card={current} revealed={revealed} /></>
              : <Markdown text={hasCloze(current.front) ? renderCloze(current.front, revealed) : current.front} />}
            {revealed && current.back && <><hr className="my-3 border-slate-800" /><div className="text-sky-100"><Markdown text={current.back} /></div></>}
          </div>
          {!revealed ? (
            <button className={`${btnPrimary} mt-3 w-full`} onClick={() => setRevealed(true)}>Antwort zeigen <span className="font-normal opacity-70">(Leertaste)</span></button>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[["Nochmal", "border-rose-500/50 text-rose-200"], ["Schwer", "border-amber-500/50 text-amber-200"], ["Gut", "border-sky-500/50 text-sky-200"], ["Leicht", "border-emerald-500/50 text-emerald-200"]].map(([l, c], i) => (
                <button key={l} onClick={() => rate(i)} className={`rounded-lg border px-2 py-2 text-xs font-medium hover:bg-slate-800 ${c} ${focusRing}`}>
                  {l}<span className="block text-[10px] font-normal opacity-70">{preview(i)} · {i + 1}</span>
                </button>
              ))}
            </div>
          )}
          <button className={`${btnGhost} mt-3`} onClick={() => setQueue(null)}>Sitzung beenden</button>
        </Card>
      ) : (
        <Card>
          {q && done > 0 && <p className="mb-2 text-sm text-emerald-300">Sitzung abgeschlossen: {done} Karten gelernt.</p>}
          <p className="text-sm text-slate-300"><span className="font-num text-2xl font-semibold text-slate-100">{due.length}</span> Karten fällig · {pool.length} gesamt</p>
          <button className={`${btnPrimary} mt-3`} disabled={!due.length} onClick={start}>Lernen starten</button>
          {!pool.length && <p className="mt-2 text-xs text-slate-500">Lege Karten im Modul unter „Karten“ oder hier über „+ Karte“ an.</p>}
        </Card>
      )}
      {!current && weak.length > 0 && <WeakSpots db={db} cards={weak} onPractice={practice} />}
      {!current && (
        <Card title="CSV-Import und -Export">
          <p className="text-xs text-slate-400">Spalten: Vorderseite; Rückseite; Tags. Trennzeichen Semikolon, Komma oder Tab. Aus Anki: „Notizen als Klartext“ exportieren.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className={`${btnGhost} ${filter ? "cursor-pointer" : "pointer-events-none opacity-40"}`} aria-disabled={!filter}>CSV importieren<input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr-only" disabled={!filter} onChange={(e) => { importCsv(e.target.files[0]); e.target.value = ""; }} /></label>
            <button className={btnGhost} disabled={!textCards.length} onClick={exportCsv}>CSV exportieren ({textCards.length})</button>
          </div>
          {!filter && <p className="mt-2 text-[11px] text-slate-500">Zum Importieren oben ein Modul wählen.</p>}
          {csvMsg && <p role="status" className="mt-2 text-xs text-emerald-300">{csvMsg}</p>}
        </Card>
      )}
      {!current && filter && textCards.length > 0 && db.cloud?.available && <ShareDeck db={db} moduleId={filter} cards={textCards} tag={tag} />}
      {!current && <CardList cards={pool} db={db} />}
    </div>
  );
}

export function ExamsView({ db }) {
  const { data } = db, t = iso();
  const [open, setOpen] = useState(null);
  const [mock, setMock] = useState(null);
  const upcoming = data.exams.filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = data.exams.filter((e) => e.date < t).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      {mock && <ExamMode db={db} moduleId={mock} onClose={() => setMock(null)} />}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Der Lernplan verteilt offene Themen (schwächste zuerst) auf die Tage bis zur Prüfung.</p>
        <button className={btnPrimary} onClick={() => db.openForm("exam", null, true)}>+ Prüfung</button>
      </div>
      {!upcoming.length && <Empty>Keine anstehenden Prüfungen eingetragen.</Empty>}
      {upcoming.map((e) => {
        const m = db.mod(e.moduleId), n = diffDays(t, e.date), s = moduleStats(data, e.moduleId);
        const plan = open === e.id ? buildPlan(data, e) : null;
        const todayMin = sum(data.logs.filter((l) => l.moduleId === e.moduleId && l.date === t), (l) => l.minutes);
        return (
          <Card key={e.id}>
            <div className="flex items-start gap-3">
              <Dot color={m?.color} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{m?.name}</p>
                <p className="text-xs text-slate-400">{[`${WD_LONG[wdIdx(e.date)]}, ${fmt(e.date)}`, e.time, e.room].filter(Boolean).join(" · ")}</p>
                <PlaceLinks room={e.room} className="mt-0.5" />
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  {Number(e.attempt) > 1 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">{e.attempt}. Versuch</span>}
                  {e.registered ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">angemeldet</span>
                    : e.registerBy ? <span className={`rounded-full px-2 py-0.5 ${e.registerBy < t ? "bg-rose-500/20 text-rose-200" : diffDays(t, e.registerBy) <= 7 ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-300"}`}>{e.registerBy < t ? "Anmeldeschluss verpasst" : `Anmeldung bis ${fmtShort(e.registerBy)}`}</span>
                    : <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">Anmeldung offen</span>}
                </div>
              </div>
              <div className="text-right">
                <p className={`font-num text-2xl font-semibold ${n <= 7 ? "text-rose-300" : ""}`}>{n}</p>
                <p className="text-[11px] text-slate-500">{n === 1 ? "Tag" : "Tage"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Themen sicher" value={`${data.topics.filter((x) => x.moduleId === e.moduleId && x.state === "sicher").length}/${s.topicsTotal}`} />
              <Stat label="Lernzeit" value={fmtMin(s.minutes)} />
              <Stat label="Heute" value={fmtMin(todayMin)} sub={e.dailyMinutes ? `Ziel ${fmtMin(e.dailyMinutes)}` : ""} />
            </div>
            {e.dailyMinutes > 0 && <Bar value={todayMin} max={e.dailyMinutes} color={m?.color} className="mt-2" label="Tagesziel" />}
            {e.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{e.notes}</p>}
            <OldExams exam={e} db={db} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>{open === e.id ? "Lernplan ausblenden" : "Lernplan anzeigen"}</button>
              <button className={btnGhost} onClick={() => db.openForm("exam", e)}>Bearbeiten</button>
              {!e.registered && <button className={btnGhost} onClick={() => db.patch("exams", e.id, { registered: true })}>Als angemeldet markieren</button>}
              <button className={btnGhost} onClick={() => db.goModule(e.moduleId)}>Zum Modul</button>
              {data.cards.some((c) => c.moduleId === e.moduleId) && <button className={btnGhost} onClick={() => setMock(e.moduleId)}>Probeklausur</button>}
            </div>
            {open === e.id && n === 0 && <p className="mt-3 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-100">Die Prüfung ist heute. Viel Erfolg!</p>}
            {plan && (
              <ol className="mt-3 space-y-1.5">
                {!s.topicsTotal && <li className="text-xs text-amber-300">Tipp: Lege Themen im Modul an, damit der Plan konkrete Kapitel verteilt.</li>}
                {plan.map((d) => (
                  <li key={d.date} className={`rounded-lg px-3 py-2 text-sm ${d.date === t ? "bg-sky-500/10 ring-1 ring-sky-500/40" : d.final ? "bg-rose-500/10" : d.free ? "bg-slate-900/40 text-slate-500" : "bg-slate-800/40"}`}>
                    <div className="flex justify-between gap-2"><span className="font-num text-xs text-slate-400">{fmtShort(d.date)}{d.date === t ? " · heute" : ""}</span>{e.dailyMinutes && !d.free && !d.topics.some((x) => x.minutes) ? <span className="font-num text-xs text-slate-500">{fmtMin(e.dailyMinutes)}</span> : null}</div>
                    {d.topics.length ? d.topics.map((x) => <p key={x.id} className="flex justify-between gap-2"><span>{x.title} <span className="text-xs text-slate-500">({x.state})</span></span>{x.minutes ? <span className="font-num shrink-0 text-xs text-slate-400">{fmtMin(x.minutes)}</span> : null}</p>) : d.note ? <p className={d.free ? "" : "text-slate-300"}>{d.note}</p> : null}
                    {d.oldExam && <p className="font-semibold text-slate-200">Altklausur rechnen: {d.oldExam.title}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        );
      })}
      {past.length > 0 && (
        <Card title="Vergangene Prüfungen">
          <ul className="rows">
            {past.map((e) => { const m = db.mod(e.moduleId); return (
              <li key={e.id} className="flex items-center gap-3 text-sm"><Dot color={m?.color} /><span className="min-w-0 flex-1 truncate">{m?.name} · {fmt(e.date)}</span>
                {e.result === "nicht bestanden" ? <button className={btnGhost} onClick={() => db.openForm("exam", e)}>{e.retakeDate ? `Wiederholung ${fmtShort(e.retakeDate)}` : "Wiederholung planen"}</button>
                  : e.result === "offen" || !e.result ? <button className={btnGhost} onClick={() => db.openForm("exam", e)}>Ergebnis eintragen</button> : null}
                {m && <button className={btnGhost} onClick={() => db.openForm("module", m)}>{m.grade ? `Note ${String(m.grade).replace(".", ",")}` : "Note eintragen"}</button>}</li>
            ); })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* Altklausuren einer Prüfung: Status und Punkte */
const OLD_STATES = [["offen", "Offen"], ["gerechnet", "Gerechnet"], ["korrigiert", "Korrigiert"]];
function OldExams({ exam, db }) {
  const list = exam.oldExams || [];
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const save = (next) => db.patch("exams", exam.id, { oldExams: next });
  const upd = (id, p) => save(list.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const done = list.filter((o) => o.status !== "offen").length;
  const scored = list.filter((o) => Number(o.maxPoints) > 0 && o.points !== "" && o.points !== null && o.points !== undefined);
  const avg = scored.length ? scored.reduce((s, o) => s + Number(o.points) / Number(o.maxPoints), 0) / scored.length : null;
  return (
    <div className="mt-3">
      <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        Altklausuren {list.length ? `(${done} von ${list.length} gerechnet${avg !== null ? `, ⌀ ${Math.round(avg * 100)} %` : ""})` : "eintragen"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {list.map((o) => (
            <div key={o.id} className="row">
              <div className="flex items-center justify-between gap-2">
                <p className="row-title min-w-0 truncate">{o.title}</p>
                <button className="btn btn-icon btn-ghost shrink-0" aria-label={`${o.title} entfernen`} onClick={() => save(list.filter((x) => x.id !== o.id))}><span aria-hidden="true" className="block h-4 w-4 text-center leading-4">✕</span></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="tri" role="radiogroup" aria-label={`Status ${o.title}`}>
                  {OLD_STATES.map(([k, l]) => <button key={k} role="radio" aria-checked={(o.status || "offen") === k} aria-pressed={(o.status || "offen") === k} className="tri-btn" onClick={() => upd(o.id, { status: k })}>{l}</button>)}
                </div>
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input className="field w-16 py-1 text-sm" inputMode="decimal" aria-label={`Punkte ${o.title}`} value={o.points ?? ""} onChange={(ev) => upd(o.id, { points: ev.target.value.replace(",", ".") })} />
                  von
                  <input className="field w-16 py-1 text-sm" inputMode="decimal" aria-label={`Maximalpunkte ${o.title}`} value={o.maxPoints ?? ""} onChange={(ev) => upd(o.id, { maxPoints: ev.target.value.replace(",", ".") })} />
                </label>
              </div>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (!title.trim()) return; save([...list, { id: uid(), title: title.trim(), status: "offen", points: "", maxPoints: "" }]); setTitle(""); }}>
            <input className="field min-w-0 flex-1 text-sm" aria-label="Neue Altklausur" placeholder="z. B. WS 2024/25 Endterm" value={title} onChange={(ev) => setTitle(ev.target.value)} />
            <button type="submit" className="btn btn-ghost" disabled={!title.trim()}>Hinzufügen</button>
          </form>
          <p className="text-[11px] text-slate-500">Offene Altklausuren verteilt der Lernplan auf die letzten Tage vor der Prüfung.</p>
        </div>
      )}
    </div>
  );
}
