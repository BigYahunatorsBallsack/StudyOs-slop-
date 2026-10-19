/* Weg zur Uni: welche Verbindung reicht für die erste Lehrveranstaltung?
   Optional mit Zubringer, z. B. S6 Zorneding → Haar, dort Umstieg in den Bus 230 Richtung Forschungszentrum. */
import { addDays, iso } from "./util.js";

export const DEFAULT_COMMUTE = {
  station: { id: "de:09184:2140", name: "Haar" }, line: "230", towards: "Forschungszentrum", avoid: "", travel: 50, walk: 5, buffer: 10,
  feeder: { station: { id: "de:09175:4020", name: "Zorneding" }, line: "S6", towards: "", avoid: "Grafing, Ebersberg", travel: 8, transfer: 4 },
  mode: "transit", /* oder "car" */
  car: { from: "Zorneding", to: "Boltzmannstraße 15, 85748 Garching bei München", park: 10 },
};

/** Pendel-Einstellungen; ohne eigene Angaben S6 Zorneding → Haar → 230 */
export function commuteOf(settings = {}) {
  if (settings.commute === null) return null;
  const c = { ...DEFAULT_COMMUTE, ...(settings.commute || {}) };
  if (c.feeder) c.feeder = { ...DEFAULT_COMMUTE.feeder, ...c.feeder };
  c.car = { ...DEFAULT_COMMUTE.car, ...(c.car || {}) };
  if (c.mode !== "car") c.mode = "transit";
  return c;
}

/** Mit dem Auto: wann losfahren, damit man mit Parken und Fußweg (park) und Puffer rechtzeitig da ist? */
export function carPlan(route, session, c, startMs = null) {
  if (!route || !session) return null;
  const start = startMs ?? at(session.date, session.start);
  const leaveAt = start - (c.buffer + (Number(c.car.park) || 0) + route.minutes) * 60000;
  return { leaveAt, arriveAt: leaveAt + route.minutes * 60000, session };
}

/** Route in Google Maps (geht ohne Schlüssel, auch mit Verkehrslage in der Maps-App) */
export const mapsLink = (car) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(car.from)}&destination=${encodeURIComponent(car.to)}&travelmode=driving`;

const words = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
/** Passt eine Abfahrt zu Linie und Richtung (enthält / enthält nicht)? */
export function matches(d, leg) {
  const dest = d.destination.toLowerCase();
  if (leg.line && d.line.toLowerCase() !== String(leg.line).toLowerCase()) return false;
  const want = words(leg.towards);
  if (want.length && !want.some((w) => dest.includes(w))) return false;
  return !words(leg.avoid).some((w) => dest.includes(w));
}

/** Erste nicht ausfallende Lehrveranstaltung heute (noch nicht begonnen) oder an einem der nächsten 3 Tage */
export function nextFirstSession(sessions, now = new Date()) {
  const today = iso(now), hm = now.toTimeString().slice(0, 5);
  for (let i = 0; i <= 3; i++) {
    const day = addDays(today, i);
    const first = sessions.filter((s) => s.date === day && !s.cancelled).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!first) continue;
    if (i === 0 && first.start <= hm) continue;
    return first;
  }
  return null;
}

const at = (date, hm) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };

/** Abfragefenster in Minuten ab jetzt: eine Stunde vor der spätesten passenden Abfahrt der Hauptlinie bzw. des Zubringers */
export function queryOffset(session, c, now = new Date(), feeder = false) {
  let latest = at(session.date, session.start) - (c.buffer + c.travel) * 60000;
  if (feeder && c.feeder) latest -= (c.feeder.transfer + c.feeder.travel) * 60000;
  return Math.max(0, Math.round((latest - now.getTime()) / 60000) - 60);
}

/**
 * Empfehlung: späteste Verbindung, mit der man rechtzeitig ankommt.
 * Mit Zubringer: zum spätesten passenden Bus den spätesten Zubringer, der mit Umstiegszeit hinkommt;
 * reicht für einen Bus kein Zubringer, wird der nächstfrühere Bus versucht.
 * startMs: Beginn der Veranstaltung in ms (Standard: Datum und Uhrzeit in der Zeitzone des Geräts; der Server rechnet selbst)
 * @returns null oder { dep, feederDep, leaveAt, changeAt, arriveAt, session } (Zeiten in ms)
 */
export function recommend(departures, session, c, feederDeps = null, startMs = null) {
  if (!session) return null;
  const deadline = (startMs ?? at(session.date, session.start)) - c.buffer * 60000;
  const buses = departures.filter((d) => matches(d, c) && !d.cancelled && d.time + c.travel * 60000 <= deadline).sort((a, b) => b.time - a.time);
  for (const dep of buses) {
    if (!c.feeder || !feederDeps) return { dep, feederDep: null, session, leaveAt: dep.time - c.walk * 60000, arriveAt: dep.time + c.travel * 60000 };
    const f = c.feeder;
    const fd = feederDeps.filter((d) => matches(d, f) && !d.cancelled && d.time + (f.travel + f.transfer) * 60000 <= dep.time).sort((a, b) => b.time - a.time)[0];
    if (fd) return { dep, feederDep: fd, session, leaveAt: fd.time - c.walk * 60000, changeAt: fd.time + f.travel * 60000, arriveAt: dep.time + c.travel * 60000 };
  }
  return null;
}

/** Verkehrsmittel einer Abfahrt: Icon und Satzteil („mit der S6“, „mit dem Bus 230“) */
export function vehicle(d) {
  const line = String(d?.line || "");
  const type = String(d?.type || "");
  if (/BUS/.test(type) || /^\d/.test(line)) return { icon: "bus", with: `mit dem Bus ${line}` };
  if (type === "TRAM") return { icon: "tram", with: `mit der Tram ${line}` };
  return { icon: "train", with: line ? `mit der ${line}` : "mit der Bahn" };
}

export const hhmm = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
