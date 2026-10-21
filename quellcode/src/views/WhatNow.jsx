/* Dialog „Was jetzt?“: Zeit wählen, Vorschlag annehmen, Timer läuft */
import React, { useState } from "react";
import { whatNow } from "../lib/now.js";
import { Modal } from "../ui/primitives.jsx";

const TIMES = [15, 30, 60, 90];

export function WhatNowDialog({ db, onClose }) {
  const [mins, setMins] = useState(() => { try { return Number(localStorage.getItem("studyos-whatnow")) || 30; } catch { return 30; } });
  const pick = (n) => { setMins(n); try { localStorage.setItem("studyos-whatnow", String(n)); } catch { /* egal */ } };
  const list = whatNow(db.data, mins).slice(0, 3);
  const go = (x) => {
    onClose();
    if (x.action === "cards") db.goLearn("karten", "");
    else db.focus({ moduleId: x.moduleId, minutes: x.minutes, kind: x.kind, topicId: x.topicId || "" });
  };
  return (
    <Modal title="Was jetzt?" onClose={onClose}>
      <p className="text-sm text-slate-400">Wie viel Zeit hast du?</p>
      <div className="seg mt-2" role="radiogroup" aria-label="Verfügbare Zeit">
        {TIMES.map((n) => <button key={n} role="radio" aria-checked={mins === n} className="seg-item" onClick={() => pick(n)}>{n} min</button>)}
      </div>
      {!list.length ? <p className="mt-4 text-sm text-slate-300">Gerade ist nichts offen. Gönn dir eine Pause, oder lies schon mal in die nächste Vorlesung rein.</p> : (
        <>
          <section className="hero mt-4" aria-label="Vorschlag" style={{ "--mod": db.mod(list[0].moduleId)?.color }}>
            <p className="hero-when">{list[0].why}{list[0].module ? ` · ${list[0].module}` : ""}</p>
            <p className="hero-title">{list[0].title}</p>
            <div className="hero-actions"><button className="btn btn-solid" onClick={() => go(list[0])}>{list[0].action === "cards" ? "Karten lernen" : `${list[0].minutes} Minuten starten`}</button></div>
          </section>
          {list.length > 1 && <p className="mt-4 text-xs font-semibold text-slate-400">Oder</p>}
          <ul className="rows mt-2">
            {list.slice(1).map((x) => (
              <li key={x.id} className="row" style={{ "--mod": db.mod(x.moduleId)?.color }}>
                <button className="row-main flex items-center gap-3" onClick={() => go(x)}>
                  <span className="min-w-0 flex-1"><span className="row-title block truncate">{x.title}</span><span className="row-meta block truncate">{x.why}{x.module ? ` · ${x.module}` : ""}</span></span>
                  <span className="shrink-0 text-xs text-slate-400">{x.action === "cards" ? "Karten" : `${x.minutes} min`}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
