/* Weg zur Uni: z. B. mit der S-Bahn zur Umstiegshaltestelle, dort in den Bus zum Campus.
   Zeigt die nächsten Abfahrten und welche Verbindung für die erste Lehrveranstaltung reicht.
   Alternativ mit dem Auto: Fahrzeit bei aktueller Verkehrslage und wann man losfahren sollte. */
import React, { useEffect, useRef, useState } from "react";
import { CAMPUSES, carPlan, commuteIncomplete, commuteOf, dayWord, DEFAULT_COMMUTE, hhmm, mapsLink, matches, queryOffset, recommend, upcomingSessions, vehicle } from "../lib/transit.js";
import { homeArrival, homeCar, homeLines, homeQueries, homeTrips, homewardNow, HOMEWARD } from "../lib/homeward.js";
import { estimateLeave, forecastUrl, parseForecast, returnAt, summarize, weatherLine, weatherPlaces } from "../lib/weather.js";
import { Card, PxIcon, Tabs } from "../ui/primitives.jsx";
import { useGroupOpens } from "../ui/collapse.jsx";
import { Select } from "../ui/select.jsx";

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

/* Wetter für Start (zur Losgeh-Zeit) und Ziel (zur Rückfahrt nach dem letzten Termin), direkt von Open-Meteo.
   Letzter Stand bis 60 Minuten sofort, erneuert ab 15 Minuten Alter und alle 30 Minuten; offline einfach nichts. */
const WX = "studyos-wetter";
const readWx = (url) => { try { const v = JSON.parse(localStorage.getItem(WX) || "null"); return v && v.url === url && Date.now() - v.at < 60 * 60000 ? v : null; } catch { return null; } };
function Weather({ c, session, sessions, leaveAt, pos, tick }) {
  const places = weatherPlaces(c, pos);
  const url = forecastUrl([places.start, places.goal]);
  const [wx, setWx] = useState(() => readWx(url));
  const slot = Math.floor(tick / 30);
  useEffect(() => {
    const hit = readWx(url);
    if (hit) setWx(hit);
    if (hit && Date.now() - hit.at < 15 * 60000) return;
    let live = true;
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((json) => {
      const v = { url, at: Date.now(), days: parseForecast(json) };
      try { localStorage.setItem(WX, JSON.stringify(v)); } catch { /* egal */ }
      if (live) setWx(v);
    }).catch(() => { /* offline oder Dienst weg: keine Wetterzeile */ });
    return () => { live = false; };
  }, [url, slot]);
  const days = wx?.url === url ? wx.days : null;
  if (!days || !session) return null;
  const leave = leaveAt || estimateLeave(session, c), back = returnAt(sessions, session.date);
  const rows = [
    [leave, places.start.name, summarize(days[0], leave)],
    [back, `zurück ab ${places.goal.name}`, back && summarize(days[1], back)],
  ].filter((r) => r[2]);
  if (!rows.length) return null;
  return (
    <ol className="commute-steps mt-2" aria-label="Wetter">
      {rows.map(([t, where, w]) => <li key={where}><PxIcon name={`wx-${w.icon}`} /><span><b className="font-num">{hhmm(t)}</b> {where}: {weatherLine(w)}</span></li>)}
    </ol>
  );
}

