import { describe, it, expect } from "vitest";
import { gopStatus, gradeForecast, roomUrl } from "../../src/lib/tum.js";
import { dishesOn, isoWeek, menuDay, menuUrl, mensaOf } from "../../src/lib/mensa.js";
import { applyMoodle, cleanTitle, dueOf, isMoodleDeadline, unmappedCourses } from "../../src/lib/moodle.js";
import { parseICS } from "../../src/lib/ics.js";
import { emptyData } from "../../src/lib/data.js";

describe("NavigaTUM", () => {
  it("Raumnummer aus TUMonline → Raumseite, sonst Suche", () => {
    expect(roomUrl("MI HS 1, Friedrich L. Bauer Hörsaal (5602.EG.001)")).toBe("https://nav.tum.de/room/5602.EG.001");
    expect(roomUrl("Interims I, HS 2")).toBe("https://nav.tum.de/search?q=Interims%20I");
    expect(roomUrl("")).toBeNull();
  });
});

describe("GOP und Prognose", () => {
  const d = { ...emptyData(), exams: [{ id: "x", moduleId: "era", date: "2027-02-12" }], modules: [
    { id: "eidi", name: "EIDI", code: "CIT123001", ects: 12, status: "belegt", expectedGrade: 2.0 },
    { id: "era", name: "ERA", code: "IN0004", ects: 8, status: "belegt" },
    { id: "ds", name: "DS", ects: 8, status: "bestanden", gop: true, grade: 1.7 },
    { id: "la", name: "LA", ects: 8, status: "geplant", expectedGrade: "3,0" },
  ] };
  it("zählt bestandene GOP-ECTS und nennt Kombinationen", () => {
    const g = gopStatus(d);
    expect([g.passed, g.need, g.reached, g.enough]).toEqual([8, 4, false, true]);
    expect(g.combos.map((c) => c.map((m) => m.id))).toEqual([["eidi"], ["era"]]);
    expect(g.open.find((m) => m.id === "era").exam.date).toBe("2027-02-12");
  });
  it("ohne GOP-Module keine Karte", () => expect(gopStatus({ ...emptyData(), modules: [{ id: "a", name: "A", ects: 5 }] })).toBeNull());
  it("Schnitt jetzt und mit erwarteten Noten", () => {
    const f = gradeForecast(d);
    expect(f.current).toBeCloseTo(1.7);
    expect(f.forecast).toBeCloseTo((1.7 * 8 + 2 * 12 + 3 * 8) / 28);
  });
});

describe("Mensa", () => {
  it("ISO-Woche und URL", () => {
    expect(isoWeek("2026-10-19")).toEqual({ year: 2026, week: 43 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(menuUrl("mensa-garching", "2026-10-19")).toBe("https://tum-dev.github.io/eat-api/mensa-garching/2026/43.json");
  });
  it("Gerichte mit Preis und Kennzeichnung", () => {
    const week = { days: [{ date: "2026-10-19", dishes: [
      { name: "Pasta", dish_type: "Pasta", labels: ["VEGETARIAN", "GLUTEN"], prices: { students: { base_price: 0, price_per_unit: 0.9, unit: "100g" } } },
      { name: "Schnitzel", dish_type: "Fleisch", labels: ["PORK"], prices: { students: { base_price: 3.5, price_per_unit: 0, unit: null } } },
    ] }] };
    expect(dishesOn(week, "2026-10-19")).toEqual([
      { name: "Pasta", type: "Pasta", price: "0,90 €/100g", diet: "vegetarisch" },
      { name: "Schnitzel", type: "Fleisch", price: "3,50 €", diet: "Fleisch" },
    ]);
    expect(dishesOn(week, "2026-10-20")).toEqual([]);
  });
  it("zeigt nachmittags und am Wochenende den nächsten Werktag", () => {
    expect(menuDay(new Date(2026, 9, 19, 11, 0))).toEqual({ date: "2026-10-19", label: "heute" });
    expect(menuDay(new Date(2026, 9, 19, 16, 0))).toEqual({ date: "2026-10-20", label: "morgen" });
    expect(menuDay(new Date(2026, 9, 17, 10, 0)).date).toBe("2026-10-19");
  });
  it("an der TUM standardmäßig Garching, abschaltbar", () => {
    expect(mensaOf({ university: "TUM" })).toBe("mensa-garching");
    expect(mensaOf({ university: "LMU" })).toBe("");
    expect(mensaOf({ university: "TUM", mensa: "" })).toBe("");
  });
});

const MOODLE = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:101@moodle.tum.de
SUMMARY:Hausaufgabe 3 ist fällig
DTSTART:20261028T225900Z
DTEND:20261028T225900Z
CATEGORIES:Diskrete Strukturen (IN0015)
END:VEVENT
BEGIN:VEVENT
UID:102@moodle.tum.de
SUMMARY:Hausaufgabe 4 öffnet
DTSTART:20261029T080000Z
CATEGORIES:Diskrete Strukturen (IN0015)
END:VEVENT
BEGIN:VEVENT
UID:103@moodle.tum.de
SUMMARY:Blatt 2 ist fällig
DTSTART:20261031T230000Z
CATEGORIES:WiSe26 EIDI
END:VEVENT
BEGIN:VEVENT
UID:104@moodle.tum.de
SUMMARY:Blatt 1 ist fällig
DTSTART:20261010T100000Z
CATEGORIES:WiSe26 EIDI
END:VEVENT
END:VCALENDAR`;

describe("Moodle-Abgaben", () => {
  const events = parseICS(MOODLE);
  it("erkennt Abgaben, Kurse, Titel und Mitternacht", () => {
    expect(events.filter(isMoodleDeadline).map((e) => cleanTitle(e.summary))).toEqual(["Blatt 1", "Hausaufgabe 3", "Blatt 2"]);
    expect(unmappedCourses(events, {})).toEqual(["Diskrete Strukturen (IN0015)", "WiSe26 EIDI"]);
    const b2 = events.find((e) => e.uid.startsWith("103"));
    expect(dueOf(b2)).toEqual({ due: "2026-10-31", dueTime: "23:59" }); /* 01.11. 00:00 MEZ */
  });
  it("legt an, aktualisiert, respektiert eigene Änderungen und Löschungen", () => {
    const map = { "Diskrete Strukturen (IN0015)": "ds", "WiSe26 EIDI": "__skip" };
    const d0 = { ...emptyData(), modules: [{ id: "ds", name: "Diskrete Strukturen" }] };
    const r1 = applyMoodle(d0, events, map, "2026-10-20");
    expect(r1.homework).toHaveLength(1);
    expect(r1.homework[0]).toMatchObject({ title: "Hausaufgabe 3", due: "2026-10-28", dueTime: "23:59", moduleId: "ds", feedKey: "moodle|101@moodle.tum.de" });
    const moved = events.map((e) => (e.uid.startsWith("101") ? { ...e, date: "2026-10-29" } : e));
    expect(applyMoodle({ ...d0, homework: r1.homework }, moved, map, "2026-10-20").homework[0].due).toBe("2026-10-29");
    const locked = [{ ...r1.homework[0], due: "2026-11-02", locked: ["due"] }];
    expect(applyMoodle({ ...d0, homework: locked }, moved, map, "2026-10-20").homework[0].due).toBe("2026-11-02");
    expect(applyMoodle(d0, events, map, "2026-10-20", ["moodle|101@moodle.tum.de"]).homework).toHaveLength(0);
  });
});
