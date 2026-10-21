import { describe, it, expect } from "vitest";
import { hoursShort, hoursText, nextUp, sortModules, weekSummary, weekSummaryText } from "../../src/lib/overview.js";
import { sheetBars } from "../../src/lib/study.js";
import { departureChip, headerSession, transitKey } from "../../src/lib/wegcache.js";
import { commuteOf, LEGACY_COMMUTE } from "../../src/lib/transit.js";
import { matchSettings } from "../../src/lib/settings.js";
import { emptyData } from "../../src/lib/data.js";

const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const at = (hm, day = 20) => new Date(2026, 9, day, Number(hm.slice(0, 2)), Number(hm.slice(3)));

describe("Wochensumme", () => {
  const data = {
    ...emptyData(),
    sessions: [
      { id: "a", date: "2026-10-19", start: "10:00", end: "12:00" },
      { id: "b", date: "2026-10-19", start: "14:00", end: "15:30" },
      { id: "c", date: "2026-10-21", start: "08:15", end: "09:45", cancelled: true },
      { id: "d", date: "2026-10-26", start: "08:00", end: "18:00" },
    ],
    logs: [{ id: "l1", date: "2026-10-20", minutes: 90 }, { id: "l2", date: "2026-10-25", minutes: 45 }, { id: "l3", date: "2026-10-18", minutes: 600 }],
    homework: [{ id: "h1", due: "2026-10-23", status: "offen" }, { id: "h2", due: "2026-10-23", status: "abgegeben" }, { id: "h3", due: "2026-10-30" }],
  };
  it("zählt Termine ohne ausgefallene, Lernzeit und fällige Abgaben der angezeigten Tage", () => {
    const s = weekSummary(data, DAYS);
    expect([s.sessionMin, s.learnMin, s.due]).toEqual([210, 135, 2]);
    expect(s.days["2026-10-19"]).toEqual({ sessionMin: 210, learnMin: 0, due: 0 });
    expect(s.days["2026-10-21"].sessionMin).toBe(0);
    expect(weekSummaryText(s)).toEqual(["3,5 h Termine", "2,5 h gelernt", "2 Abgaben"]);
  });
  it("lässt leere Teile weg und formatiert knapp", () => {
    expect(weekSummaryText({ sessionMin: 0, learnMin: 45, due: 1 })).toEqual(["45 min gelernt", "1 Abgabe"]);
    expect(weekSummaryText({ sessionMin: 0, learnMin: 0, due: 0 })).toEqual([]);
    expect(hoursText(14 * 60 + 10)).toBe("14 h");
    expect(hoursShort(90)).toBe("1,5h");
    expect(hoursShort(45)).toBe("45′");
    expect(hoursShort(0)).toBe("");
  });
});

