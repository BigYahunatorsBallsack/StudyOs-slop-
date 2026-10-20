/* Weg zur Uni: welche Verbindung reicht für die erste Lehrveranstaltung?
   Optional mit Zubringer, z. B. erst mit der S-Bahn zur Umstiegshaltestelle, dort in den Bus. */
import { addDays, iso } from "./util.js";

/* Bis StudyOS 2.7 die Vorgabe für alle: S6 Zorneding → Haar → Bus 230 nach Garching. Bestehende Daten ohne eigene
   Einstellung behalten sie (siehe upgradeSettings in data.js). */
export const LEGACY_COMMUTE = {
  station: { id: "de:09184:2140", name: "Haar" }, line: "230", towards: "Forschungszentrum", avoid: "", travel: 50, walk: 5, buffer: 10,
  feeder: { station: { id: "de:09175:4020", name: "Zorneding" }, line: "S6", towards: "", avoid: "Grafing, Ebersberg", travel: 8, transfer: 4 },
  mode: "transit",
  car: { from: "Zorneding", to: "Boltzmannstraße 15, 85748 Garching bei München", park: 10 },
};

/* Fester Weg: mit den Öffis immer S6 ab Zorneding, in Haar in den Bus 230 zum Campus Garching. Mit dem Auto ab Zorneding
   (oder dem aktuellen Standort) zu einem der Campus. */
export const CAMPUSES = [
  { id: "garching", name: "Campus Garching", to: LEGACY_COMMUTE.car.to },
  { id: "weihenstephan", name: "Campus Weihenstephan (Freising)", to: "Alte Akademie 8, 85354 Freising" },
];
const FIXED_TRANSIT = { station: LEGACY_COMMUTE.station, line: "230", towards: "Forschungszentrum", avoid: "", travel: 50, feeder: LEGACY_COMMUTE.feeder };
export const CAR_FROM = "Zorneding";

/* Vorlage beim Einschalten */
export const DEFAULT_COMMUTE = { ...LEGACY_COMMUTE, car: { park: 10 } };

/* Gewählter Campus fürs Auto; ohne Wahl der aus einer alten Zieladresse, sonst der zum Studiengang */
function campusOf(car, settings) {
  return CAMPUSES.find((k) => k.id === car.campus)
    || CAMPUSES.find((k) => k.to === car.to || (car.to && new RegExp(k.id, "i").test(car.to)))
    || (/pbt|weihenstephan|freising/i.test(`${settings.curriculum || ""} ${settings.program || ""}`) ? CAMPUSES[1] : CAMPUSES[0]);
}

/** Pendel-Einstellungen; null, solange „Weg zur Uni“ nicht eingeschaltet ist */
export function commuteOf(settings = {}) {
  const s = settings.commute;
  if (!s) return null;
  const car = s.car || {};
  const campus = campusOf(car, settings);
  return {
    ...FIXED_TRANSIT,
    walk: s.walk ?? LEGACY_COMMUTE.walk, buffer: s.buffer ?? LEGACY_COMMUTE.buffer,
    mode: s.mode === "car" ? "car" : "transit",
    car: { from: CAR_FROM, to: campus.to, campus: campus.id, park: car.park ?? 10, fromHere: !!car.fromHere },
  };
}

/** Fehlt noch etwas? Der Weg ist fest, deshalb nur bei kaputten Daten */
export const commuteIncomplete = (c) => (c.mode === "car" ? !String(c.car.from || "").trim() || !String(c.car.to || "").trim() : !c.station?.id || (!!c.feeder && !c.feeder.station?.id));

/* Online-Termine (Raum ist ein Link oder heißt „Online“, „Zoom“ …): dafür muss niemand los */
const ONLINE = /^(https?:\/\/|www\.)|\b(online|zoom|webex|teams|livestream|virtuell|bbb)\b/i;
export const isOnline = (s) => ONLINE.test(String(s?.room || "")) || /\bonline\b/i.test(String(s?.type || ""));

/** Erster stattfindender Termin eines Tages mit Uhrzeit (oder undefined) */
export const firstSessionOn = (sessions, day) => sessions.filter((s) => s.date === day && !s.cancelled && /^\d{2}:\d{2}$/.test(s.start || "")).sort((a, b) => a.start.localeCompare(b.start))[0];

/** Mit dem Auto: wann losfahren, damit man mit Parken und Fußweg (park) und Puffer rechtzeitig da ist? */
export function carPlan(route, session, c, startMs = null) {
  if (!route || !session) return null;
  const start = startMs ?? at(session.date, session.start);
  const leaveAt = start - (c.buffer + (Number(c.car.park) || 0) + route.minutes) * 60000;
  return { leaveAt, arriveAt: leaveAt + route.minutes * 60000, session };
}

/** Route in Google Maps (geht ohne Schlüssel, auch mit Verkehrslage in der Maps-App) */
/* ohne origin startet Google Maps am aktuellen Standort */
export const mapsLink = (car, fromHere = false) => `https://www.google.com/maps/dir/?api=1${fromHere ? "" : `&origin=${encodeURIComponent(car.from)}`}&destination=${encodeURIComponent(car.to)}&travelmode=driving`;

const words = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
/** Passt eine Abfahrt zu Linie und Richtung (enthält / enthält nicht)? */
export function matches(d, leg) {
  const dest = d.destination.toLowerCase();
  if (leg.line && d.line.toLowerCase() !== String(leg.line).toLowerCase()) return false;
  const want = words(leg.towards);
  if (want.length && !want.some((w) => dest.includes(w))) return false;
  return !words(leg.avoid).some((w) => dest.includes(w));
}

/** Wählbare Ziele: die noch nicht begonnenen Veranstaltungen von heute und alle des nächsten Tages mit Veranstaltungen (bis 3 Tage voraus) */
export function upcomingSessions(sessions, now = new Date()) {
  const today = iso(now), hm = now.toTimeString().slice(0, 5);
  const on = (day) => sessions.filter((s) => s.date === day && !s.cancelled && /^\d{2}:\d{2}$/.test(s.start || "")).sort((a, b) => a.start.localeCompare(b.start));
  const out = on(today).filter((s) => s.start > hm);
  for (let i = 1; i <= 3; i++) {
    const next = on(addDays(today, i));
    if (next.length) return out.concat(next);
  }
  return out;
}

/** Nächste Veranstaltung: die nächste heute, die noch nicht begonnen hat, sonst die erste der nächsten Tage */
export function nextFirstSession(sessions, now = new Date()) {
  return upcomingSessions(sessions, now)[0] || null;
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
