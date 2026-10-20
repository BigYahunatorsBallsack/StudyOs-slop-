import { describe, it, expect } from "vitest";
import { LEGACY_COMMUTE, isOnline } from "../../src/lib/transit.js";
import { leaveAlert } from "../../src/server/commute.js";
import { dueReminders, zonedInstant } from "../../src/server/reminders.js";
import { deadlinesFromData } from "../../src/lib/push.js";
import { markAttended } from "../../src/lib/study.js";
import { emptyData } from "../../src/lib/data.js";

const TZ = "Europe/Berlin", DAY = "2026-10-20";
const ms = (hm) => zonedInstant(DAY, hm, TZ).getTime();
const at = (hm) => new Date(ms(hm));
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

describe("„Jetzt losgehen“: was die App hochlädt", () => {
  const base = { ...emptyData(), modules: [{ id: "ds", name: "Diskrete Strukturen" }],
    sessions: [
      { id: "a", moduleId: "ds", type: "Vorlesung", date: DAY, start: "09:15", end: "10:45", room: "MI HS 1" },
      { id: "b", moduleId: "ds", type: "Übung", date: "2026-10-21", start: "08:00", end: "10:00", room: "Online (Zoom)" },
      { id: "c", moduleId: "ds", type: "Übung", date: "2026-10-21", start: "12:00", end: "14:00", room: "MI 00.08" },
      { id: "d", moduleId: "ds", type: "Vorlesung", date: "2026-10-22", start: "10:00", end: "12:00", room: "https://tum-conf.zoom.us/j/1" },
    ] };
  const leave = (settings) => deadlinesFromData({ ...base, settings: { ...base.settings, ...settings } }, DAY).filter((x) => x.kind === "leave");

  it("ohne „Weg zur Uni“ nichts, sonst erst nach dem Einschalten", () => {
    expect(leave({ pushLeave: true })).toEqual([]);
    expect(leave({ commute: LEGACY_COMMUTE })).toEqual([]);
    expect(leave({ commute: LEGACY_COMMUTE, pushLeave: true }).length).toBe(1);
  });

  it("nur Tage, deren erster Termin vor Ort ist", () => {
    const l = leave({ commute: LEGACY_COMMUTE, pushLeave: true });
    expect(l.map((x) => [x.date, x.time, x.title])).toEqual([[DAY, "09:15", "Diskrete Strukturen"]]);
    expect(l[0].commute).toMatchObject({ mode: "transit", line: "230", buffer: 10, walk: 5, feeder: { line: "S6" } });
  });

  it("mit dem Auto gehen Start, Ziel und Parkzeit mit", () => {
    const l = leave({ commute: { ...LEGACY_COMMUTE, mode: "car" }, pushLeave: true });
    expect(l[0].commute).toEqual({ mode: "car", buffer: 10, car: { from: "Zorneding", to: "Boltzmannstraße 15, 85748 Garching bei München", park: 10 } });
    expect(leave({ commute: { ...LEGACY_COMMUTE, mode: "car", car: { from: "", to: "Garching" } }, pushLeave: true })).toEqual([]);
  });

  it("erkennt Online-Termine", () => {
    expect(isOnline({ room: "Online" })).toBe(true);
    expect(isOnline({ room: "www.zoom.us/j/1" })).toBe(true);
    expect(isOnline({ room: "", type: "Online-Übung" })).toBe(true);
    expect(isOnline({ room: "MW 2001, Rudolf-Diesel-Hörsaal" })).toBe(false);
    expect(isOnline({ room: "Interimshörsaal 1" })).toBe(false);
  });
});