describe("Modulliste: als Nächstes", () => {
  const now = at("10:00", 21); /* Mittwoch */
  const data = {
    ...emptyData(),
    modules: [{ id: "a", name: "Analysis", semester: 1 }, { id: "b", name: "Betriebssysteme", semester: 3 }, { id: "c", name: "Chemie", semester: 2 }, { id: "d", name: "Datenbanken", semester: 1 }],
    homework: [
      { id: "h1", moduleId: "a", title: "Blatt 2", due: "2026-10-23", status: "offen" },
      { id: "h0", moduleId: "a", title: "Blatt 1", due: "2026-10-20", status: "abgegeben" },
      { id: "h2", moduleId: "c", title: "Protokoll", due: "2026-10-20", status: "offen" },
    ],
    exams: [{ id: "e1", moduleId: "b", date: "2026-11-30", result: "offen" }, { id: "e2", moduleId: "a", date: "2027-02-10" }],
    sessions: [{ id: "s1", moduleId: "d", type: "Vorlesung", date: "2026-10-21", start: "08:00", end: "09:30" }, { id: "s2", moduleId: "d", type: "Übung", date: "2026-10-22", start: "12:15", end: "13:45" }],
  };
  it("nimmt die früheste offene Abgabe oder Prüfung, sonst den nächsten Termin", () => {
    expect(nextUp(data, "a", now)).toMatchObject({ kind: "homework", text: "Abgabe Fr", label: "Abgabe „Blatt 2“ am Freitag" });
    expect(nextUp(data, "b", now)).toMatchObject({ kind: "exam", text: "Prüfung in 40 Tagen" });
    expect(nextUp(data, "c", now)).toMatchObject({ text: "Abgabe überfällig", urgent: true });
    expect(nextUp(data, "d", now)).toMatchObject({ kind: "session", text: "Übung morgen 12:15", urgent: false });
    expect(nextUp(data, "x", now)).toBeNull();
  });
  it("Wiederholungsprüfung und ferne Abgaben", () => {
    const d = { ...data, exams: [{ id: "e", moduleId: "b", date: "2026-08-01", result: "nicht bestanden", retakeDate: "2026-10-22" }], homework: [{ id: "h", moduleId: "a", title: "Projekt", due: "2026-11-12", status: "offen" }] };
    expect(nextUp(d, "b", now).text).toBe("Wiederholung morgen");
    expect(nextUp(d, "a", now)).toMatchObject({ text: "Abgabe 12.11.", label: "Abgabe „Projekt“ am 12.11." });
  });
  it("sortiert nach Semester oder nach Dringlichkeit", () => {
    const next = (m) => nextUp(data, m.id, now);
    expect(sortModules(data.modules, "semester", next).map((m) => m.id)).toEqual(["a", "d", "c", "b"]);
    expect(sortModules(data.modules, "dringlichkeit", next).map((m) => m.id)).toEqual(["c", "d", "a", "b"]);
    expect(sortModules([...data.modules, { id: "z", name: "Zoologie", semester: 1 }], "dringlichkeit", next).at(-1).id).toBe("z");
  });
});

describe("Punkte pro Blatt", () => {
  const base = { ...emptyData(), modules: [{ id: "m", name: "Algo", bonusPct: 50 }] };
  it("bewertete und offene Blätter in Reihenfolge, Bonusgrenze und nötiger Anteil", () => {
    const data = { ...base, homework: [
      { id: "b2", moduleId: "m", title: "Blatt 2", due: "2026-10-28", status: "bewertet", points: 4, maxPoints: 10 },
      { id: "b1", moduleId: "m", title: "Blatt 1", due: "2026-10-21", status: "bewertet", points: 9, maxPoints: 10 },
      { id: "b3", moduleId: "m", title: "Blatt 3", due: "2026-11-04", status: "offen", maxPoints: 10 },
      { id: "b4", moduleId: "m", title: "Blatt 4", due: "2026-11-11", status: "offen" },
    ] };
    const s = sheetBars(data, "m");
    expect(s.bars.map((b) => [b.short, b.points, b.max, b.graded])).toEqual([["1", 9, 10, true], ["2", 4, 10, true], ["3", null, 10, false], ["4", null, 10, false]]);
    expect(s.limit).toBe(0.5);
    expect(s.need).toBeCloseTo(7 / 20); /* 50 % von 40 = 20, 13 erreicht → 7 auf 20 offene */
  });
  it("ohne Bonus nur Blätter mit Punkten; ohne alles null", () => {
    const data = { ...emptyData(), modules: [{ id: "m", name: "Algo" }], homework: [
      { id: "a", moduleId: "m", title: "Blatt A", status: "bewertet", points: 7, maxPoints: 8 },
      { id: "b", moduleId: "m", title: "Zusatz", status: "offen" },
    ] };
    const s = sheetBars(data, "m");
    expect(s.bars.map((b) => b.id)).toEqual(["a"]);
    expect([s.limit, s.need]).toEqual([null, null]);
    expect(sheetBars({ ...data, homework: [{ id: "b", moduleId: "m", title: "Zusatz", status: "offen" }] }, "m")).toBeNull();
  });
  it("Bonus erreicht: keine Linie für den nötigen Anteil", () => {
    const data = { ...base, homework: [{ id: "a", moduleId: "m", title: "Blatt 1", status: "bewertet", points: 10, maxPoints: 10 }, { id: "b", moduleId: "m", title: "Blatt 2", status: "offen", maxPoints: 10 }] };
    expect(sheetBars(data, "m").need).toBeNull();
  });
});

