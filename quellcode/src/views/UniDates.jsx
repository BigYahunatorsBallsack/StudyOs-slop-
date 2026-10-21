/* „Uni-Fristen“ auf Heute: feste Semestertermine der TUM in den nächsten 14 Tagen und laufende Zeiträume */
import React from "react";
import { Group } from "../ui/collapse.jsx";
import { upcomingUniDates } from "../lib/tumdates.js";
import { dueLabel } from "../lib/todo.js";
import { fmtShort, iso } from "../lib/util.js";

/* Farbe am Rand nach Art: Prüfungsanmeldung rot, Rückmeldung gelb, Vorlesungszeit cyan */
export const UNI_COLOR = { exam: "var(--danger)", fee: "var(--warn)", lecture: "var(--ink)" };

export function UniDatesGroup({ settings, today = iso() }) {
  const list = upcomingUniDates(settings, today);
  if (!list.length) return null;
  return (
    <Group id="fristen" title="Uni-Fristen" count={list.length}>
      <ul className="rows">
        {list.map((x) => (
          <li key={x.id} className="row" style={{ "--mod": UNI_COLOR[x.kind] }}>
            <p className="row-title">{x.title}</p>
            <p className="row-meta">{x.running ? `bis ${fmtShort(x.to)}, ${dueLabel(x.to, today)}` : `${dueLabel(x.date, today)}, ${fmtShort(x.date)}`}</p>
          </li>
        ))}
      </ul>
    </Group>
  );
}