describe("„Jetzt losgehen“ auf dem Server", () => {
  const transit = { mode: "transit", station: { id: "de:09184:2222" }, line: "230", towards: "Forschungszentrum", avoid: "", travel: 50, walk: 5, buffer: 10, feeder: null };
  const entry = { id: "los-" + DAY, kind: "leave", title: "Diskrete Strukturen", date: DAY, time: "09:15", commute: transit };
  const raw = (hm, delay = 0) => ({ label: "230", destination: "Garching, Forschungszentrum", transportType: "BUS", plannedDepartureTime: ms(hm), realtimeDepartureTime: ms(hm) + delay * 60000, delayInMinutes: delay, realtime: true, cancelled: false });
  const bus = (list) => async () => ok(list);

  it("meldet sich im letzten Lauf vor dem Losgehen, mit Abfahrt und Verspätung", async () => {
    // 9:15 − 10 − 50 = Bus spätestens 8:15; Bus 8:05 (+3) → 8:08, los 8:03
    const list = [raw("07:45"), raw("08:05", 3), raw("08:25")];
    expect(await leaveAlert(entry, at("07:45"), TZ, bus(list))).toBeNull(); /* noch 18 Minuten */
    const a = await leaveAlert(entry, at("07:50"), TZ, bus(list));
    expect(a).toMatchObject({ key: `leave:los-${DAY}:${DAY}`, title: "Um 08:03 losgehen", body: "Für Diskrete Strukturen um 09:15: mit dem Bus 230 um 08:08 (+3).", tag: "leave-" + DAY, ttl: 1800 });
    expect((await leaveAlert(entry, at("08:02"), TZ, bus(list))).title).toBe("Jetzt losgehen");
    expect(await leaveAlert(entry, at("08:10"), TZ, bus(list))).toBeNull(); /* verpasst */
  });

  it("fragt außerhalb des Fensters die MVG gar nicht erst", async () => {
    let called = 0;
    expect(await leaveAlert(entry, at("05:00"), TZ, async () => { called++; return ok([]); })).toBeNull();
    expect(called).toBe(0);
  });

  it("mit dem Auto: Fahrzeit mit Verkehr, nur mit Schlüssel", async () => {
    const car = { ...entry, commute: { mode: "car", buffer: 10, car: { from: "48.0868,11.8259", to: "48.2656,11.6698", park: 10 } } };
    const route = async () => ok({ routes: [{ duration: "2700s", staticDuration: "2160s" }] });
    // 9:15 − 10 − 10 − 45 = 8:10
    expect(await leaveAlert(car, at("07:58"), TZ, route, {})).toBeNull();
    const a = await leaveAlert(car, at("07:58"), TZ, route, { GOOGLE_MAPS_KEY: "g" });
    expect(a).toMatchObject({ title: "Um 08:10 losgehen", body: "Für Diskrete Strukturen um 09:15: mit dem Auto 45 Min. wegen Verkehr (sonst 36)." });
    expect(await leaveAlert(car, at("07:30"), TZ, route, { GOOGLE_MAPS_KEY: "g" })).toBeNull();
  });
});

describe("Abends „Heute besucht?“", () => {
  const d = { ...emptyData(), modules: [{ id: "m", name: "Analysis", ects: 5, status: "belegt" }],
    sessions: [
      { id: "a", moduleId: "m", type: "Vorlesung", date: DAY, start: "10:00", end: "12:00" },
      { id: "b", moduleId: "m", type: "Übung", date: DAY, start: "14:00", end: "15:30" },
      { id: "c", moduleId: "m", type: "Übung", date: DAY, start: "08:00", end: "09:00", attended: true },
      { id: "e", moduleId: "m", type: "Tutorium", date: DAY, start: "19:00", end: "20:30" },
      { id: "f", moduleId: "m", type: "Vorlesung", date: "2026-10-21", start: "10:00", end: "12:00", cancelled: true },
    ] };
  const attend = (settings = {}) => deadlinesFromData({ ...d, settings: { ...d.settings, ...settings } }, DAY).filter((x) => x.kind === "attend");

  it("listet noch nicht abgehakte Termine, die bis 19 Uhr vorbei sind", () => {
    expect(attend()).toEqual([{ id: `attend-${DAY}`, kind: "attend", title: "2 Termine", date: DAY, time: "19:00", body: "10:00 Analysis (Vorlesung), 14:00 Analysis (Übung)" }]);
    expect(attend({ pushAttended: false })).toEqual([]);
  });

  it("Push um 19 Uhr mit Knopf „Alle besucht“", () => {
    const [x] = attend();
    expect(dueReminders([x], {}, at("18:55"), TZ)).toEqual([]);
    const [r] = dueReminders([x], {}, at("19:05"), TZ);
    expect(r).toMatchObject({ title: "Heute besucht?", body: x.body, url: "./?aktion=heute" });
    expect(r.actions).toEqual([{ action: "attended", title: "Alle besucht", url: `./?aktion=push&tun=besucht&tag=${DAY}` }]);
    expect(dueReminders([x], {}, at("23:00"), TZ)).toEqual([]); /* zu spät */
  });

  it("„Alle besucht“ hakt ab wie in der App und zählt die Lernzeit", () => {
    const r = markAttended(d, ["a", "b", "c"], DAY);
    expect(r.sessions.filter((s) => s.attended).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(r.logs.map((l) => [l.sessionId, l.kind, l.minutes])).toEqual([["a", "Besucht", 120], ["b", "Besucht", 90]]);
    expect(markAttended(r, ["a"], DAY)).toBe(r); /* schon besucht: unverändert */
  });
});
