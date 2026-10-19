/* Weg zur Uni, auf dem Server: Vor der Abfahrt prüft der Erinnerungslauf (alle 15 Minuten) die Echtzeit.
   Muss man wegen Verspätung oder Ausfall früher los als nach Fahrplan, gibt es eine Push-Nachricht. */
import { recommend } from "../lib/transit.js";
import { mvg } from "./mvg.js";
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

/**
 * Prüft einen Eintrag { kind: "commute", id, title, date, time, commute } zur Zeit `now`.
 * @returns null oder { key, title, body, tag, url }
 */
export async function commuteAlert(x, now, tz, fetchImpl) {
  const c = x.commute;
  if (!c || !c.station || !c.station.id || !/^\d{2}:\d{2}$/.test(x.time || "")) return null;
  const w = commuteWindow(x, tz), t = now.getTime();
  if (t < w.from || t > w.to) return null;
  const offset = (ms) => Math.max(0, Math.round((ms - t) / MIN) - 45);
  const mainLatest = w.start - (c.buffer + c.travel) * MIN;
  const main = await mvg({ kind: "departures", station: c.station.id, types: TYPES, offset: offset(mainLatest), limit: 60 }, fetchImpl);
  if (main.error) return null;
  let feeder = null;
  if (c.feeder && c.feeder.station && c.feeder.station.id) {
    const r = await mvg({ kind: "departures", station: c.feeder.station.id, types: TYPES, offset: offset(mainLatest - (c.feeder.transfer + c.feeder.travel) * MIN), limit: 60 }, fetchImpl);
    if (r.error) return null;
    feeder = r.data;
  }
  const session = { date: x.date, start: x.time };
  const byPlan = (list) => list && list.map((d) => ({ ...d, time: d.planned || d.time, cancelled: false }));
  const plan = recommend(byPlan(main.data), session, c, byPlan(feeder), w.start);
  if (!plan) return null; /* schon nach Fahrplan keine Verbindung: nichts zu vergleichen */
  const real = recommend(main.data, session, c, feeder, w.start);
  if (real && plan.leaveAt - real.leaveAt < EARLIER_MS) return null;
  const why = reason(plan, main.data, feeder, tz);
  const what = `${x.title || "deine Vorlesung"} um ${x.time}`;
  return {
    key: `commute:${x.id}:${x.date}:${real ? hm(real.leaveAt, tz) : "keine"}`,
    title: real ? `Früher los: ${hm(real.leaveAt, tz)}` : "Keine passende Verbindung",
    body: real ? `Für ${what} um ${hm(real.leaveAt, tz)} statt ${hm(plan.leaveAt, tz)} losgehen${why ? ` (${why})` : ""}.` : `Für ${what} passt laut Echtzeit keine Verbindung mehr${why ? ` (${why})` : ""}.`,
    tag: `commute-${x.date}`, url: "./?aktion=heute",
  };
}