describe("Abfahrt in der Kopfzeile", () => {
  const c = commuteOf({ commute: LEGACY_COMMUTE });
  const vl = { id: "s", moduleId: "ds", type: "Vorlesung", date: "2026-10-20", start: "09:15", end: "10:45", room: "MI HS 1" };
  const t = (hm) => at(hm).getTime();
  const dep = (line, destination, hm, delay = 0) => ({ line, destination, type: line === "S6" ? "SBAHN" : "REGIONAL_BUS", planned: t(hm), time: t(hm) + delay * 60000, delay, realtime: true, cancelled: false });
  const raw = {
    mainLater: [dep("230", "Garching, Forschungszentrum (U)", "07:53"), dep("230", "Garching, Forschungszentrum (U)", "08:13", 2), dep("230", "Garching, Forschungszentrum (U)", "08:33")],
    feederLater: [dep("S6", "Leuchtenbergring", "07:32"), dep("S6", "Leuchtenbergring", "07:52", 3), dep("S6", "Grafing-Bahnhof", "07:53")],
  };
  it("erster Termin vor Ort, der noch nicht begonnen hat", () => {
    const online = { ...vl, id: "o", start: "08:00", end: "09:00", room: "Zoom" };
    expect(headerSession([online, vl], at("07:00")).id).toBe("s");
    expect(headerSession([online, vl], at("09:20"))).toBeNull();
    expect(headerSession([{ ...vl, cancelled: true }], at("07:00"))).toBeNull();
  });
  it("Öffis: erstes Verkehrsmittel mit Verspätung, bis zu dessen Abfahrt", () => {
    // Bus 8:15 (8:13 +2); S6 spätestens 8:03 → 7:52 +3 = 7:55; los 7:50
    const chip = departureChip({ c, session: vl, raw, now: t("07:00") });
    expect(chip).toMatchObject({ text: "S6 07:55 (+3)", until: t("07:55"), leaveAt: t("07:50") });
    expect(chip.label).toBe("Weg zur Uni: um 07:50 losgehen, S6 um 07:55 ab Zorneding (3 Min. später), für 09:15 Uhr");
    expect(departureChip({ c, session: vl, raw, now: t("07:55") }).text).toBe("S6 07:55 (+3)");
    expect(departureChip({ c, session: vl, raw, now: t("07:57") })).toBeNull();
    expect(departureChip({ c, session: vl, raw, now: t("04:30") })).toBeNull(); /* mehr als 3 Stunden vorher */
    expect(departureChip({ c, session: vl, raw: null, now: t("07:00") })).toBeNull();
  });
  it("Auto: Losfahr-Zeit aus der Fahrzeit", () => {
    const car = { ...c, mode: "car" };
    // 9:15 − 10 Puffer − 10 Parken − 45 Fahrt = 8:10
    expect(departureChip({ c: car, session: vl, route: { minutes: 45, normal: 40, km: 38 }, now: t("07:00") }).text).toBe("Los 08:10");
    expect(departureChip({ c: car, session: vl, route: { minutes: 45 }, now: t("08:12") })).toBeNull();
    expect(departureChip({ c: car, session: vl, route: null, now: t("07:00") })).toBeNull();
  });
  it("gleicher Zwischenspeicher wie die Karte, unabhängig vom Verkehrsmittel", () => {
    expect(transitKey(c, vl)).toBe(transitKey({ ...c, mode: "car", car: { park: 3 } }, vl));
    expect(transitKey(c, vl)).toMatch(/^transit:\{.*\}:s$/);
  });
  it("Einstellung ist auffindbar", () => {
    expect(matchSettings("kopfzeile")[0]).toMatchObject({ id: "commuteHeader", group: "weg" });
    expect(matchSettings("abfahrt oben").map((h) => h.id)).toContain("commuteHeader");
  });
});
