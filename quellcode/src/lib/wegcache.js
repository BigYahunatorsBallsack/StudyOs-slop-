/* Weg zur Uni: letzter Stand von Abfahrten und Fahrzeit auf dem Gerät (localStorage), gemeinsam für die Karte auf „Heute“
   und die Abfahrt in der Kopfzeile. Gleichzeitige Abfragen für denselben Schlüssel laufen nur einmal. */
import { carPlan, firstSessionOn, hhmm, isOnline, queryOffset, recommend } from "./transit.js";
import { iso } from "./util.js";

export const CACHE = "studyos-weg";
export const MAX_AGE = 30 * 60000;
/* Neuer Stand auf dem Gerät: die Kopfzeile hört mit */
export const WEG_EVENT = "studyos-weg-neu";
export const TYPES = "BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM,BAHN";

export const readCache = (k) => { try { const all = JSON.parse(localStorage.getItem(CACHE) || "{}"); const v = all[k]; return v && Date.now() - v.at < MAX_AGE ? v : null; } catch { return null; } };
export const writeCache = (k, v) => {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || "{}");
    for (const x of Object.keys(all)) if (Date.now() - all[x].at > MAX_AGE) delete all[x];
    all[k] = { ...v, at: Date.now() };
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch { /* egal */ }
  try { window.dispatchEvent(new CustomEvent(WEG_EVENT, { detail: k })); } catch { /* ohne Fenster (Tests) */ }
};

/** Schlüssel für die Abfahrten zu einer Veranstaltung (nur was die Öffis betrifft) */
export const transitKey = (c, session) => `transit:${JSON.stringify({ ...c, mode: undefined, car: undefined })}:${session?.id || ""}`;
/** Schlüssel für die Fahrzeit mit dem Auto */
export const carKey = (from, to) => `car:${from}>${to}`;

const inflight = new Map();
const once = (k, run) => {
  if (!inflight.has(k)) inflight.set(k, run().finally(() => inflight.delete(k)));
  return inflight.get(k);
};

/** Abfahrten (jetzt und rund um die späteste passende Verbindung) in einem Aufruf holen und ablegen; liefert die Rohdaten */
export function loadTransit(cloud, c, session) {
  const key = transitKey(c, session);
  return once(key, async () => {
    const q = (station, offset, limit) => ({ kind: "departures", station: station.id, types: TYPES, offset, limit });
    const f = c.feeder;
    const list = [q(c.station, 0, 40)];
    if (f) list.push(q(f.station, 0, 40));
    const off = session ? queryOffset(session, c) : 0, fo = session && f ? queryOffset(session, c, new Date(), true) : 0;
    if (off > 30) list.push(q(c.station, off, 60));
    if (fo > 30) list.push(q(f.station, fo, 60));
    const res = await (cloud.mvgMany ? cloud.mvgMany(list) : Promise.all(list.map((b) => cloud.mvg(b))));
    let i = 0;
    const mainNow = res[i++], feederNow = f ? res[i++] : null;
    const raw = { mainNow, feederNow, mainLater: off > 30 ? res[i++] : mainNow, feederLater: fo > 30 ? res[i++] : feederNow };
    writeCache(key, raw);
    return raw;
  });
}

/** Fahrzeit mit Verkehr holen und ablegen */
export function loadDrive(cloud, from, to, here = false) {
  const key = carKey(from, to);
  return once(key, async () => {
    const route = await cloud.drive({ from, to });
    writeCache(key, { route, here });
    return route;
  });
}

/** Aus den Rohdaten: Empfehlung für die Veranstaltung (ohne schon abgefahrene) */
export function planFrom(raw, c, session, now = Date.now()) {
  const ahead = (l) => (l || []).filter((d) => d.time >= now - 60000);
  return recommend(ahead(raw.mainLater), session, c, c.feeder ? ahead(raw.feederLater) : null);
}

/** Heute der erste Termin vor Ort, der noch nicht begonnen hat (sonst null: dann ist man schon da oder es steht nichts an) */
export function headerSession(sessions, now = new Date()) {
  const today = iso(now), hm = now.toTimeString().slice(0, 5);
  const onSite = (sessions || []).filter((s) => !isOnline(s));
  const first = firstSessionOn(onSite, today);
  return first && first.start > hm ? first : null;
}

/* So lange vor dem Losgehen erscheint die Abfahrt oben */
export const HEADER_LEAD = 3 * 60;

/**
 * Abfahrt für die Kopfzeile, z. B. „S6 07:47 (+3)“ oder mit dem Auto „Los 07:40“.
 * Mit den Öffis: erstes Verkehrsmittel der empfohlenen Verbindung, sichtbar bis zu dessen Abfahrt;
 * mit dem Auto: bis zur Losfahr-Zeit. Erst ab HEADER_LEAD Minuten vorher.
 * @returns {{ text: string, label: string, until: number, leaveAt: number } | null}
 */
export function departureChip({ c, session, raw, route, now = Date.now() }) {
  if (!c || !session) return null;
  if (c.mode === "car") {
    const p = carPlan(route, session, c);
    if (!p || now > p.leaveAt + 60000 || p.leaveAt - now > HEADER_LEAD * 60000) return null;
    return { text: `Los ${hhmm(p.leaveAt)}`, label: `Weg zur Uni: um ${hhmm(p.leaveAt)} mit dem Auto losfahren, für ${session.start} Uhr`, until: p.leaveAt, leaveAt: p.leaveAt };
  }
  if (!raw) return null;
  const p = planFrom(raw, c, session, now);
  if (!p) return null;
  const first = p.feederDep || p.dep;
  if (now > first.time + 60000 || p.leaveAt - now > HEADER_LEAD * 60000) return null;
  const late = first.delay > 0 ? ` (+${first.delay})` : "";
  const station = p.feederDep ? c.feeder.station.name : c.station.name;
  return {
    text: `${first.line} ${hhmm(first.time)}${late}`,
    label: `Weg zur Uni: um ${hhmm(p.leaveAt)} losgehen, ${first.line} um ${hhmm(first.time)} ab ${station}${first.delay > 0 ? ` (${first.delay} Min. später)` : ""}, für ${session.start} Uhr`,
    until: first.time, leaveAt: p.leaveAt,
  };
}
