/* Einrichtung beim ersten Start: Studiengang und Semester wählen, die Module kommen aus dem Studienplan */
import React, { useState } from "react";
import { CURRICULA, previewSemester } from "../lib/curriculum.js";
import { Select } from "./select.jsx";
import { btnGhost, btnPrimary } from "./styles.js";

export function Setup({ db, onManual }) {
  const { data } = db;
  const [name, setName] = useState(data.settings.name || "");
  const [planId, setPlanId] = useState(CURRICULA[0].id);
  const [sem, setSem] = useState(1);
  const [past, setPast] = useState(false);
  const plan = CURRICULA.find((c) => c.id === planId);
  const rows = previewSemester(data, plan, sem);
  const pastCount = past ? plan.semesters.slice(0, sem - 1).reduce((n, s) => n + s.length, 0) : 0;

  return (
    <section className="surface" aria-label="Einrichtung">
      <h3 className="section-title">In einer Minute eingerichtet</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor="su-name" className="mb-1 block text-xs text-slate-400">Dein Vorname (optional)</label>
          <input id="su-name" className="field w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </div>
        <div className="col-span-2">
          <label htmlFor="su-plan" className="mb-1 block text-xs text-slate-400">Studiengang</label>
          <Select id="su-plan" className="field w-full text-sm" value={planId} onChange={(e) => { setPlanId(e.target.value); setSem(1); }}>
            {CURRICULA.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="su-sem" className="mb-1 block text-xs text-slate-400">Aktuelles Semester</label>
          <Select id="su-sem" className="field w-full text-sm" value={sem} onChange={(e) => setSem(Number(e.target.value))}>
            {plan.semesters.map((_, i) => <option key={i} value={i + 1}>{i + 1}. Semester</option>)}
          </Select>
        </div>
        {sem > 1 && (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={past} onChange={(e) => setPast(e.target.checked)} />
            Frühere Semester als bestanden eintragen
          </label>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-400">Diese Module werden angelegt{past && pastCount ? ` (dazu ${pastCount} aus früheren Semestern)` : ""}:</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.map((r) => (
          <li key={r.code} className="flex gap-2">
            <span className="min-w-0 flex-1">{r.name}{r.gop && <span className="tag-gop">GOP</span>}</span>
            <span className="font-num shrink-0 text-xs text-slate-400">{r.ects} ECTS</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={() => db.setupStudy(plan, sem, past, name.trim())}>Module anlegen</button>
        <button className={btnGhost} onClick={onManual}>Anderer Studiengang</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Termine kommen danach am einfachsten über das TUMonline-Kalender-Abo (Mehr → Daten & Einstellungen).</p>
    </section>
  );
}
