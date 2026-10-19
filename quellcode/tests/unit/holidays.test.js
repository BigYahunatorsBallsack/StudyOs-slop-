import { describe, expect, it } from "vitest";
import { cancelOffDays, easter, holidayOf, inBreak, offDay } from "../../src/lib/holidays.js";
import { buildWeeklySeries } from "../../src/lib/data.js";
import { buildHomeworkSeries } from "../../src/lib/study.js";

const TUM = { university: "TUM" };

describe("Feiertage und vorlesungsfreie Zeit", () => {
  it("berechnet Ostern und die beweglichen Feiertage", () => {
    expect([2026, 2027, 2028].map(easter)).toEqual(["2026-04-05", "2027-03-28", "2028-04-16"]);
    expect(holidayOf("2027-03-26")).toBe("Karfreitag");
    expect(holidayOf("2027-05-27")).toBe("Fronleichnam");
    expect(holidayOf("2026-11-01")).toBe("Allerheiligen");
    expect(holidayOf("2026-11-02")).toBeNull();
  });
  it("kennt Weihnachtspause und Semesterferien an der TUM, eigene Zeiträume überall", () => {
    expect(offDay("2026-12-28", TUM)).toEqual({ kind: "break", label: "Weihnachtspause" });
    expect(offDay("2026-12-28", { university: "LMU" })).toBeNull();
    expect(offDay("2026-12-28", { ...TUM, christmasBreak: false })).toBeNull();
    expect(inBreak("2027-03-01", TUM)).toBe(true);
    expect(inBreak("2027-03-01", { ...TUM, tumBreaks: false })).toBe(false);
    const own = { university: "LMU", breaks: [{ from: "2026-11-16", to: "2026-11-20", label: "Exkursion" }] };
    expect(offDay("2026-11-18", own)).toEqual({ kind: "break", label: "Exkursion" });
    expect(offDay("2026-11-01", own).label).toBe("Allerheiligen"); /* Feiertage gelten überall */
  });
  it("Serien überspringen Feiertage und Ferien, Blätter zählen ohne Lücke weiter", () => {
    const ses = buildWeeklySeries({ moduleId: "m", type: "Vorlesung", date: "2026-12-17", start: "10:00", end: "12:00" }, "2027-01-14", TUM);
    expect(ses.map((s) => s.date)).toEqual(["2026-12-17", "2027-01-07", "2027-01-14"]);
    const hw = buildHomeworkSeries({ title: "Blatt 12", due: "2027-01-29" }, "2027-04-23", TUM);
    expect(hw.map((h) => [h.title, h.due])).toEqual([["Blatt 12", "2027-01-29"], ["Blatt 13", "2027-02-05"], ["Blatt 14", "2027-04-16"], ["Blatt 15", "2027-04-23"]]);
  });
  it("selbst angelegte künftige Termine an freien Tagen fallen einmal aus", () => {
    const sessions = [
      { id: "a", date: "2026-11-01", type: "Übung" },
      { id: "b", date: "2026-11-01", type: "Vorlesung", feedKey: "x" },
      { id: "c", date: "2026-10-03", type: "Vorlesung" },
      { id: "d", date: "2026-11-04", type: "Vorlesung" },
      { id: "e", date: "2026-11-01", type: "Vorlesung", offChecked: true },
    ];
    const r = cancelOffDays(sessions, TUM, "2026-10-20");
    expect(r.count).toBe(1);
    expect(r.sessions[0]).toMatchObject({ cancelled: true, offChecked: true, offReason: "Allerheiligen" });
    expect(r.sessions.slice(1)).toEqual(sessions.slice(1));
    expect(cancelOffDays(r.sessions, TUM, "2026-10-20").count).toBe(0);
  });
});
