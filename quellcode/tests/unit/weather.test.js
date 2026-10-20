import { describe, it, expect } from "vitest";
import { commuteOf, DEFAULT_COMMUTE } from "../../src/lib/transit.js";
import { estimateLeave, forecastUrl, parseForecast, returnAt, summarize, weatherLine, weatherPlaces } from "../../src/lib/weather.js";

const DAY = "2026-10-20";
const t = (hm) => new Date(`${DAY}T${hm}:00`).getTime();
/* Stunden ab 6 Uhr; je Stunde [Temperatur, Regenwahrscheinlichkeit, mm, Wettercode] */
const hours = (list) => list.map(([temp, prob, mm, code], i) => ({ t: t(`${String(6 + i).padStart(2, "0")}:00`), temp, prob, mm, code }));

describe("Wetter: Zusammenfassung", () => {
  it("trocken mit Temperatur zur Losgeh-Zeit", () => {
    const h = hours([[8.6, 0, 0, 0], [9.4, 10, 0, 1], [11, 0, 0, 2]]);
    expect(summarize(h, t("07:47"))).toEqual({ text: "trocken", temp: 9, icon: "sun" });
    expect(weatherLine(summarize(h, t("07:47")))).toBe("trocken · 9 °C");
    expect(summarize(h, t("08:10")).icon).toBe("cloud");
  });
  it("Regen ab der nächsten Stunde: Schirm mitnehmen", () => {
    const h = hours([[8, 10, 0, 3], [9, 20, 0, 3], [9, 80, 1.2, 61]]);
    expect(summarize(h, t("07:47"))).toEqual({ text: "Regen ab 8 Uhr, Schirm mitnehmen", temp: 9, icon: "rain" });
    expect(summarize(h, t("08:05")).text).toBe("Regen, Schirm mitnehmen");
  });
  it("Regen erst nach dem Fenster zählt nicht", () => {
    const h = hours([[8, 0, 0, 0], [9, 0, 0, 0], [9, 0, 0, 0], [9, 90, 2, 63]]);
    expect(summarize(h, t("07:00")).text).toBe("trocken");
  });
  it("Schnee, Gewitter, Niesel und nur möglicher Regen", () => {
    expect(summarize(hours([[-1, 70, 0.5, 73]]), t("06:30"))).toMatchObject({ text: "Schnee, warm anziehen", temp: -1, icon: "snow" });
    expect(summarize(hours([[20, 60, 3, 95]]), t("06:30"))).toMatchObject({ text: "Gewitter, Schirm mitnehmen", icon: "storm" });
    expect(summarize(hours([[10, 40, 0.1, 53]]), t("06:30")).text).toBe("Nieselregen, Schirm mitnehmen");
    expect(summarize(hours([[10, 10, 0, 2], [10, 35, 0, 3]]), t("06:30"))).toMatchObject({ text: "Regen möglich ab 7 Uhr, Schirm einpacken", icon: "cloud" });
  });
  it("ohne Vorhersage für die Zeit: nichts", () => {
    const h = hours([[8, 0, 0, 0]]);
    expect(summarize(h, t("05:30"))).toBeNull();
    expect(summarize(h, t("09:00"))).toBeNull();
    expect(summarize([], t("07:00"))).toBeNull();
  });
});

describe("Wetter: Orte und Zeiten", () => {
  const c = commuteOf({ commute: DEFAULT_COMMUTE });
  it("Öffis: Zorneding und Garching, Auto: Standort gerundet und gewählter Campus", () => {
    expect(weatherPlaces(c)).toEqual({ start: { name: "Zorneding", lat: 48.08, lon: 11.83 }, goal: { name: "Garching", lat: 48.26, lon: 11.67 } });
    const car = commuteOf({ commute: { ...DEFAULT_COMMUTE, mode: "car", car: { campus: "weihenstephan", fromHere: true } } });
    expect(weatherPlaces(car, "48.1372,11.5761")).toEqual({ start: { name: "Standort", lat: 48.14, lon: 11.58 }, goal: { name: "Weihenstephan", lat: 48.4, lon: 11.72 } });
    expect(weatherPlaces(car, "").start.name).toBe("Zorneding");
    /* Öffis fahren immer nach Garching, auch wenn fürs Auto Weihenstephan gewählt ist */
    expect(weatherPlaces({ ...car, mode: "transit" }).goal.name).toBe("Garching");
  });
  it("eine Abfrage für beide Orte", () => {
    const p = weatherPlaces(c);
    expect(forecastUrl([p.start, p.goal])).toBe("https://api.open-meteo.com/v1/forecast?latitude=48.08,48.26&longitude=11.83,11.67&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timeformat=unixtime&timezone=Europe%2FBerlin&forecast_days=4");
  });
  it("Antwort für einen und mehrere Orte", () => {
    const loc = { hourly: { time: [1792476000], temperature_2m: [9.1], precipitation_probability: [null], precipitation: [0.4], weather_code: [61] } };
    expect(parseForecast(loc)).toEqual([[{ t: 1792476000000, temp: 9.1, prob: 0, mm: 0.4, code: 61 }]]);
    expect(parseForecast([loc, {}])).toHaveLength(2);
    expect(parseForecast([loc, {}])[1]).toEqual([]);
  });
  it("Rückfahrt nach dem letzten Termin vor Ort", () => {
    const s = [
      { date: DAY, start: "09:15", end: "10:45" }, { date: DAY, start: "12:00", end: "13:30" },
      { date: DAY, start: "15:00", end: "16:30", room: "Zoom" }, { date: DAY, start: "17:00", end: "18:00", cancelled: true },
      { date: "2026-10-21", start: "08:00", end: "20:00" },
    ];
    expect(returnAt(s, DAY)).toBe(t("13:30"));
    expect(returnAt([{ date: DAY, start: "14:00" }], DAY)).toBe(t("15:30"));
    expect(returnAt(s, "2026-10-22")).toBeNull();
  });
  it("Losgeh-Zeit ohne Echtzeit grob geschätzt", () => {
    const session = { date: DAY, start: "09:15" };
    expect(estimateLeave(session, c)).toBe(t("07:58")); /* 10 Puffer + 50 Bus + 8 S6 + 4 Umstieg + 5 Fußweg */
    expect(estimateLeave(session, { ...c, mode: "car" })).toBe(t("08:15")); /* 10 + 10 Parken + 40 */
  });
});
