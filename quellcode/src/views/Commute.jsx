/* Weg zur Uni: z. B. mit der S-Bahn zur Umstiegshaltestelle, dort in den Bus zum Campus.
   Zeigt die nächsten Abfahrten und welche Verbindung für die erste Lehrveranstaltung reicht.
   Alternativ mit dem Auto: Fahrzeit bei aktueller Verkehrslage und wann man losfahren sollte. */
import React, { useEffect, useRef, useState } from "react";
import { carPlan, commuteIncomplete, commuteOf, DEFAULT_COMMUTE, DEFAULT_FEEDER, hhmm, mapsLink, matches, queryOffset, recommend, upcomingSessions, vehicle } from "../lib/transit.js";
import { fmtShort, iso } from "../lib/util.js";
import { Card, PxIcon, Tabs } from "../ui/primitives.jsx";
import { useGroupOpens } from "../ui/collapse.jsx";
import { Select } from "../ui/select.jsx";

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

const MODES = [["transit", "Öffis"], ["car", "Auto"]];

/* Letzter Stand von Abfahrten und Fahrzeit auf dem Gerät: wird sofort gezeigt und im Hintergrund erneuert */
const CACHE = "studyos-weg";
const MAX_AGE = 30 * 60000;
const readCache = (k) => { try { const all = JSON.parse(localStorage.getItem(CACHE) || "{}"); const v = all[k]; return v && Date.now() - v.at < MAX_AGE ? v : null; } catch { return null; } };
const writeCache = (k, v) => { try { const all = JSON.parse(localStorage.getItem(CACHE) || "{}"); for (const x of Object.keys(all)) if (Date.now() - all[x].at > MAX_AGE) delete all[x]; all[k] = { ...v, at: Date.now() }; localStorage.setItem(CACHE, JSON.stringify(all)); } catch { /* egal */ } };

/* Älterer Stand aus dem Zwischenspeicher: dazusagen, von wann er ist */
const Stand = ({ at }) => (at && Date.now() - at > 120000 ? <p className="mt-1 text-[11px] text-slate-500">Stand {hhmm(at)}, wird aktualisiert</p> : null);

/* Aus den Rohdaten: die nächsten Abfahrten (ohne schon abgefahrene) und die Empfehlung für die Veranstaltung */
function transitState(raw, c, session) {
  const now = Date.now(), f = c.feeder;
  const ahead = (l) => (l || []).filter((d) => d.time >= now - 60000);
  return {
    main: ahead(raw.mainNow).filter((d) => matches(d, c)).slice(0, 3),
    feeder: f ? ahead(raw.feederNow).filter((d) => matches(d, f)).slice(0, 3) : null,
    plan: recommend(ahead(raw.mainLater), session, c, f ? ahead(raw.feederLater) : null),
    err: "", at: raw.at || now,
  };
}

