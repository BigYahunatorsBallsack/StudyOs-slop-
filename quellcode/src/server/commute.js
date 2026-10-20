/* Weg zur Uni, auf dem Server: Vor der Abfahrt prüft der Erinnerungslauf (alle 15 Minuten) die Echtzeit.
   Muss man wegen Verspätung oder Ausfall früher los als nach Fahrplan, gibt es eine Push-Nachricht.
   Außerdem „Jetzt losgehen“: im letzten Lauf vor dem Losgehen eine Nachricht mit Abfahrt bzw. Fahrzeit mit Verkehr. */
import { recommend, vehicle } from "../lib/transit.js";
import { mvg } from "./mvg.js";
import { drive, driveProvider } from "./drive.js";
import { zonedInstant } from "./reminders.js";

const TYPES = "BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM,BAHN";
const MIN = 60000;
const EARLIER_MS = 3 * MIN; /* erst ab 3 Minuten früher melden */

const hm = (ms, tz) => new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const lineName = (l) => (/^\d/.test(l || "") ? `Bus ${l}` : l);

/** Zeitfenster, in dem geprüft wird: 75 bis 5 Minuten vor dem voraussichtlichen Losgehen */
export function commuteWindow(x, tz = "Europe/Berlin") {
  const c = x.commute;
  const start = zonedInstant(x.date, x.time, tz).getTime();
  const lead = (c.buffer + c.travel + c.walk + (c.feeder ? c.feeder.travel + c.feeder.transfer : 0)) * MIN;
  return { start, from: start - lead - 75 * MIN, to: start - lead - 5 * MIN };
}

/** Warum früher? Ausfall oder Verspätung der Fahrten, die nach Fahrplan gereicht hätten */
function reason(plan, main, feeder, tz) {
  const find = (list, d) => (list || []).find((r) => r.line === d.line && r.planned === d.planned);
  const out = [];
  for (const [d, list] of [[plan.feederDep, feeder], [plan.dep, main]]) {
    if (!d) continue;
    const r = find(list, d);
    if (r?.cancelled) out.push(`${lineName(d.line)} um ${hm(d.planned, tz)} fällt aus`);
    else if (r && r.delay > 0) out.push(`${lineName(d.line)} um ${hm(d.planned, tz)} +${r.delay}`);
  }
  return out.join(", ");
}

/* Abfahrten an Haupt- und Zubringerhaltestelle rund um die späteste passende Abfahrt; null bei Fehlern */
async function departures(c, startMs, t, fetchImpl) {
  const offset = (ms) => Math.max(0, Math.round((ms - t) / MIN) - 45);
  const mainLatest = startMs - (c.buffer + c.travel) * MIN;
  const main = await mvg({ kind: "departures", station: c.station.id, types: TYPES, offset: offset(mainLatest), limit: 60 }, fetchImpl);
  if (main.error) return null;
  let feeder = null;
  if (c.feeder && c.feeder.station && c.feeder.station.id) {
    const r = await mvg({ kind: "departures", station: c.feeder.station.id, types: TYPES, offset: offset(mainLatest - (c.feeder.transfer + c.feeder.travel) * MIN), limit: 60 }, fetchImpl);
    if (r.error) return null;
    feeder = r.data;
  }
  return { main: main.data, feeder };
}

/**
 * Prüft einen Eintrag { kind: "commute", id, title, date, time, commute } zur Zeit `now`.
 * @returns null oder { key, title, body, tag, url }
 */
