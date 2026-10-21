import { describe, it, expect } from "vitest";
import { fits, HOMEWARD, homeArrival, homeCar, homeLines, homeQueries, homeTrips, homewardNow } from "../../src/lib/homeward.js";
import { commuteOf, LEGACY_COMMUTE, matches } from "../../src/lib/transit.js";

const at = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const D = "2026-10-19";
const bus = (hm, extra = {}) => ({ line: "230", destination: "Haar (S)", type: "REGIONAL_BUS", time: at(D, hm), delay: 0, cancelled: false, ...extra });
const s = (line, dest, hm, extra = {}) => ({ line, destination: dest, type: "SBAHN", time: at(D, hm), delay: 0, cancelled: false, ...extra });

describe("Heimweg nach Zorneding", () => {
  it("fester Weg: 230 ab Garching-Forschungszentrum Richtung Haar, dort S6 (oder S4) nach Zorneding", () => {
    expect(HOMEWARD).toMatchObject({ to: "Zorneding", station: { id: "de:09184:460" }, line: "230", conn: { station: { id: "de:09184:2140" } } });
    expect(matches(bus("16:00"), HOMEWARD)).toBe(true);
    expect(matches({ line: "230", destination: "Garching, Forschungszentrum (U)" }, HOMEWARD)).toBe(false);
    expect(matches({ line: "292", destination: "Haar (S)" }, HOMEWARD)).toBe(false);
    for (const dest of ["Ebersberg", "Grafing-Bahnhof", "Zorneding"]) expect(fits(s("S6", dest, "17:00"), HOMEWARD.conn)).toBe(true);
    expect(fits(s("S4", "Zorneding", "17:00"), HOMEWARD.conn)).toBe(true);
    expect(fits(s("S6", "Tutzing", "17:00"), HOMEWARD.conn)).toBe(false);
    expect(fits(s("S4", "Geltendorf", "17:00"), HOMEWARD.conn)).toBe(false);
    expect(homeLines()).toEqual(["230", "S6", "S4"]);
  });

  it("mehrere Linien beim Abgleich, eine Linie wie beim Hinweg", () => {
    const c = commuteOf({ commute: LEGACY_COMMUTE });
    expect(fits({ line: "S4", destination: "Leuchtenbergring" }, c.feeder)).toBe(false);
    expect(fits({ line: "S6", destination: "Leuchtenbergring" }, c.feeder)).toBe(true);
    expect(fits({ line: "S6", destination: "Grafing-Bahnhof" }, c.feeder)).toBe(false);
  });

  it("zu jedem Bus der erste erreichbare Anschluss in Haar (50 Min. Fahrt, 4 Min. Umstieg, 8 Min. S-Bahn)", () => {
    const buses = [bus("15:40"), bus("16:00", { cancelled: true }), bus("16:20", { time: at(D, "16:22"), delay: 2 }), bus("16:40"), { line: "292", destination: "Haar (S)", time: at(D, "16:05") }];
    const trains = [s("S6", "Tutzing", "16:35"), s("S6", "Ebersberg", "16:33"), s("S6", "Grafing-Bahnhof", "16:53", { cancelled: true }), s("S4", "Zorneding", "17:13"), s("S6", "Ebersberg", "17:16")];
    const trips = homeTrips(buses, trains, at(D, "15:45"));
    /* 15:40 schon weg, 16:00 fällt aus: 16:22 → Haar 17:12, S-Bahn ab 17:16 → Zorneding 17:24 */
    expect(trips.map((t) => [t.dep.time, t.changeAt, t.conn?.time, t.arriveAt])).toEqual([
      [at(D, "16:22"), at(D, "17:12"), at(D, "17:16"), at(D, "17:24")],
      [at(D, "16:40"), at(D, "17:30"), undefined, null], /* Anschluss noch nicht abgefragt */
    ]);
    /* 15:40 → Haar 16:30: die S6 um 16:33 ist zu knapp, die um 16:53 fällt aus, also die S4 um 17:13 */
    expect(homeTrips(buses, trains, at(D, "15:00"))[0]).toMatchObject({ conn: { line: "S4", time: at(D, "17:13") }, arriveAt: at(D, "17:21") });
    expect(homeTrips([], trains, at(D, "15:00"))).toEqual([]);
    expect(homeTrips(buses, trains, at(D, "15:00"), 1)).toHaveLength(1);
  });

  it("Abfragen: Bus ab jetzt, S-Bahn in Haar ab etwa der Ankunft", () => {
    const [b, t] = homeQueries("BUS,SBAHN");
    expect(b).toMatchObject({ kind: "departures", station: "de:09184:460", types: "BUS,SBAHN", offset: 0 });
    expect(t).toMatchObject({ kind: "departures", station: "de:09184:2140", types: "SBAHN", offset: 45 });
  });

  it("von selbst ab 30 Min. vor Ende des letzten Termins vor Ort bis 4 Stunden danach", () => {
    const ses = [{ id: "a", date: D, start: "10:15", end: "11:45" }, { id: "b", date: D, start: "14:00", end: "15:30" }, { id: "o", date: D, start: "18:00", end: "19:00", room: "Zoom" }, { id: "x", date: D, start: "16:00", end: "17:00", cancelled: true }];
    const now = (hm) => new Date(`${D}T${hm}:00`);
    expect(homewardNow(ses, now("12:00"))).toBe(false); /* nach dem Mittag kommt noch ein Termin */
    expect(homewardNow(ses, now("14:59"))).toBe(false);
    expect(homewardNow(ses, now("15:00"))).toBe(true);
    expect(homewardNow(ses, now("18:30"))).toBe(true); /* Online-Termin daheim zählt nicht */
    expect(homewardNow(ses, now("19:31"))).toBe(false);
    expect(homewardNow(ses.filter((x) => x.id === "o"), now("19:30"))).toBe(false); /* nur online: nie am Campus */
    expect(homewardNow([], now("15:00"))).toBe(false);
    /* ohne Ende: 90 Minuten */
    expect(homewardNow([{ id: "c", date: D, start: "08:00" }], now("09:00"))).toBe(true);
  });

  it("mit dem Auto: vom Campus nach Zorneding, Ankunft wenn man jetzt losgeht", () => {
    const c = commuteOf({ commute: { ...LEGACY_COMMUTE, mode: "car", car: { campus: "weihenstephan", park: 10 } } });
    expect(homeCar(c.car)).toMatchObject({ from: "Alte Akademie 8, 85354 Freising", to: "Zorneding" });
    const now = at(D, "16:00");
    expect(homeArrival({ minutes: 40 }, c.car, false, now)).toBe(at(D, "16:50"));
    expect(homeArrival({ minutes: 40 }, c.car, true, now)).toBe(at(D, "16:40")); /* ab Standort: gleich los */
    expect(homeArrival(null, c.car, false, now)).toBeNull();
  });
});
