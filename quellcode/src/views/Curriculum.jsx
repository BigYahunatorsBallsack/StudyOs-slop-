/* Dialog: Pflichtmodule aus einer Studienplan-Vorlage übernehmen */
import React, { useState } from "react";
import { CURRICULA, curriculumOf, previewSemester } from "../lib/curriculum.js";
import { Modal } from "../ui/primitives.jsx";

export function CurriculumDialog({ db, onClose }) {
  const { data } = db;
  const plan = curriculumOf(data) || CURRICULA[0];
  const pick = (id) => db.patchSettings({ curriculum: id, ...(data.settings.program ? {} : { program: CURRICULA.find((c) => c.id === id)?.program || "" }) });
  const [current, setCurrent] = useState(() => Math.max(1, ...data.modules.filter((m) => m.status === "belegt").map((m) => Number(m.semester) || 1)));
  return (
    <Modal title="Studienplan übernehmen" onClose={onClose}>
      <label className="block text-xs text-slate-400">Studiengang
        <select className="field mt-1 w-full text-sm" value={plan.id} onChange={(e) => pick(e.target.value)}>
          {CURRICULA.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <p className="mt-2 text-sm text-slate-400">Module, die du schon hast (z. B. aus dem Stundenplan-Abo), werden nur um Modulnummer und ECTS ergänzt.</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Ich bin gerade im
        <select className="field text-sm" value={current} onChange={(e) => setCurrent(Number(e.target.value))} aria-label="Aktuelles Semester">
          {plan.semesters.map((_, i) => <option key={i} value={i + 1}>{i + 1}.</option>)}
        </select>
        Semester
      </label>
      <div className="mt-3 space-y-3">
        {plan.semesters.map((_, i) => {
          const sem = i + 1, rows = previewSemester(data, plan, sem), fresh = rows.filter((r) => !r.existing).length;
          return (
            <section key={sem} className="surface" aria-label={`Semester ${sem}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="section-title">{sem}. Semester <span className="ml-1 text-xs font-normal text-slate-500">{rows.reduce((s, r) => s + r.ects, 0)} ECTS</span></h3>
                <button className="btn btn-ghost" disabled={!fresh && rows.every((r) => r.existing.code)} onClick={() => db.applyCurriculum(plan, sem, sem === current ? "belegt" : sem < current ? "bestanden" : "geplant")}>
                  {fresh ? `${fresh} anlegen` : "Ergänzen"}
                </button>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {rows.map((r) => (
                  <li key={r.code} className={`flex gap-2 ${r.existing ? "text-slate-500" : ""}`}>
                    <span className="font-num w-20 shrink-0 text-xs text-slate-500">{r.code}</span>
                    <span className="min-w-0 flex-1">{r.name}{r.gop && <span className="tag-gop">GOP</span>}{r.existing && " ✓"}</span>
                    <span className="font-num shrink-0 text-xs text-slate-400">{r.ects}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">{plan.note} <a className="link-inline" href={plan.source} target="_blank" rel="noreferrer">Offizieller Studienplan</a></p>
    </Modal>
  );
}
