import { describe, expect, it } from "vitest";
import { lecturePeriods, semWeek, semWeekLabel } from "../../src/lib/semweek.js";
import { clampHour, clashesOf } from "../../src/lib/gridmove.js";

describe("Wochenraster: Überschneidungen und Zoom", () => {
  it("findet überlappende Einträge, ohne ausgefallene und ohne bloßes Aneinanderstoßen", () => {
    const a = { id: "a", start: "10:00", end: "12:00" }, b = { id: "b", start: "11:30", end: "13:00" };
    const c = { id: "c", start: "12:00", end: "14:00" }, x = { id: "x", start: "10:00", end: "11:00", cancelled: true };
    const m = clashesOf([a, b, c, x]);
    expect(m.get("a")).toEqual([b]);
    expect(m.get("b")).toEqual([a, c]);
    expect(m.get("c")).toEqual([b]);
    expect(m.has("x")).toBe(false);
  });
  it("begrenzt die Stundenhöhe", () => {
    expect([10, 46.4, 500, "x"].map(clampHour)).toEqual([24, 46, 140, 24]);
  });
});

const TUM = { settings: { university: "TUM" } };

describe("Kalender- und Vorlesungswoche", () => {
  it("zählt an der TUM die Vorlesungswochen ohne die Weihnachtspause", () => {
    expect(semWeekLabel("2026-10-20", TUM)).toBe("KW 43 · VL-Woche 2 von 16");
    expect(semWeekLabel("2026-11-04", TUM)).toBe("KW 45 · VL-Woche 4 von 16");
    expect(semWeek("2026-12-30", TUM)).toMatchObject({ week: null, off: true });
    expect(semWeekLabel("2026-12-30", TUM)).toBe("KW 53 · vorlesungsfrei");
    expect(semWeek("2027-01-05", TUM)).toMatchObject({ week: 12, total: 16 });
    expect(semWeekLabel("2027-02-04", TUM)).toBe("KW 5 · VL-Woche 16 von 16");
    expect(semWeekLabel("2027-03-01", TUM)).toBe("KW 9 · vorlesungsfrei");
    expect(semWeekLabel("2027-04-14", TUM)).toBe("KW 15 · VL-Woche 1 von 14");
  });
  it("ohne bekannte Vorlesungszeit nur die Kalenderwoche", () => {
    expect(semWeekLabel("2026-10-20", { settings: { university: "LMU" } })).toBe("KW 43");
    expect(semWeekLabel("2026-10-20", { settings: { ...TUM.settings, tumBreaks: false } })).toBe("KW 43");
  });
  it("nimmt die Lücke zwischen eigenen Ferien als Vorlesungszeit", () => {
    const data = { settings: { breaks: [{ from: "2026-08-01", to: "2026-10-11" }, { from: "2027-02-01", to: "2027-03-31" }] } };
    expect(lecturePeriods(data)).toEqual([{ from: "2026-10-12", to: "2027-01-31" }]);
    expect(semWeekLabel("2026-10-28", data)).toBe("KW 44 · VL-Woche 3 von 16");
    expect(semWeekLabel("2026-09-01", data)).toBe("KW 36 · vorlesungsfrei");
  });
  it("Semesterbeginn aus den Modulen, Ende vor den nächsten Ferien oder offen", () => {
    const mods = [{ status: "belegt", semesterStart: "2026-10-14" }, { status: "bestanden", semesterStart: "2025-10-01" }];
    expect(semWeekLabel("2026-10-28", { settings: {}, modules: mods })).toBe("KW 44 · VL-Woche 3");
    const withBreak = { settings: { breaks: [{ from: "2027-02-08", to: "2027-04-11" }] }, modules: mods };
    expect(semWeek("2026-10-28", withBreak)).toMatchObject({ week: 3, total: 17 });
  });
});
