/* Einstellung: feste Semestertermine der TUM (Vorlesungszeit, Rückmeldung, Prüfungsanmeldung) als Fristen anzeigen */
import React from "react";

export function TumDatesToggle({ db }) {
  const st = db.data.settings;
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-300">
      <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={st.tumDates !== false} onChange={(e) => db.patchSettings({ tumDates: e.target.checked })} />
      Semestertermine der TUM als Fristen (Vorlesungszeit, Rückmeldung, Prüfungsanmeldung)
    </label>
  );
}