/* Mit dem Auto: Fahrzeit mit Verkehr alle 5 Minuten neu, solange die Seite offen ist. home: Heimweg vom Campus nach Zorneding */
function CarView({ db, c, session, sessions, ready, tick, home }) {
  const fromHere = !!c.car.fromHere;
  const way = home ? homeCar(c.car) : c.car;
  const campus = CAMPUSES.find((k) => k.id === c.car.campus) || CAMPUSES[0];
  /* zuletzt bekannter Standort und letzte Route sofort zeigen */
  const [here, setHere] = useState(() => ({ pos: (fromHere && readCache("pos")?.pos) || "", err: "" })); /* aktueller Standort als „Breite,Länge“ (auf ca. 10 m gerundet) */
  const [state, setState] = useState(() => {
    const hit = readCache(`car:${fromHere && here.pos ? here.pos : way.from}>${way.to}`);
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
  const from = useHere ? here.pos : way.from;
  useEffect(() => {
    if (!ready || waiting) return;
    let live = true;
    db.cloud.drive({ from, to: way.to })
      .then((route) => { writeCache(`car:${from}>${way.to}`, { route, here: useHere }); if (live) setState({ route, err: "", here: useHere, at: Date.now() }); })
      .catch((e) => { if (live) setState((s) => (s.route ? s : { route: null, err: e.message || "Fahrzeit gerade nicht verfügbar.", here: false })); });
    return () => { live = false; };
  }, [ready, slot, from, way.to, waiting]);
  const r = state.route, p = home ? null : carPlan(r, session, c);
  const back = home ? homeArrival(r, c.car, state.here) : null;
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
            {home && back && (
              <ol className="commute-steps mt-1.5">
                <li><PxIcon name="car" /><span>Jetzt losfahren {state.here ? "ab deinem Standort" : `am ${campus.name}${c.car.park ? `, ${c.car.park} Min. Fußweg zum Auto` : ""}`}</span></li>
                <li><PxIcon name="flag" /><span><b className="font-num">{hhmm(back)}</b> voraussichtlich in {way.to}</span></li>
              </ol>
            )}
            {session && p && (
              <ol className="commute-steps mt-1.5">
                <li><PxIcon name="car" /><span><b className="font-num">{hhmm(p.leaveAt)}</b> losfahren {state.here ? "ab deinem Standort" : `in ${c.car.from}`}, damit du {dayWord(session.date)} um {session.start} bei {m?.name || "deiner Vorlesung"} bist</span></li>
                <li><PxIcon name="flag" /><span><b className="font-num">{hhmm(p.arriveAt)}</b> voraussichtlich am Ziel{c.car.park ? `, dann ${c.car.park} Min. Parken und Fußweg` : ""}</span></li>
              </ol>
            )}
          </div>
        )}
      <Stand at={r && state.at} />
      {!home && <Weather c={c} session={session} sessions={sessions} leaveAt={p?.leaveAt} pos={useHere ? here.pos : ""} tick={tick} />}
      <label className="mt-3 block text-xs text-slate-400">{home ? "Start" : "Ziel"}
        <Select className="field mt-1 w-full text-sm" value={c.car.campus} onChange={(e) => db.patchSettings({ commute: { ...c, car: { ...c.car, campus: e.target.value } } })}>
          {CAMPUSES.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </Select>
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={fromHere} onChange={(e) => db.patchSettings({ commute: { ...c, car: { ...c.car, fromHere: e.target.checked } } })} /> Ab meinem Standort
      </label>
      {fromHere && here.err && <p className="mt-1 text-xs text-slate-400">{here.err}, gerechnet ab {home ? campus.name : way.from}.</p>}
      <p className="mt-3 text-sm"><a className="ext-link" href={mapsLink(way, fromHere)} target="_blank" rel="noopener noreferrer">Route in Google Maps öffnen ↗</a></p>
      {r && <p className="mt-1 text-[11px] text-slate-500">Verkehrslage laut {r.provider === "tomtom" ? "TomTom" : "Google"}, wird alle 5 Minuten aktualisiert{state.here ? ", dein Standort geht dafür gerundet an den Kartendienst" : ""}. Die Abfahrtszeit gilt für jetzt losfahren, später kann es anders aussehen.</p>}
    </>
  );
}

/* Störungsmeldungen der MVG zu den eigenen Linien */
function Notes({ notes }) {
  if (!notes.length) return null;
  return (
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
  );
}

/* Heimweg mit den Öffis: Bus 230 ab Garching-Forschungszentrum, in Haar die S-Bahn nach Zorneding.
   Letzter Stand sofort, dann beide Abfragen in einem Aufruf (wie beim Hinweg) */