export async function commuteAlert(x, now, tz, fetchImpl) {
  const c = x.commute;
  if (!c || !c.station || !c.station.id || !/^\d{2}:\d{2}$/.test(x.time || "")) return null;
  const w = commuteWindow(x, tz), t = now.getTime();
  if (t < w.from || t > w.to) return null;
  const deps = await departures(c, w.start, t, fetchImpl);
  if (!deps) return null;
  const { main, feeder } = deps;
  const session = { date: x.date, start: x.time };
  const byPlan = (list) => list && list.map((d) => ({ ...d, time: d.planned || d.time, cancelled: false }));
  const plan = recommend(byPlan(main), session, c, byPlan(feeder), w.start);
  if (!plan) return null; /* schon nach Fahrplan keine Verbindung: nichts zu vergleichen */
  const real = recommend(main, session, c, feeder, w.start);
  if (real && plan.leaveAt - real.leaveAt < EARLIER_MS) return null;
  const why = reason(plan, main, feeder, tz);
  const what = `${x.title || "deine Vorlesung"} um ${x.time}`;
  return {
    key: `commute:${x.id}:${x.date}:${real ? hm(real.leaveAt, tz) : "keine"}`,
    title: real ? `Früher los: ${hm(real.leaveAt, tz)}` : "Keine passende Verbindung",
    body: real ? `Für ${what} um ${hm(real.leaveAt, tz)} statt ${hm(plan.leaveAt, tz)} losgehen${why ? ` (${why})` : ""}.` : `Für ${what} passt laut Echtzeit keine Verbindung mehr${why ? ` (${why})` : ""}.`,
    tag: `commute-${x.date}`, url: "./?aktion=heute",
  };
}

const LEAVE_AHEAD = 15 * MIN; /* so lange vor dem Losgehen meldet sich der letzte Lauf davor */
const LEAVE_LATE = 5 * MIN; /* knapp verpasst: trotzdem noch melden */
const CAR_FROM = 3 * 60 * MIN; /* mit dem Auto frühestens 3 Stunden vor Beginn nach der Fahrzeit fragen */

/**
 * „Jetzt losgehen“: Eintrag { kind: "leave", id, title, date, time, commute: { mode, … } } zur Zeit `now`.
 * Öffis: späteste Verbindung laut Echtzeit; Auto: Fahrzeit mit aktueller Verkehrslage (braucht GOOGLE_MAPS_KEY oder TOMTOM_KEY).
 * Gemeldet wird, wenn das Losgehen höchstens 15 Minuten entfernt ist, also im letzten Lauf davor.
 * @returns null oder { key, title, body, tag, url, ttl }
 */
export async function leaveAlert(x, now, tz, fetchImpl, env = {}) {
  const c = x.commute;
  if (!c || !/^\d{2}:\d{2}$/.test(x.time || "")) return null;
  const start = zonedInstant(x.date, x.time, tz).getTime(), t = now.getTime();
  if (t >= start) return null;
  let leaveAt, how;
  if (c.mode === "car") {
    if (!c.car || !c.car.from || !c.car.to || t < start - CAR_FROM || !driveProvider(env)) return null;
    const r = await drive({ from: c.car.from, to: c.car.to }, env, fetchImpl);
    if (r.error || !r.data) return null;
    const { minutes, normal } = r.data;
    leaveAt = start - ((Number(c.buffer) || 0) + (Number(c.car.park) || 0) + minutes) * MIN;
    how = `mit dem Auto ${minutes} Min.${minutes > normal + 2 ? ` wegen Verkehr (sonst ${normal})` : ""}`;
  } else {
    if (!c.station || !c.station.id) return null;
    /* spätestens los ohne Wartezeit; die tatsächliche Verbindung liegt davor (Takt bis zu einer Stunde) */
    const w = commuteWindow(x, tz), latest = w.to + 5 * MIN;
    if (t < latest - 90 * MIN || t > latest) return null;
    const deps = await departures(c, start, t, fetchImpl);
    if (!deps) return null;
    const real = recommend(deps.main, { date: x.date, start: x.time }, c, deps.feeder, start);
    if (!real) return null; /* keine Verbindung mehr: das meldet commuteAlert */
    const first = real.feederDep || real.dep;
    leaveAt = real.leaveAt;
    how = `${vehicle(first).with} um ${hm(first.time, tz)}${first.delay > 0 ? ` (+${first.delay})` : ""}`;
  }
  const left = leaveAt - t;
  if (left > LEAVE_AHEAD || left < -LEAVE_LATE) return null;
  return {
    key: `leave:${x.id}:${x.date}`,
    title: left <= 2 * MIN ? "Jetzt losgehen" : `Um ${hm(leaveAt, tz)} losgehen`,
    body: `Für ${x.title || "deine Vorlesung"} um ${x.time}: ${how}.`,
    tag: `leave-${x.date}`, url: "./?aktion=heute", ttl: 30 * 60,
  };
}
