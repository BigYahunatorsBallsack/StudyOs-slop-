/* Semesterleiste über der Monatsansicht: jede Woche des laufenden Semesters als Kästchen.
   Groß die Vorlesungswoche (in Ferien leer), klein die Kalenderwoche; Prüfungen, Abgaben, Uni-Fristen und Feiertage als Marken.
   Antippen öffnet die Woche im Raster. */
import React from "react";
import { BUSY_HW, semesterSpan, semesterWeeks } from "../lib/semester.js";
import { withoutArchived } from "../lib/study.js";
import { fmt, iso } from "../lib/util.js";

export function SemesterBar({ data, onPick, today = iso() }) {
  const d = withoutArchived(data), span = semesterSpan(d, today);
  const weeks = semesterWeeks(d, span, today);
  if (!weeks.length) return null;
  const cur = weeks.find((w) => w.current);
  return (
    <section className="sembar" aria-label={`Semesterleiste ${span.label}`}>
      <p className="sembar-head">
        <b>{span.label}</b>
        <span>{cur?.week ? `VL-Woche ${cur.week}` : cur ? "vorlesungsfrei" : `${fmt(span.from)} bis ${fmt(span.to)}`}</span>
      </p>
      <div className="sembar-weeks">
        {weeks.map((w) => {
          const parts = [
            `KW ${w.kw}`, w.week ? `VL-Woche ${w.week}` : w.offLabel || "vorlesungsfrei", w.current ? "diese Woche" : "",
            w.exams ? `${w.exams} ${w.exams === 1 ? "Prüfung" : "Prüfungen"}` : "", w.hw ? `${w.hw} ${w.hw === 1 ? "Abgabe" : "Abgaben"}` : "",
            ...w.holidays, ...w.uni,
          ].filter(Boolean);
          return (
            <button key={w.mon} className={`sembar-week ${w.off ? "off" : ""} ${w.current ? "current" : ""} ${w.exams ? "has-exam" : ""} ${w.hw >= BUSY_HW ? "busy" : ""}`}
              onClick={() => onPick(w.mon)} aria-label={parts.join(", ")} title={parts.slice(1).join(", ")}>
              <span className="sembar-kw">{w.kw}</span>
              <span className="sembar-vl">{w.week || ""}</span>
              <span className="sembar-marks" aria-hidden="true">
                {w.exams > 0 && <span className="sembar-exam" />}
                {w.hw > 0 && <span className="sembar-hw">{w.hw}</span>}
                {w.uni.length > 0 && <span className="sembar-uni" />}
                {w.holidays.length > 0 && !w.off && <span className="sembar-hol" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sembar-legend" aria-hidden="true">
        <span><span className="sembar-exam" /> Prüfung</span>
        <span><span className="sembar-hw">n</span> Abgaben</span>
        <span><span className="sembar-uni" /> Uni-Frist</span>
        <span><span className="sembar-hol" /> Feiertag</span>
      </p>
    </section>
  );
}
