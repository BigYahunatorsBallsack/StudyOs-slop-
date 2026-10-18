/* Weg zur Uni: nächste Abfahrten (z. B. Bus 230 ab Haar) und welcher Bus für die erste Vorlesung reicht */
import React, { useEffect, useState } from "react";
import { commuteOf, DEFAULT_COMMUTE, hhmm, matches, nextFirstSession, queryOffset, recommend } from "../lib/transit.js";
import { fmtShort, iso } from "../lib/util.js";
import { Card } from "../ui/primitives.jsx";

const dayWord = (date) => (date === iso() ? "heute" : date === iso(new Date(Date.now() + 86400000)) ? "morgen" : fmtShort(date));

export function CommuteCard({ db, sessions }) {
  const c = commuteOf(db.data.settings);
  const ready = db.cloud?.phase === "ready";
  const [state, setState] = useState({ live: null, plan: null, err: "" });
  const [tick, setTick] = useState(0);
  const session = c ? nextFirstSession(sessions) : null;

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setTick((t) => t + 1); }, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!c || !ready) return;
    let live = true;
    (async () => {
      try {
        const base = { kind: "departures", station: c.station.id, types: "BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM" };
        const now = await db.cloud.mvg({ ...base, offset: 0, limit: 40 });
        const off = session ? queryOffset(session, c) : 0;
        const later = session && off > 30 ? await db.cloud.mvg({ ...base, offset: off, limit: 60 }) : now;
        if (live) setState({ live: now.filter((d) => matches(d, c)).slice(0, 3), plan: recommend(later, session, c), err: "" });
      } catch (e) { if (live) setState((s) => ({ ...s, err: e.message || "Abfahrten gerade nicht verfügbar." })); }
    })();
    return () => { live = false; };
  }, [ready, tick, c?.station.id, c?.line, c?.towards, c?.travel, c?.walk, c?.buffer, session?.id]);

  if (!c) return null;
  const m = session ? db.mod(session.moduleId) : null;
  const title = `${c.line ? `${/^\d/.test(c.line) ? "Bus " : ""}${c.line}` : "Abfahrten"} ab ${c.station.name}`;
  return (
    <section className="surface" aria-label="Weg zur Uni">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        {c.towards && <span className="truncate text-xs text-slate-500">Richtung {c.towards}</span>}
      </div>
      {!ready ? <p className="mt-2 text-sm text-slate-400">Für Abfahrten unter „Daten“ beim Cloud-Sync anmelden.</p>
        : state.err ? <p className="mt-2 text-sm text-slate-400">{state.err}</p>
        : !state.live ? <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>
        : (
          <>
            {session && (state.plan ? (
              <p className="commute-plan mt-2" style={{ "--mod": m?.color }}>
                Für <b>{m?.name || "deine Vorlesung"}</b> {dayWord(session.date)} um {session.start}: <b>los um {hhmm(state.plan.leaveAt)}</b>, {c.line || "Abfahrt"} um {hhmm(state.plan.dep.time)}{state.plan.dep.delay > 0 ? ` (+${state.plan.dep.delay})` : ""}, an etwa {hhmm(state.plan.arriveAt)}.
              </p>
            ) : <p className="mt-2 text-sm text-slate-400">Für {m?.name || "die erste Vorlesung"} {dayWord(session.date)} um {session.start} keine passende Abfahrt gefunden.</p>)}
            <ul className="mt-2 space-y-1">
              {state.live.length ? state.live.map((d, i) => (
                <li key={i} className={`flex items-center gap-3 text-sm ${d.cancelled ? "line-through opacity-60" : ""}`}>
                  <span className="font-num w-12 shrink-0">{hhmm(d.time)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">{d.line} {d.destination}</span>
                  <span className={`font-num shrink-0 text-xs ${d.cancelled ? "text-rose-300" : d.delay > 0 ? "text-amber-300" : "text-slate-500"}`}>{d.cancelled ? "fällt aus" : d.delay > 0 ? `+${d.delay}` : d.realtime ? "pünktlich" : "Plan"}</span>
                </li>
              )) : <li className="text-sm text-slate-400">In nächster Zeit keine Abfahrt.</li>}
            </ul>
          </>
        )}
    </section>
  );
}

/* Einstellungen: Haltestelle suchen, Linie, Richtung, Zeiten */
export function CommuteSettings({ db }) {
  const { data } = db;
  const c = commuteOf(data.settings);
  const [q, setQ] = useState(""), [hits, setHits] = useState(null), [err, setErr] = useState("");
  const set = (p) => db.patchSettings({ commute: { ...(c || DEFAULT_COMMUTE), ...p } });
  const search = async () => {
    setErr(""); setHits(null);
    try { setHits(await db.cloud.mvg({ kind: "stations", query: q })); } catch (e) { setErr(e.message); }
  };
  const num = (k, l, max) => (
    <label className="block text-xs text-slate-400">{l}
      <input type="number" min="0" max={max} className="field mt-1 w-full text-sm" value={c[k]} onChange={(e) => set({ [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <Card title="Weg zur Uni">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!c} onChange={(e) => db.patchSettings({ commute: e.target.checked ? DEFAULT_COMMUTE : null })} /> Abfahrten auf „Heute“ zeigen
      </label>
      {c && (
        <>
          <p className="mt-3 text-sm">Haltestelle: <b>{c.station.name}</b></p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
            <input aria-label="Haltestelle suchen" className="field min-w-0 flex-1 text-sm" placeholder="Andere Haltestelle suchen" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-ghost" disabled={q.trim().length < 2 || db.cloud?.phase !== "ready"}>Suchen</button>
          </form>
          {err && <p role="alert" className="mt-1 text-xs text-rose-400">{err}</p>}
          {hits && (
            <ul className="mt-2 space-y-1">
              {hits.length ? hits.map((h) => (
                <li key={h.id}><button className="link-btn text-left" onClick={() => { set({ station: { id: h.id, name: h.name } }); setHits(null); setQ(""); }}>{h.name}{h.place && h.place !== h.name ? `, ${h.place}` : ""}</button></li>
              )) : <li className="text-xs text-slate-400">Nichts gefunden.</li>}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-400">Linie
              <input className="field mt-1 w-full text-sm" value={c.line} onChange={(e) => set({ line: e.target.value.trim() })} placeholder="z. B. 230, U6" />
            </label>
            <label className="block text-xs text-slate-400">Richtung enthält
              <input className="field mt-1 w-full text-sm" value={c.towards} onChange={(e) => set({ towards: e.target.value })} placeholder="z. B. Forschungszentrum" />
            </label>
            {num("travel", "Fahrzeit (Minuten)", 180)}
            {num("walk", "Fußweg zur Haltestelle", 60)}
            {num("buffer", "Ankunft vor Beginn (Min.)", 60)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Echtzeitdaten der MVG, abgerufen über deine Supabase-Funktion. Die 230 braucht laut Fahrplan von Haar (S) bis Garching-Forschungszentrum etwa 50 Minuten.</p>
        </>
      )}
    </Card>
  );
}
