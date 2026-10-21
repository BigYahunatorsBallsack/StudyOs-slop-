/* Heimweg: immer nach Zorneding. Mit den Öffis Bus 230 ab Garching-Forschungszentrum Richtung Haar, dort in die
   S-Bahn Richtung Ebersberg/Grafing (S6, die S4 nach Zorneding passt auch). Mit dem Auto vom Campus oder Standort.
   Nach dem letzten Termin vor Ort zeigt „Weg zur Uni“ von selbst den Heimweg. */
import { HOME, LEGACY_COMMUTE, matches } from "./transit.js";
import { returnAt } from "./weather.js";
import { iso } from "./util.js";

const MIN = 60000;

export const HOMEWARD = {
  to: HOME.name,
  station: { id: "de:09184:460", name: "Garching-Forschungszentrum" }, line: "230", towards: "Haar", avoid: "", travel: 50,
  conn: { station: LEGACY_COMMUTE.station, line: "S6, S4", towards: "Zorneding, Ebersberg, Grafing, Kirchseeon", avoid: "", travel: 8, transfer: 4 },
};

/* Linien einzeln, z. B. für die Störungsmeldungen */
const split = (l) => String(l || "").split(",").map((x) => x.trim()).filter(Boolean);
export const homeLines = (h = HOMEWARD) => [h.line, ...split(h.conn.line)];

/** Passt eine Abfahrt? Wie matches, aber mit mehreren Linien („S6, S4“) */
export const fits = (d, leg) => (split(leg.line).length ? split(leg.line).some((line) => matches(d, { ...leg, line })) : matches(d, leg));

/** Heimweg statt Hinweg? Ab 30 Minuten vor dem Ende des letzten Termins vor Ort heute bis 4 Stunden danach */
export function homewardNow(sessions, now = new Date()) {
  const back = returnAt(sessions, iso(now));
  if (!back) return false;
  const t = now.getTime();
  return t >= back - 30 * MIN && t <= back + 4 * 60 * MIN;
}

/** Abfragen für die MVG: Bus ab Garching ab jetzt, S-Bahn in Haar ab etwa der Ankunft des ersten Busses */
export function homeQueries(types, h = HOMEWARD) {
  return [
    { kind: "departures", station: h.station.id, types, offset: 0, limit: 30 },
    { kind: "departures", station: h.conn.station.id, types: "SBAHN", offset: Math.max(0, h.travel - 5), limit: 40 },
  ];
}

/**
 * Nächste Verbindungen nach Hause: zu jedem Bus ab `from` (ms) der erste Anschluss, der mit Umstiegszeit erreichbar ist.
 * @returns [{ dep, conn, changeAt, arriveAt }] (conn und arriveAt null, wenn der Anschluss noch nicht abgefragt ist)
 */
export function homeTrips(buses, trains, from = Date.now(), n = 3, h = HOMEWARD) {
  const ok = (l, leg) => (l || []).filter((d) => fits(d, leg) && !d.cancelled).sort((a, b) => a.time - b.time);
  const t = ok(trains, h.conn);
  return ok(buses, h).filter((d) => d.time >= from).slice(0, n).map((dep) => {
    const changeAt = dep.time + h.travel * MIN;
    const conn = t.find((d) => d.time >= changeAt + h.conn.transfer * MIN) || null;
    return { dep, conn, changeAt, arriveAt: conn ? conn.time + h.conn.travel * MIN : null };
  });
}

/** Mit dem Auto nach Hause: Start ist der Campus (oder der Standort), Ziel Zorneding */
export const homeCar = (car, h = HOMEWARD) => ({ ...car, from: car.to, to: h.to });

/** Ankunft mit dem Auto, wenn man jetzt losgeht (vom Campus erst Fußweg und Ausparken) */
export const homeArrival = (route, car, fromHere, now = Date.now()) => (route ? now + ((fromHere ? 0 : Number(car.park) || 0) + route.minutes) * MIN : null);