/* Mit dem Auto: Fahrzeit mit Verkehr alle 5 Minuten neu, solange die Seite offen ist */
function CarView({ db, c, session, ready, tick }) {
  const fromHere = !!c.car.fromHere;
  /* zuletzt bekannter Standort und letzte Route sofort zeigen */
  const [here, setHere] = useState(() => ({ pos: (fromHere && readCache("pos")?.pos) || "", err: "" })); /* aktueller Standort als „Breite,Länge“ (auf ca. 10 m gerundet) */
  const [state, setState] = useState(() => {
    const hit = readCache(`car:${fromHere && here.pos ? here.pos : c.car.from}>${c.car.to}`);
    return hit ? { route: hit.route, err: "", here: hit.here, at: hit.at } : { route: null, err: "", here: false };
  }); /* here: Route wurde ab dem Standort gerechnet */
  const slot = Math.floor(tick / 5);
  useEffect(() => {
    if (!fromHere) return;
    if (!navigator.geolocation) { setHere({ pos: "", err: "Dieses Gerät kennt keinen Standort" }); return; }
    let live = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { const pos = `${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`; writeCache("pos", { pos }); if (live) setHere({ pos, err: "" }); },
      (e) => { if (live) setHere((h) => (h.pos ? h : { pos: "", err: e.code === 1 ? "Standort nicht freigegeben" : "Standort gerade nicht verfügbar" })); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    return () => { live = false; };
  }, [fromHere, slot]);
  const useHere = fromHere && !!here.pos;
  const waiting = fromHere && !here.pos && !here.err;
  const from = useHere ? here.pos : c.car.from;
  useEffect(() => {
    if (!ready || waiting) return;
    let live = true;
    db.cloud.drive({ from, to: c.car.to })
      .then((route) => { writeCache(`car:${from}>${c.car.to}`, { route, here: useHere }); if (live) setState({ route, err: "", here: useHere, at: Date.now() }); })
      .catch((e) => { if (live) setState((s) => (s.route ? s : { route: null, err: e.message || "Fahrzeit gerade nicht verfügbar.", here: false })); });
    return () => { live = false; };
  }, [ready, slot, from, c.car.to, waiting]);
  const r = state.route, p = carPlan(r, session, c);
  const m = session ? db.mod(session.moduleId) : null;
  const jam = r ? r.minutes - r.normal : 0;
  return (
    <>
      {!ready && (db.cloud?.phase !== "loading" || !r) ? <p className="mt-2 text-sm text-slate-400">{db.cloud?.phase === "loading" ? "Lädt …" : "Für die Fahrzeit mit Verkehr unter „Daten“ beim Cloud-Sync anmelden."}</p>
        : state.err ? <p className="mt-2 text-sm text-slate-400">{state.err}</p>
        : !r ? <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>
        : (
          <div className="commute-plan mt-2" style={{ "--mod": m?.color }}>
            <p><b className="font-num">{r.minutes} Min.</b> mit dem Auto ({r.km.toLocaleString("de-DE")} km){jam >= 2 ? <span className="text-amber-300">, {jam} Min. Verzögerung durch Verkehr</span> : ", Verkehr fließt"}</p>
            {session && p && (
              <ol className="commute-steps mt-1.5">
                <li><PxIcon name="car" /><span><b className="font-num">{hhmm(p.leaveAt)}</b> losfahren {state.here ? "ab deinem Standort" : `in ${c.car.from}`}, damit du {dayWord(session.date)} um {session.start} bei {m?.name || "deiner Vorlesung"} bist</span></li>
                <li><PxIcon name="flag" /><span><b className="font-num">{hhmm(p.arriveAt)}</b> voraussichtlich am Ziel{c.car.park ? `, dann ${c.car.park} Min. Parken und Fußweg` : ""}</span></li>
              </ol>
            )}
          </div>
        )}
      <Stand at={r && state.at} />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={fromHere} onChange={(e) => db.patchSettings({ commute: { ...c, car: { ...c.car, fromHere: e.target.checked } } })} /> Ab meinem Standort
      </label>
      {fromHere && here.err && <p className="mt-1 text-xs text-slate-400">{here.err}, gerechnet ab {c.car.from}.</p>}
      <p className="mt-3 text-sm"><a className="ext-link" href={mapsLink(c.car, fromHere)} target="_blank" rel="noopener noreferrer">Route in Google Maps öffnen ↗</a></p>
      {r && <p className="mt-1 text-[11px] text-slate-500">Verkehrslage laut {r.provider === "tomtom" ? "TomTom" : "Google"}, wird alle 5 Minuten aktualisiert{state.here ? ", dein Standort geht dafür gerundet an den Kartendienst" : ""}. Die Abfahrtszeit gilt für jetzt losfahren, später kann es anders aussehen.</p>}
    </>
  );
}

export function CommuteCard({ db, sessions }) {
  const c = commuteOf(db.data.settings);
  const ready = db.cloud?.phase === "ready";
  const car = c?.mode === "car";
  const [state, setState] = useState({ main: null, feeder: null, plan: null, err: "" });
  const [notes, setNotes] = useState(() => readCache(`notes:${c ? [c.line, c.feeder?.line].join(",") : ""}`)?.notes || []); /* Störungsmeldungen der MVG zu den eigenen Linien */
  const [tick, setTick] = useState(0);
  const options = c ? upcomingSessions(sessions) : [];
  const [pick, setPick] = useState("");
  const session = options.find((s) => s.id === pick) || options[0] || null;
  const key = c ? JSON.stringify({ ...c, mode: undefined, car: undefined }) : ""; /* nur was die Öffis betrifft */
  /* Pixel-Fahrzeug fährt einmal durch die Karte: beim Aufklappen und beim Wechsel zwischen Öffis und Auto */
  const opens = useGroupOpens();
  const [switches, setSwitches] = useState(0);
  const lastMode = useRef(c?.mode);
  useEffect(() => { if (lastMode.current !== c?.mode) { lastMode.current = c?.mode; setSwitches((n) => n + 1); } }, [c?.mode]);
  const ride = opens + switches;
  const incomplete = !!c && commuteIncomplete(c);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setTick((t) => t + 1); }, 60000);
    return () => clearInterval(id);
  }, []);
  const cacheKey = `transit:${key}:${session?.id || ""}`;
  /* letzter Stand sofort (auch vor der Anmeldung beim Cloud-Sync), dann alle Abfragen in einem Aufruf */
  useEffect(() => {
    if (!c || car || incomplete) return;
    const hit = readCache(cacheKey);
    if (hit) setState(transitState(hit, c, session));
  }, [cacheKey, car, incomplete]);
  useEffect(() => {
    if (!c || !ready || car || incomplete) return;
    let live = true;
    (async () => {
      try {
        const q = (station, offset, limit) => ({ kind: "departures", station: station.id, types: TYPES, offset, limit });
        const f = c.feeder;
        const list = [q(c.station, 0, 40)];
        if (f) list.push(q(f.station, 0, 40));
        const off = session ? queryOffset(session, c) : 0, fo = session && f ? queryOffset(session, c, new Date(), true) : 0;
        if (off > 30) list.push(q(c.station, off, 60));
        if (fo > 30) list.push(q(f.station, fo, 60));
        const res = await (db.cloud.mvgMany ? db.cloud.mvgMany(list) : Promise.all(list.map((b) => db.cloud.mvg(b))));
        let i = 0;
        const mainNow = res[i++], feederNow = f ? res[i++] : null;
        const raw = { mainNow, feederNow, mainLater: off > 30 ? res[i++] : mainNow, feederLater: fo > 30 ? res[i++] : feederNow };
        writeCache(cacheKey, raw);
        if (live) setState(transitState(raw, c, session));
      } catch (e) { if (live) setState((s) => (s.main ? s : { ...s, err: e.message || "Abfahrten gerade nicht verfügbar." })); }
    })();
    return () => { live = false; };
  }, [ready, tick, cacheKey]);
  /* Meldungen höchstens alle 15 Minuten abfragen; ältere Funktionen kennen die Abfrage nicht: dann einfach keine */
  const lines = c && !car && !incomplete ? [c.line, c.feeder?.line].filter(Boolean) : [];
  useEffect(() => {
    if (!ready || !lines.length) return;
    let live = true;
    db.cloud.mvg({ kind: "messages", lines }).then((l) => {
      const ok = Array.isArray(l) ? l.filter((n) => n && n.title && Array.isArray(n.lines)) : [];
      writeCache(`notes:${[c.line, c.feeder?.line].join(",")}`, { notes: ok });
      if (live) setNotes(ok);
    }).catch(() => { if (live) setNotes([]); });
    return () => { live = false; };
  }, [ready, lines.join(","), Math.floor(tick / 15)]);

  if (!c) return null;
  const m = session ? db.mod(session.moduleId) : null;
  const f = c.feeder, p = state.plan;
  return (
    <section className="surface commute-card" aria-label="Weg zur Uni">
      <h3 className="section-title">Weg zur Uni</h3>
      <div className="mt-2"><Tabs label="Verkehrsmittel" items={MODES} value={c.mode} onChange={(mode) => db.patchSettings({ commute: { ...c, mode } })} /></div>
      {!incomplete && options.length > 1 && (
        <label className="mt-3 block text-xs text-slate-400">Pünktlich sein für
          <Select className="field mt-1 w-full text-sm" value={session.id} onChange={(e) => setPick(e.target.value)}>
            {options.map((s) => <option key={s.id} value={s.id}>{dayWord(s.date)[0].toUpperCase() + dayWord(s.date).slice(1)} {s.start}: {db.mod(s.moduleId)?.name || s.type || "Termin"}</option>)}
          </Select>
        </label>
      )}
      {incomplete ? <p className="mt-2 text-sm text-slate-400">{car ? "Start und Ziel" : "Haltestelle"} unter „Daten & Einstellungen“ → „Weg zur Uni“ eintragen.</p>
        : car ? <CarView db={db} c={c} session={session} ready={ready} tick={tick} />
        : !ready && (db.cloud?.phase !== "loading" || !state.main) ? <p className="mt-2 text-sm text-slate-400">{db.cloud?.phase === "loading" ? "Lädt …" : "Für Abfahrten unter „Daten“ beim Cloud-Sync anmelden."}</p>
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
            <Stand at={state.at} />
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
      {ride > 0 && <span key={ride} className={`px-ride px-${car ? "car" : vehicle({ line: c.line }).icon}`} aria-hidden="true" />}
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
      <p className="text-sm">{label}: {value.name ? <b>{value.name}</b> : <span className="text-slate-400">noch keine gewählt</span>}</p>
      <div className="mt-1.5 flex gap-2">
        <input aria-label={`${label} suchen`} className="field min-w-0 flex-1 text-sm" placeholder={value.name ? "Andere Haltestelle suchen" : "Haltestelle suchen"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
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
  const setF = (p) => set({ feeder: { ...(c.feeder || DEFAULT_FEEDER), ...p } });
  const setCar = (p) => set({ car: { ...c.car, ...p } });
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
            <input type="checkbox" checked={!!c.feeder} onChange={(e) => set({ feeder: e.target.checked ? DEFAULT_FEEDER : null })} /> Erst mit Zubringer (z. B. S-Bahn) zur Umstiegshaltestelle
          </label>
          {c.feeder && (
            <div className="commute-leg mt-3">
              <p className="text-xs font-semibold text-slate-400">1. Zubringer</p>
              <div className="mt-2"><StationPicker db={db} label="Einstieg" value={c.feeder.station} onPick={(station) => setF({ station })} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {text(c.feeder, setF, "line", "Linie", "z. B. S6")}
                {text(c.feeder, setF, "avoid", "Richtung nicht", "z. B. Endhaltestelle der Gegenrichtung")}
                {num(c.feeder, setF, "travel", `Fahrzeit bis ${c.station.name || "zum Umstieg"} (Min.)`, 120)}
                {num(c.feeder, setF, "transfer", "Umsteigezeit (Min.)", 30)}
              </div>
            </div>
          )}
          <div className="commute-leg mt-3">
            <p className="text-xs font-semibold text-slate-400">{c.feeder ? "2. Hauptlinie" : "Linie"}</p>
            <div className="mt-2"><StationPicker db={db} label={c.feeder ? "Umstieg" : "Haltestelle"} value={c.station} onPick={(station) => set({ station })} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {text(c, set, "line", "Linie", "z. B. 230, U6")}
              {text(c, set, "towards", "Richtung enthält", "z. B. Endhaltestelle")}
              {num(c, set, "travel", "Fahrzeit (Min.)", 180)}
              {num(c, set, "buffer", "Ankunft vor Beginn (Min.)", 60)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">{num(c, set, "walk", `Fußweg zur Haltestelle ${(c.feeder ? c.feeder.station.name : c.station.name) || ""}`.trim(), 60)}</div>
          <div className="commute-leg mt-3">
            <p className="text-xs font-semibold text-slate-400">Mit dem Auto</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {text(c.car, setCar, "from", "Start", "Adresse oder Ort")}
              {text(c.car, setCar, "to", "Ziel", "Adresse an der Uni")}
              {num(c.car, setCar, "park", "Parken und Fußweg (Min.)", 60)}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Die Fahrzeit mit Verkehr kommt über deine Supabase-Funktion, dort muss GOOGLE_MAPS_KEY oder TOMTOM_KEY als Secret gesetzt sein (siehe Anleitung). Start und Ziel gehen dafür an Google bzw. TomTom.</p>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!!db.data.settings.pushCommute} onChange={(e) => db.patchSettings({ pushCommute: e.target.checked })} />
            <span>Bei Verspätung oder Ausfall per Push sagen, wenn ich früher los muss<span className="block text-[11px] text-slate-500">Braucht eingeschaltete Erinnerungen. Dafür liegen Haltestellen, Linien und die Uhrzeit deiner ersten Veranstaltung je Tag unverschlüsselt bei Supabase.</span></span>
          </label>
          <p className="mt-2 text-[11px] text-slate-500">Echtzeitdaten der MVG (Großraum München mit Freising) über deine Supabase-Funktion. Fahrzeiten trägst du laut Fahrplan ein, bei Verspätung rechnet StudyOS mit der tatsächlichen Abfahrt.</p>
        </>
      )}
    </Card>
  );
}
