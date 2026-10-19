/* Weg zur Uni: z. B. S6 Zorneding → Haar, Umstieg in den Bus 230 Richtung Forschungszentrum.
   Zeigt die nächsten Abfahrten und welche Verbindung für die erste Lehrveranstaltung reicht. */
import React, { useEffect, useState } from "react";
import { commuteOf, DEFAULT_COMMUTE, hhmm, matches, nextFirstSession, queryOffset, recommend, vehicle } from "../lib/transit.js";
import { fmtShort, iso } from "../lib/util.js";
import { Card, PxIcon } from "../ui/primitives.jsx";

const dayWord = (date) => (date === iso() ? "heute" : date === iso(new Date(Date.now() + 86400000)) ? "morgen" : fmtShort(date));
const lineName = (l) => (/^\d/.test(l || "") ? `Bus ${l}` : l || "Abfahrten");
const TYPES = "BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM,BAHN";

const later = (d) => (d.delay > 0 ? ` (${d.delay} Min. später)` : "");

function DepList({ title, deps, icon }) {
  return (
    <div className="mt-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-400">{icon && <PxIcon name={icon} />}{title}</p>
      <ul className="mt-1 space-y-1">
        {deps.length ? deps.map((d, i) => (
          <li key={i} className={`flex items-center gap-3 text-sm ${d.cancelled ? "line-through opacity-60" : ""}`}>
            <span className="font-num w-12 shrink-0">{hhmm(d.time)}</span>
            <span className="min-w-0 flex-1 truncate text-slate-300">{d.line} nach {d.destination}{d.platform ? `, Gleis ${d.platform}` : ""}</span>
            <span className={`font-num shrink-0 text-xs ${d.cancelled ? "text-rose-300" : d.delay > 0 ? "text-amber-300" : "text-slate-500"}`}>{d.cancelled ? "fällt aus" : d.delay > 0 ? `${d.delay} Min. später` : d.realtime ? "pünktlich" : "laut Fahrplan"}</span>
          </li>
        )) : <li className="text-sm text-slate-400">In nächster Zeit keine Abfahrt.</li>}
      </ul>
    </div>
  );
}

