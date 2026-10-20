/* Wetter auf „Weg zur Uni“: Vorhersage von Open-Meteo (frei, ohne Schlüssel) für Start und Ziel,
   zusammengefasst in einer Zeile wie „Regen ab 8 Uhr, Schirm mitnehmen · 9 °C“. */
import { CAMPUSES, HOME, isOnline } from "./transit.js";

const BASE = "https://api.open-meteo.com/v1/forecast";
const HOUR = 3600000;

/* Koordinaten auf etwa 1 km runden: genauer braucht es das Wetter nicht, und der Standort bleibt grob */
const round = (x) => Math.round(Number(x) * 100) / 100;

/** Orte fürs Wetter: Start (Zorneding oder Standort „Breite,Länge“) und Ziel-Campus */
export function weatherPlaces(c, pos = "") {
  const [lat, lon] = String(pos || "").split(",").map(Number);
  const here = c.mode === "car" && c.car.fromHere && Number.isFinite(lat) && Number.isFinite(lon);
  const campus = CAMPUSES.find((k) => k.id === (c.mode === "car" ? c.car.campus : "garching")) || CAMPUSES[0];
  return {
    start: here ? { name: "Standort", lat: round(lat), lon: round(lon) } : { name: HOME.name, lat: HOME.lat, lon: HOME.lon },
    goal: { name: campus.short || campus.name, lat: campus.lat, lon: campus.lon },
  };
}

/** Eine Abfrage für beide Orte (Open-Meteo nimmt mehrere Koordinaten durch Komma getrennt) */
export const forecastUrl = (places) => `${BASE}?latitude=${places.map((p) => p.lat).join(",")}&longitude=${places.map((p) => p.lon).join(",")}`
  + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timeformat=unixtime&timezone=Europe%2FBerlin&forecast_days=4";

/** Antwort in je Ort eine Liste von Stunden { t (ms), temp, prob, mm, code } */
export function parseForecast(json) {
  return (Array.isArray(json) ? json : [json]).map((loc) => {
    const h = loc?.hourly || {};
    return (h.time || []).map((t, i) => ({ t: t * 1000, temp: h.temperature_2m?.[i], prob: h.precipitation_probability?.[i] ?? 0, mm: h.precipitation?.[i] ?? 0, code: h.weather_code?.[i] ?? 0 }));
  });
}

/* WMO-Wettercodes: 51–57 Niesel, 61–67/80–82 Regen, 71–77/85–86 Schnee, 95–99 Gewitter */
const kindOf = (code) => (code >= 95 ? "Gewitter" : (code >= 71 && code <= 77) || code === 85 || code === 86 ? "Schnee" : code >= 51 && code <= 57 ? "Nieselregen" : "Regen");
const wet = (h) => h.mm >= 0.1 || h.prob >= 50 || h.code >= 51;
const maybe = (h) => h.prob >= 30;
const ICON = { Gewitter: "storm", Schnee: "snow", Nieselregen: "rain", Regen: "rain" };

/**
 * Lage zwischen from und to (ms): Stunden, die das Fenster berühren.
 * @returns null (keine Vorhersage für die Zeit) oder { text, temp, icon }
 */
export function summarize(hours, from, to = from + HOUR) {
  const list = (hours || []).filter((h) => h.t + HOUR > from && h.t < to).sort((a, b) => a.t - b.t);
  if (!list.length || list[0].t > from || typeof list[0].temp !== "number") return null;
  const temp = Math.round(list[0].temp);
  const hit = list.find(wet), soft = !hit && list.find(maybe);
  const at = (h) => (h === list[0] ? "" : ` ab ${new Date(h.t).getHours()} Uhr`);
  if (hit) {
    const kind = kindOf(hit.code);
    return { text: `${kind}${at(hit)}, ${kind === "Schnee" ? "warm anziehen" : "Schirm mitnehmen"}`, temp, icon: ICON[kind] };
  }
  if (soft) return { text: `Regen möglich${at(soft)}, Schirm einpacken`, temp, icon: "cloud" };
  return { text: "trocken", temp, icon: list[0].code <= 1 ? "sun" : "cloud" };
}

export const weatherLine = (s) => `${s.text} · ${s.temp} °C`;

const at = (date, hm) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
const HM = /^\d{2}:\d{2}$/;

/** Rückfahrt: Ende des letzten Termins vor Ort an diesem Tag (ohne Ende: 90 Minuten nach Beginn) */
export function returnAt(sessions, day) {
  const ends = (sessions || []).filter((s) => s.date === day && !s.cancelled && HM.test(s.start || "") && !isOnline(s))
    .map((s) => (HM.test(s.end || "") && s.end > s.start ? at(day, s.end) : at(day, s.start) + 90 * 60000));
  return ends.length ? Math.max(...ends) : null;
}

/** Losgeh-Zeit ohne Echtzeit-Empfehlung: grob aus Puffer, Fahrzeit und Fußweg */
export function estimateLeave(session, c) {
  const min = c.mode === "car" ? c.buffer + (Number(c.car.park) || 0) + 40
    : c.buffer + c.travel + c.walk + (c.feeder ? c.feeder.travel + c.feeder.transfer : 0);
  return at(session.date, session.start) - min * 60000;
}
