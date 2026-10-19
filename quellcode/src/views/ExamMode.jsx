/* Probeklausur: Karten eines Moduls unter Zeitdruck, ohne Lernstand zu ändern; danach Auswertung nach Themen */
import React, { useEffect, useMemo, useState } from "react";
import { evaluate, gradeOf, pickCards } from "../lib/mock.js";
import { hasCloze, renderCloze } from "../lib/cards.js";
import { iso } from "../lib/util.js";
import { Bar, Modal } from "../ui/primitives.jsx";
import { Markdown } from "../ui/markdown.jsx";

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function ExamMode({ db, moduleId, onClose }) {
  const all = db.data.cards.filter((c) => c.moduleId === moduleId);
  const m = db.mod(moduleId);
  const [setup, setSetup] = useState({ n: Math.min(20, all.length), minutes: 30 });
  const [run, setRun] = useState(null); /* { cards, endAt, i, revealed, answers } */
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!run || run.done) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [run]);
  const left = run ? Math.max(0, Math.ceil((run.endAt - now) / 1000)) : 0;
  useEffect(() => { if (run && !run.done && left === 0) setRun((r) => ({ ...r, done: true })); }, [left, run]);

  const start = () => setRun({ cards: pickCards(all, setup.n), endAt: Date.now() + setup.minutes * 60000, i: 0, revealed: false, answers: {}, done: false });
  const answer = (v) => setRun((r) => {
    const answers = { ...r.answers, [r.cards[r.i].id]: v };
    const i = r.i + 1;
    return { ...r, answers, i, revealed: false, done: i >= r.cards.length };
  });
  const topicName = (id) => db.data.topics.find((t) => t.id === id)?.title || "";
  const result = useMemo(() => (run?.done ? evaluate(run.cards, Object.fromEntries(run.cards.map((c) => [c.id, run.answers[c.id] ?? 0])), topicName) : null), [run?.done]);
  const markWrong = () => {
    const ids = new Set(result.wrong.map((c) => c.id));
    db.withUndo(`${ids.size} Karten auf heute gesetzt.`, (d) => ({ ...d, cards: d.cards.map((c) => (ids.has(c.id) ? { ...c, due: iso() } : c)) }));
    onClose();
  };

  if (!all.length) return <Modal title="Probeklausur" onClose={onClose}><p className="text-sm text-slate-400">Für {m?.name || "dieses Modul"} gibt es noch keine Karteikarten.</p></Modal>;

  if (!run) return (
    <Modal title={`Probeklausur ${m?.name || ""}`} onClose={onClose}>
      <p className="text-sm text-slate-400">Zufällige Karten unter Zeitdruck. Du bewertest dich selbst; dein Lernstand bleibt unverändert.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-xs text-slate-400">Karten (von {all.length})
          <input type="number" min="1" max={all.length} className="field mt-1 w-full text-sm" value={setup.n} onChange={(e) => setSetup({ ...setup, n: Math.max(1, Math.min(all.length, Number(e.target.value) || 1)) })} />
        </label>
        <label className="block text-xs text-slate-400">Zeit (Minuten)
          <input type="number" min="1" max="240" className="field mt-1 w-full text-sm" value={setup.minutes} onChange={(e) => setSetup({ ...setup, minutes: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} />
        </label>
      </div>
      <button className="btn btn-primary mt-4" onClick={start}>Starten</button>
    </Modal>
  );

  if (run.done) return (
    <Modal title="Auswertung" onClose={onClose}>
      <div className="flex items-end gap-4">
        <p className="font-num text-4xl font-semibold">{Math.round(result.pct * 100)} %</p>
        <p className="pb-1 text-sm text-slate-400">{String(result.score).replace(".", ",")} von {result.total} · etwa Note {gradeOf(result.pct).toFixed(1).replace(".", ",")}{run.i < run.cards.length ? ` · ${run.cards.length - run.i} nicht geschafft` : ""}</p>
      </div>
      {result.groups.length > 1 && (
        <ul className="mt-4 space-y-2">
          {result.groups.map((g) => (
            <li key={g.label}>
              <div className="mb-1 flex justify-between text-sm"><span className="truncate">{g.label}</span><span className="font-num text-xs text-slate-400">{Math.round(g.pct * 100)} % ({g.total})</span></div>
              <Bar value={g.pct} color={g.pct >= 0.75 ? "var(--ok)" : g.pct >= 0.5 ? "var(--warn)" : "var(--danger)"} label={g.label} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {result.wrong.length > 0 && <button className="btn btn-primary" onClick={markWrong}>{result.wrong.length} unsichere Karten heute wiederholen</button>}
        <button className="btn btn-ghost" onClick={() => setRun(null)}>Noch eine Runde</button>
        <button className="btn btn-ghost" onClick={onClose}>Schließen</button>
      </div>
    </Modal>
  );

  const c = run.cards[run.i];
  return (
    <Modal title={`Probeklausur ${m?.name || ""}`} onClose={onClose}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-num">Karte {run.i + 1} von {run.cards.length}</span>
        <span className={`font-num text-sm font-semibold ${left < 60 ? "text-rose-300" : "text-slate-200"}`} role="timer" aria-label="Restzeit">{fmtClock(left)}</span>
      </div>
      <Bar value={run.i} max={run.cards.length} label="Fortschritt" className="mt-2" />
      <div className="surface mt-3 min-h-[140px]">
        <Markdown text={hasCloze(c.front) ? renderCloze(c.front, run.revealed) : c.front} />
        {run.revealed && c.back && <><hr className="my-3 border-slate-800" /><Markdown text={c.back} /></>}
      </div>
      {!run.revealed ? (
        <button className="btn btn-primary mt-3 w-full" onClick={() => setRun({ ...run, revealed: true })}>Lösung zeigen</button>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="btn btn-ghost" onClick={() => answer(0)}>Nicht gewusst</button>
          <button className="btn btn-ghost" onClick={() => answer(0.5)}>Teilweise</button>
          <button className="btn btn-ghost" onClick={() => answer(1)}>Gewusst</button>
        </div>
      )}
      <button className="link-btn mt-3" onClick={() => setRun({ ...run, done: true })}>Abgeben</button>
    </Modal>
  );
}