const HOME_CACHE = `home:${HOMEWARD.station.id}>${HOMEWARD.conn.station.id}`;
function homeState(raw) {
  const now = Date.now(), h = HOMEWARD;
  const ahead = (l) => (l || []).filter((d) => d.time >= now - 60000);
  return { buses: ahead(raw.buses).filter((d) => matches(d, h)).slice(0, 3), trips: homeTrips(raw.buses, raw.trains, now - 60000), err: "", at: raw.at || now };
}
function HomeTransit({ db, c, ready, tick, notes }) {
  const h = HOMEWARD;
  const [state, setState] = useState(() => { const hit = readCache(HOME_CACHE); return hit ? homeState(hit) : { buses: null, trips: [], err: "" }; });
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const list = homeQueries(TYPES);
    (db.cloud.mvgMany ? db.cloud.mvgMany(list) : Promise.all(list.map((b) => db.cloud.mvg(b))))
      .then(([buses, trains]) => { const raw = { buses, trains }; writeCache(HOME_CACHE, raw); if (live) setState(homeState(raw)); })
      .catch((e) => { if (live) setState((s) => (s.buses ? s : { ...s, err: e.message || "Abfahrten gerade nicht verfügbar." })); });
    return () => { live = false; };
  }, [ready, tick]);
  if (!ready && (db.cloud?.phase !== "loading" || !state.buses)) return <p className="mt-2 text-sm text-slate-400">{db.cloud?.phase === "loading" ? "Lädt …" : "Für Abfahrten unter „Daten“ beim Cloud-Sync anmelden."}</p>;
  if (state.err) return <p className="mt-2 text-sm text-slate-400">{state.err}</p>;
  if (!state.buses) return <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>;
  const [t, ...more] = state.trips;
  return (
    <>
      {t ? (
        <div className="commute-plan mt-2">
          <p>Nächste Verbindung{t.arriveAt ? <>: <b>um {hhmm(t.arriveAt)} in {h.to}</b></> : ""}</p>
          <ol className="commute-steps mt-1.5">
            <li><PxIcon name={vehicle(t.dep).icon} /><span><b className="font-num">{hhmm(t.dep.time)}</b> Abfahrt {vehicle(t.dep).with} in {h.station.name}{later(t.dep)}</span></li>
            <li><PxIcon name="walk" /><span><b className="font-num">{hhmm(t.changeAt)}</b> Ankunft in {h.conn.station.name}, dort umsteigen</span></li>
            {t.conn ? <li><PxIcon name={vehicle(t.conn).icon} /><span><b className="font-num">{hhmm(t.conn.time)}</b> Abfahrt {vehicle(t.conn).with} in {h.conn.station.name}{t.conn.platform ? `, Gleis ${t.conn.platform}` : ""}{later(t.conn)}</span></li>
              : <li><PxIcon name="train" /><span>Anschluss in {h.conn.station.name} noch nicht bekannt</span></li>}
            {t.arriveAt && <li><PxIcon name="flag" /><span><b className="font-num">{hhmm(t.arriveAt)}</b> voraussichtliche Ankunft in {h.to}{c.walk ? `, dann ${c.walk} Min. zu Fuß` : ""}</span></li>}
          </ol>
        </div>
      ) : <p className="mt-2 text-sm text-slate-400">In nächster Zeit keine Verbindung nach {h.to}.</p>}
      <Stand at={state.at} />
      <Notes notes={notes} />
      {more.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-400">Danach</p>
          <ul className="mt-1 space-y-1">
            {more.map((x, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="font-num w-12 shrink-0">{hhmm(x.dep.time)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-300">Bus {x.dep.line}{x.conn ? `, ${x.conn.line} um ${hhmm(x.conn.time)}` : ""}</span>
                <span className="font-num shrink-0 text-xs text-slate-500">{x.arriveAt ? `an ${hhmm(x.arriveAt)}` : "Anschluss offen"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DepList icon={vehicle({ line: h.line, type: state.buses[0]?.type }).icon} title={`Nächste Abfahrten: ${lineName(h.line)} in ${h.station.name} Richtung ${h.towards}`} deps={state.buses} />
    </>
  );
}

const DIRS = [["out", "Hinweg"], ["home", "Heimweg"]];

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
  /* Heimweg nach dem letzten Termin vor Ort von selbst, umschalten geht immer */
  const [dirPick, setDir] = useState(null);
  const home = (dirPick || (homewardNow(sessions) ? "home" : "out")) === "home";

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setTick((t) => t + 1); }, 60000);
    return () => clearInterval(id);
  }, []);
  const cacheKey = `transit:${key}:${session?.id || ""}`;
  /* letzter Stand sofort (auch vor der Anmeldung beim Cloud-Sync), dann alle Abfragen in einem Aufruf */
  useEffect(() => {
    if (!c || car || incomplete || home) return;
    const hit = readCache(cacheKey);
    if (hit) setState(transitState(hit, c, session));
  }, [cacheKey, car, incomplete, home]);
  useEffect(() => {
    if (!c || !ready || car || incomplete || home) return;
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
  }, [ready, tick, cacheKey, home]);
  /* Meldungen höchstens alle 15 Minuten abfragen; ältere Funktionen kennen die Abfrage nicht: dann einfach keine */
  const lines = c && !car && !incomplete ? (home ? homeLines() : [c.line, c.feeder?.line].filter(Boolean)) : [];
  useEffect(() => {
    if (!ready || !lines.length) return;
    let live = true;
    db.cloud.mvg({ kind: "messages", lines }).then((l) => {
      const ok = Array.isArray(l) ? l.filter((n) => n && n.title && Array.isArray(n.lines)) : [];
      writeCache(`notes:${lines.join(",")}`, { notes: ok });
      if (live) setNotes(ok);
    }).catch(() => { if (live) setNotes([]); });
    return () => { live = false; };
  }, [ready, lines.join(","), Math.floor(tick / 15)]);
  useEffect(() => { if (lines.length) setNotes(readCache(`notes:${lines.join(",")}`)?.notes || []); }, [lines.join(",")]);

  if (!c) return null;
  const m = session ? db.mod(session.moduleId) : null;
  const f = c.feeder, p = state.plan;
  const shown = !(!ready && (db.cloud?.phase !== "loading" || !state.main)) && !state.err && !!state.main; /* Abfahrten da */
  return (
    <section className="surface commute-card" aria-label="Weg zur Uni">
      <h3 className="section-title">Weg zur Uni</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Tabs label="Richtung" items={DIRS} value={home ? "home" : "out"} onChange={setDir} />
        <Tabs label="Verkehrsmittel" items={MODES} value={c.mode} onChange={(mode) => db.patchSettings({ commute: { ...c, mode } })} />
      </div>
      {home && <p className="mt-3 text-sm font-semibold">Heimweg nach {HOMEWARD.to}</p>}
      {!incomplete && !home && options.length > 1 && (
        <label className="mt-3 block text-xs text-slate-400">Pünktlich sein für
          <Select className="field mt-1 w-full text-sm" value={session.id} onChange={(e) => setPick(e.target.value)}>
            {options.map((s) => <option key={s.id} value={s.id}>{dayWord(s.date)[0].toUpperCase() + dayWord(s.date).slice(1)} {s.start}: {db.mod(s.moduleId)?.name || s.type || "Termin"}</option>)}
          </Select>
        </label>
      )}
      {incomplete ? <p className="mt-2 text-sm text-slate-400">{car ? "Start und Ziel" : "Haltestelle"} unter „Daten & Einstellungen“ → „Weg zur Uni“ eintragen.</p>
        : car ? <CarView key={home ? "home" : "out"} db={db} c={c} session={session} sessions={sessions} ready={ready} tick={tick} home={home} />
        : home ? <HomeTransit db={db} c={c} ready={ready} tick={tick} notes={notes} />
        : (
          <>
            {!ready && (db.cloud?.phase !== "loading" || !state.main) ? <p className="mt-2 text-sm text-slate-400">{db.cloud?.phase === "loading" ? "Lädt …" : "Für Abfahrten unter „Daten“ beim Cloud-Sync anmelden."}</p>
              : state.err ? <p className="mt-2 text-sm text-slate-400">{state.err}</p>
              : !state.main ? <p className="mt-2 text-sm text-slate-400" role="status">Lädt …</p>
              : session && (p ? (
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
            {shown && <Stand at={state.at} />}
            <Weather c={c} session={session} sessions={sessions} leaveAt={shown ? p?.leaveAt : null} tick={tick} />
            {shown && <Notes notes={notes} />}
            {shown && f && <DepList icon={vehicle({ line: f.line, type: state.feeder?.[0]?.type }).icon} title={`Nächste Abfahrten: ${f.line || "Bahn"} in ${f.station.name}`} deps={state.feeder || []} />}
            {shown && <DepList icon={vehicle({ line: c.line, type: state.main?.[0]?.type }).icon} title={`Nächste Abfahrten: ${lineName(c.line)} in ${c.station.name}${c.towards ? ` Richtung ${c.towards}` : ""}`} deps={state.main} />}
          </>
        )}
      {ride > 0 && <span key={ride} className={`px-ride px-${car ? "car" : vehicle({ line: c.line }).icon}`} aria-hidden="true" />}
    </section>
  );
}

/* Einstellungen: der Weg ist fest (Öffis S6 und Bus 230 nach Garching, Auto ab Zorneding), wählbar sind Campus und Zeiten */
export function CommuteSettings({ db }) {
  const c = commuteOf(db.data.settings);
  const set = (p) => db.patchSettings({ commute: { ...(c || DEFAULT_COMMUTE), ...p } });
  const setCar = (p) => set({ car: { ...c.car, ...p } });
  const num = (obj, setter, k, l, max) => (
    <label className="block text-xs text-slate-400">{l}
      <input type="number" min="0" max={max} className="field mt-1 w-full text-sm" value={obj[k]} onChange={(e) => setter({ [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <Card title="Weg zur Uni">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!c} onChange={(e) => db.patchSettings({ commute: e.target.checked ? DEFAULT_COMMUTE : null })} /> Abfahrten auf „Heute“ zeigen
      </label>
      {c && (
        <>
          <div className="commute-leg mt-3">
            <p className="text-xs font-semibold text-slate-400">Mit den Öffis</p>
            <p className="mt-1 text-sm">S6 ab {c.feeder.station.name}, in {c.station.name} umsteigen in den Bus {c.line} zum Campus Garching</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {num(c, set, "walk", `Fußweg zur Haltestelle ${c.feeder.station.name}`, 60)}
              {num(c, set, "buffer", "Ankunft vor Beginn (Min.)", 60)}
            </div>
          </div>
          <div className="commute-leg mt-3">
            <p className="text-xs font-semibold text-slate-400">Mit dem Auto</p>
            <p className="mt-1 text-sm">Ab {c.car.from}, auf „Heute“ auch ab deinem Standort</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-400">Ziel
                <Select className="field mt-1 w-full text-sm" value={c.car.campus} onChange={(e) => setCar({ campus: e.target.value })}>
                  {CAMPUSES.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </Select>
              </label>
              {num(c.car, setCar, "park", "Parken und Fußweg (Min.)", 60)}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Die Fahrzeit mit Verkehr kommt über deine Supabase-Funktion, dort muss GOOGLE_MAPS_KEY oder TOMTOM_KEY als Secret gesetzt sein (siehe Anleitung). Start und Ziel gehen dafür an Google bzw. TomTom.</p>
          </div>
          <p className="mt-4 text-[11px] text-slate-500">Pushes zum Losgehen und bei Verspätung: unter „Benachrichtigungen“.</p>
          <p className="mt-2 text-[11px] text-slate-500">Echtzeitdaten der MVG über deine Supabase-Funktion. Bei Verspätung rechnet StudyOS mit der tatsächlichen Abfahrt.</p>
        </>
      )}
    </Card>
  );
}

/* Pushes zum Weg zur Uni (unter Benachrichtigungen, bei den übrigen Push-Arten) */
export function CommutePush({ db }) {
  if (!commuteOf(db.data.settings)) return <p className="text-xs text-slate-500" data-set="pushLeave">Pushes zum Losgehen gibt es, sobald „Weg zur Uni“ eingeschaltet ist.</p>;
  return (
    <div>
      <label className="flex items-start gap-2 text-sm" data-set="pushCommute">
        <input type="checkbox" className="mt-1" checked={!!db.data.settings.pushCommute} onChange={(e) => db.patchSettings({ pushCommute: e.target.checked })} />
        <span>Bei Verspätung oder Ausfall per Push sagen, wenn ich früher los muss<span className="block text-[11px] text-slate-500">Braucht eingeschaltete Erinnerungen. Dafür liegen Haltestellen, Linien und die Uhrzeit deiner ersten Veranstaltung je Tag unverschlüsselt bei Supabase.</span></span>
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm" data-set="pushLeave">
        <input type="checkbox" className="mt-1" checked={!!db.data.settings.pushLeave} onChange={(e) => db.patchSettings({ pushLeave: e.target.checked })} />
        <span>Per Push „Jetzt losgehen“ vor dem ersten Termin vor Ort<span className="block text-[11px] text-slate-500">Kommt kurz bevor du los musst, nach Echtzeit-Abfahrt bzw. mit dem Auto nach aktueller Verkehrslage. Braucht eingeschaltete Erinnerungen; dafür liegen Haltestellen und Linien bzw. Start und Ziel sowie die Uhrzeit deines ersten Termins je Tag unverschlüsselt bei Supabase. Online-Termine (Raum „Online“, „Zoom“ oder ein Link) zählen nicht.</span></span>
      </label>
    </div>
  );
}
