import { describe, it, expect } from "vitest";
import { followingSimilar, saveSessionEdit } from "../../src/lib/series.js";
import { applyFeed } from "../../src/lib/feed.js";
import { parseICS } from "../../src/lib/ics.js";
import { emptyData } from "../../src/lib/data.js";

/* Montags 10:15 Vorlesung (Abo), dazu Übung am gleichen Tag und ein anderes Modul */
const S = () => [
  { id: "v1", moduleId: "ds", type: "Vorlesung", date: "2026-10-19", start: "10:15", end: "11:45", room: "HS 1", feedKey: "a|2026-10-19" },
  { id: "v2", moduleId: "ds", type: "Vorlesung", date: "2026-10-26", start: "10:15", end: "11:45", room: "HS 1", feedKey: "a|2026-10-26", prepared: true },
  { id: "v3", moduleId: "ds", type: "Vorlesung", date: "2026-11-02", start: "10:15", end: "11:45", room: "HS 1", feedKey: "a|2026-11-02", cancelled: true },
  { id: "v4", moduleId: "ds", type: "Vorlesung", date: "2026-11-09", start: "10:15", end: "11:45", room: "HS 2", feedKey: "a|2026-11-09" },
  { id: "u1", moduleId: "ds", type: "Übung", date: "2026-10-26", start: "14:00", end: "16:00", room: "Ü1" },
  { id: "x", moduleId: "la", type: "Vorlesung", date: "2026-10-26", start: "10:15", end: "11:45", room: "HS 1" },
  { id: "d", moduleId: "ds", type: "Vorlesung", date: "2026-10-21", start: "10:15", end: "11:45", room: "HS 1" }, /* Mittwoch */
];

describe("Folgende gleiche Termine", () => {
  it("findet gleiche Termine (Modul, Art, Wochentag, Beginn), ohne ausgefallene", () => {
    expect(followingSimilar(S(), S()[0]).map((x) => x.id)).toEqual(["v2", "v4"]);
    expect(followingSimilar(S(), S()[1]).map((x) => x.id)).toEqual(["v4"]);
  });
  it("erkennt selbst angelegte Serien auch bei abweichender Uhrzeit", () => {
    const s = [{ id: "a", seriesId: "q", date: "2026-10-19", start: "08:00" }, { id: "b", seriesId: "q", date: "2026-10-26", start: "09:00" }];
    expect(followingSimilar(s, s[0]).map((x) => x.id)).toEqual(["b"]);
  });
  it("überträgt nur geänderte Felder und lässt Häkchen in Ruhe", () => {
    const edited = { ...S()[0], room: "Interims I" };
    const r = saveSessionEdit(S(), edited, true);
    expect(r.count).toBe(2);
    const by = Object.fromEntries(r.sessions.map((x) => [x.id, x]));
    expect([by.v1.room, by.v2.room, by.v4.room, by.v3.room, by.x.room]).toEqual(["Interims I", "Interims I", "Interims I", "HS 1", "HS 1"]);
    expect(by.v2.prepared).toBe(true);
    expect(by.v4.end).toBe("11:45");
    expect(by.v2.locked).toEqual(["room"]);
    expect(by.u1.locked).toBeUndefined();
  });
  it("ohne Häkchen nur dieser Termin", () => {
    const r = saveSessionEdit(S(), { ...S()[0], start: "10:30" }, false);
    expect(r.count).toBe(0);
    expect(r.sessions.find((x) => x.id === "v2").start).toBe("10:15");
  });
  it("das Stundenplan-Abo überschreibt selbst geänderte Felder nicht mehr", () => {
    const edited = saveSessionEdit(S(), { ...S()[0], room: "Interims I" }, true).sessions;
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:DS VO\r\nDTSTART:20261026T101500\r\nDTEND:20261026T120000\r\nLOCATION:HS 1\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const r = applyFeed({ ...emptyData(), sessions: edited }, parseICS(ics), { "DS VO": "ds" }, "2026-10-20");
    const v2 = r.sessions.find((x) => x.id === "v2");
    expect(v2.room).toBe("Interims I"); // eigene Änderung bleibt
    expect(v2.end).toBe("12:00"); // nicht gesperrtes Feld kommt weiter aus dem Kalender
  });
});