export function CommuteCard({ db, sessions }) {
  const c = commuteOf(db.data.settings);
  const ready = db.cloud?.phase === "ready";
  const [state, setState] = useState({ main: null, feeder: null, plan: null, err: "" });
  const [notes, setNotes] = useState([]); /* Störungsmeldungen der MVG zu den eigenen Linien */
  const [tick, setTick] = useState(0);
  const session = c ? nextFirstSession(sessions) : null;
  const key = JSON.stringify(c);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setTick((t) => t + 1); }, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!c || !ready) return;
    let live = true;
    (async () => {
      try {
        const q = (station, offset, limit) => db.cloud.mvg({ kind: "departures", station: station.id, types: TYPES, offset, limit });
        const f = c.feeder;
        const [mainNow, feederNow] = await Promise.all([q(c.station, 0, 40), f ? q(f.station, 0, 40) : Promise.resolve(null)]);
        let mainLater = mainNow, feederLater = feederNow;
        if (session) {
          const off = queryOffset(session, c);
          if (off > 30) mainLater = await q(c.station, off, 60);
          if (f) { const fo = queryOffset(session, c, new Date(), true); if (fo > 30) feederLater = await q(f.station, fo, 60); }
        }
        if (live) setState({ main: mainNow.filter((d) => matches(d, c)).slice(0, 3), feeder: f ? feederNow.filter((d) => matches(d, f)).slice(0, 3) : null, plan: recommend(mainLater, session, c, f ? feederLater : null), err: "" });
      } catch (e) { if (live) setState((s) => ({ ...s, err: e.message || "Abfahrten gerade nicht verfügbar." })); }
    })();
    return () => { live = false; };
  }, [ready, tick, key, session?.id]);
  /* Meldungen höchstens alle 15 Minuten abfragen; ältere Funktionen kennen die Abfrage nicht: dann einfach keine */
  const lines = c ? [c.line, c.feeder?.line].filter(Boolean) : [];
  useEffect(() => {
    if (!ready || !lines.length) return;
    let live = true;
    db.cloud.mvg({ kind: "messages", lines }).then((l) => { if (live) setNotes(Array.isArray(l) ? l.filter((n) => n && n.title && Array.isArray(n.lines)) : []); }).catch(() => { if (live) setNotes([]); });
    return () => { live = false; };
  }, [ready, lines.join(","), Math.floor(tick / 15)]);

  if (!c) return null;
  const m = session ? db.mod(session.moduleId) : null;
  const f = c.feeder, p = state.plan;
  return (
    <section className="surface" aria-label="Weg zur Uni">
      <h3 className="section-title">Weg zur Uni</h3>
      {!ready ? <p className="mt-2 text-sm text-slate-400">Für Abfahrten unter „Daten“ beim Cloud-Sync anmelden.</p>
        : state.err ? <p className="mt-2 text-sm text-slate-400">{state.err}</p>
        : !state.main ? <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>
        : (
          <>
            {session && (p ? (
              <div className="commute-plan mt-2" style={{ "--mod": m?.color }}>
                <p>Für <b>{m?.name || "deine Vorlesung"}</b> {dayWord(session.date)} um {session.start}: <b>um {hhmm(p.leaveAt)} losgehen</b>{c.walk ? `, ${c.walk} Min. zu Fuß zur Haltestelle` : ""}</p>
                <ol className="commute-steps mt-1.5">
                  {p.feederDep && <li><PxIcon name={vehicle(p.feederDep).icon} /><span><b className="font-num">{hhmm(p.feederDep.time)}</b> Abfahrt {vehicle(p.feederDep).with} in {f.station.name}{p.feederDep.platform ? `, Gleis ${p.feederDep.platform}` : ""}{later(p.feederDep)}</span></li>}
                  {p.feederDep && <li><PxIcon name="walk" /><span><b className="font-num">{hhmm(p.changeAt)}</b> Ankunft in {c.station.name}, dort umsteigen</span></li>}
                  <li><PxIcon name={vehicle(p.dep).icon} /><span><b className="font-num">{hhmm(p.dep.time)}</b> Abfahrt {vehicle(p.dep).with} in {c.station.name}{later(p.dep)}</span></li>
                  <li><PxIcon name="flag" /><span><b className="font-num">{hhmm(p.arriveAt)}</b> voraussichtliche Ankunft am Ziel</span></li>
                </ol>
              </div>
            ) : <p className="mt-2 text-sm text-slate-400">Für {m?.name || "die erste Vorlesung"} {dayWord(session.date)} um {session.start} keine passende Verbindung gefunden.</p>)}
            {notes.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="Störungen und Baustellen">
                {notes.map((n, i) => (
                  <li key={i} className={`notice ${n.incident ? "notice-warn" : "notice-plain"} text-sm`}>
                    <details>
                      <summary className="cursor-pointer"><b>{n.lines.join(", ")}</b>: {n.title}</summary>
                      <p className="mt-1 whitespace-pre-line text-xs">{n.text}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {f && <DepList icon={vehicle({ line: f.line, type: state.feeder?.[0]?.type }).icon} title={`Nächste Abfahrten: ${f.line || "Bahn"} in ${f.station.name}`} deps={state.feeder || []} />}
            <DepList icon={vehicle({ line: c.line, type: state.main?.[0]?.type }).icon} title={`Nächste Abfahrten: ${lineName(c.line)} in ${c.station.name}${c.towards ? ` Richtung ${c.towards}` : ""}`} deps={state.main} />
          </>
        )}
    </section>
  );
}

/* Haltestelle über die MVG suchen */
function StationPicker({ db, label, value, onPick }) {
  const [q, setQ] = useState(""), [hits, setHits] = useState(null), [err, setErr] = useState("");
  const search = async () => {
    setErr(""); setHits(null);
    try { setHits(await db.cloud.mvg({ kind: "stations", query: q })); } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <p className="text-sm">{label}: <b>{value.name}</b></p>
      <div className="mt-1.5 flex gap-2">
        <input aria-label={`${label} suchen`} className="field min-w-0 flex-1 text-sm" placeholder="Andere Haltestelle suchen" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        <button type="button" className="btn btn-ghost" onClick={search} disabled={q.trim().length < 2 || db.cloud?.phase !== "ready"}>Suchen</button>
      </div>
      {err && <p role="alert" className="mt-1 text-xs text-rose-400">{err}</p>}
      {hits && (
        <ul className="mt-2 space-y-1">
          {hits.length ? hits.map((h) => (
            <li key={h.id}><button type="button" className="link-btn text-left" onClick={() => { onPick({ id: h.id, name: h.name }); setHits(null); setQ(""); }}>{h.name}{h.place && h.place !== h.name ? `, ${h.place}` : ""}</button></li>
          )) : <li className="text-xs text-slate-400">Nichts gefunden.</li>}
        </ul>
      )}
    </div>
  );
}

/* Einstellungen: Zubringer (optional) und Hauptlinie */
export function CommuteSettings({ db }) {
  const c = commuteOf(db.data.settings);
  const set = (p) => db.patchSettings({ commute: { ...(c || DEFAULT_COMMUTE), ...p } });
  const setF = (p) => set({ feeder: { ...(c.feeder || DEFAULT_COMMUTE.feeder), ...p } });
  const num = (obj, setter, k, l, max) => (
    <label className="block text-xs text-slate-400">{l}
      <input type="number" min="0" max={max} className="field mt-1 w-full text-sm" value={obj[k]} onChange={(e) => setter({ [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />
    </label>
  );
  const text = (obj, setter, k, l, ph) => (
    <label className="block text-xs text-slate-400">{l}
      <input className="field mt-1 w-full text-sm" value={obj[k] || ""} placeholder={ph} onChange={(e) => setter({ [k]: e.target.value })} />
    </label>
  );
  return (
    <Card title="Weg zur Uni">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!c} onChange={(e) => db.patchSettings({ commute: e.target.checked ? DEFAULT_COMMUTE : null })} /> Abfahrten auf „Heute“ zeigen
      </label>
      {c && (
        <>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!c.feeder} onChange={(e) => set({ feeder: e.target.checked ? DEFAULT_COMMUTE.feeder : null })} /> Erst mit Zubringer (z. B. S-Bahn) zur Umstiegshaltestelle
          </label>
          {c.feeder && (
            <div className="commute-leg mt-3">
              <p className="text-xs font-semibold text-slate-400">1. Zubringer</p>
              <div className="mt-2"><StationPicker db={db} label="Einstieg" value={c.feeder.station} onPick={(station) => setF({ station })} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {text(c.feeder, setF, "line", "Linie", "z. B. S6")}
                {text(c.feeder, setF, "avoid", "Richtung nicht", "z. B. Grafing, Ebersberg")}
                {num(c.feeder, setF, "travel", `Fahrzeit bis ${c.station.name} (Min.)`, 120)}
                {num(c.feeder, setF, "transfer", "Umsteigezeit (Min.)", 30)}
              </div>
            </div>
          )}
          <div className="commute-leg mt-3">
            <p className="text-xs font-semibold text-slate-400">{c.feeder ? "2. Hauptlinie" : "Linie"}</p>
            <div className="mt-2"><StationPicker db={db} label={c.feeder ? "Umstieg" : "Haltestelle"} value={c.station} onPick={(station) => set({ station })} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {text(c, set, "line", "Linie", "z. B. 230, U6")}
              {text(c, set, "towards", "Richtung enthält", "z. B. Forschungszentrum")}
              {num(c, set, "travel", "Fahrzeit (Min.)", 180)}
              {num(c, set, "buffer", "Ankunft vor Beginn (Min.)", 60)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">{num(c, set, "walk", `Fußweg zur Haltestelle ${c.feeder ? c.feeder.station.name : c.station.name}`, 60)}</div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!!db.data.settings.pushCommute} onChange={(e) => db.patchSettings({ pushCommute: e.target.checked })} />
            <span>Bei Verspätung oder Ausfall per Push sagen, wenn ich früher los muss<span className="block text-[11px] text-slate-500">Braucht eingeschaltete Erinnerungen. Dafür liegen Haltestellen, Linien und die Uhrzeit deiner ersten Veranstaltung je Tag unverschlüsselt bei Supabase.</span></span>
          </label>
          <p className="mt-2 text-[11px] text-slate-500">Echtzeitdaten der MVG über deine Supabase-Funktion. Fahrplan: S6 Zorneding → Haar 8 Minuten, Bus 230 Haar (S) → Garching-Forschungszentrum etwa 50 Minuten. Bei Verspätung rechnet StudyOS mit der tatsächlichen Abfahrt.</p>
        </>
      )}
    </Card>
  );
}
