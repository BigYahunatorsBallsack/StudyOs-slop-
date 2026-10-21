import { describe, expect, it } from "vitest";
import { TUM_DATES, upcomingUniDates, uniDates, uniDatesOn } from "../../src/lib/tumdates.js";
import { TUM_LECTURES } from "../../src/lib/semweek.js";
import { BUSY_HW, semesterSpan, semesterWeeks } from "../../src/lib/semester.js";
import { buildICS } from "../../src/lib/ics.js";
import { morningBody } from "../../src/lib/push.js";

const TUM = { university: "TUM" };

describe("TUM-Semestertermine als Fristen", () => {
  it("nur an der TUM und abschaltbar", () => {
    expect(uniDates(TUM).length).toBeGreaterThan(TUM_DATES.length);
    expect(uniDates({ university: "LMU" })).toEqual([]);
    expect(uniDates({ ...TUM, tumDates: false })).toEqual([]);
  });
  it("passt zur Vorlesungszeit", () => {
    const starts = TUM_DATES.filter((x) => /Vorlesungsbeginn/.test(x.title)).map((x) => x.date);
    const ends = TUM_DATES.filter((x) => /Vorlesungsende/.test(x.title)).map((x) => x.date);
    expect(starts).toEqual(TUM_LECTURES.map((p) => p.from));
    expect(ends).toEqual(TUM_LECTURES.map((p) => p.to));
  });
  it("Zeiträume ergeben Beginn und Ende", () => {
    expect(uniDatesOn("2026-11-16", TUM).map((x) => x.title)).toEqual(["Prüfungsanmeldung WiSe 2026/27 beginnt"]);
    expect(uniDatesOn("2027-01-15", TUM)).toMatchObject([{ title: "Prüfungsanmeldung WiSe 2026/27 endet", end: true }]);
    expect(uniDatesOn("2027-02-15", TUM)).toMatchObject([{ kind: "fee" }]);
  });
  it("für Heute: die nächsten 14 Tage und laufende Zeiträume", () => {
    expect(upcomingUniDates(TUM, "2026-10-20")).toEqual([]);
    expect(upcomingUniDates(TUM, "2026-11-05").map((x) => x.date)).toEqual(["2026-11-16"]);
    const dec = upcomingUniDates(TUM, "2026-12-01");
    expect(dec).toMatchObject([{ running: true, to: "2027-01-15", title: "Prüfungsanmeldung WiSe 2026/27 läuft" }]);
    expect(upcomingUniDates(TUM, "2027-01-10").map((x) => x.title)).toEqual(["Prüfungsanmeldung WiSe 2026/27 endet"]);
    expect(upcomingUniDates(TUM, "2027-02-03").map((x) => x.date)).toEqual(["2027-02-05", "2027-02-15"]);
  });
  it("im Kalenderexport und im Morgen-Push", () => {
    const data = { settings: TUM, modules: [], homework: [], exams: [], sessions: [], cards: [] };
    const ics = buildICS(data);
    expect(ics).toContain("SUMMARY:Rückmeldung SoSe 2027 (Semesterbeitrag)");
    expect(buildICS(data, { uni: false })).not.toContain("uni-");
    expect(buildICS({ ...data, settings: { ...TUM, tumDates: false } })).not.toContain("uni-");
    expect(morningBody(data, "2027-02-15", () => "")).toBe("Uni: Rückmeldung SoSe 2027 (Semesterbeitrag).");
    expect(morningBody(data, "2027-02-16", () => "")).toBe("");
  });
});

describe("Semesterleiste", () => {
  const base = { settings: TUM, modules: [], sessions: [], cards: [] };
  it("nimmt an der TUM das ganze Semester", () => {
    expect(semesterSpan(base, "2026-10-20")).toMatchObject({ label: "WiSe 2026/27" });
    const weeks = semesterWeeks(base, semesterSpan(base, "2026-10-20"), "2026-10-20");
    expect(weeks[0].mon).toBe("2026-09-28");
    expect(weeks.at(-1).mon).toBe("2027-03-29");
    expect(weeks.filter((w) => w.current)).toMatchObject([{ mon: "2026-10-19", week: 2, kw: 43 }]);
    expect(weeks.filter((w) => w.week).length).toBe(16);
    expect(weeks.find((w) => w.mon === "2026-12-28")).toMatchObject({ off: true, week: null, offLabel: "Weihnachtspause" });
    expect(weeks.find((w) => w.mon === "2026-11-16").uni).toEqual(["Prüfungsanmeldung WiSe 2026/27 beginnt"]);
  });
  it("zählt Prüfungen und offene Abgaben pro Woche, merkt Feiertage", () => {
    const data = { ...base,
      exams: [{ id: "e", date: "2027-02-10" }, { id: "r", date: "2026-08-01", retakeDate: "2027-02-11", result: "nicht bestanden" }],
      homework: [{ id: "a", due: "2026-11-02" }, { id: "b", due: "2026-11-04" }, { id: "c", due: "2026-11-06" }, { id: "d", due: "2026-11-05", status: "abgegeben" }] };
    const weeks = semesterWeeks(data, semesterSpan(data, "2026-10-20"), "2026-10-20");
    expect(weeks.find((w) => w.mon === "2027-02-08").exams).toBe(2);
    expect(weeks.find((w) => w.mon === "2026-11-02").hw).toBe(BUSY_HW);
    expect(weeks.find((w) => w.mon === "2026-10-26").holidays).toEqual([]); /* Allerheiligen 2026 ist ein Sonntag */
    const sose = semesterWeeks(data, semesterSpan(data, "2027-05-01"), "2027-05-01");
    expect(sose.find((w) => w.mon === "2027-05-03")).toMatchObject({ holidays: ["Christi Himmelfahrt"], off: false });
  });
  it("ohne TUM aus der Vorlesungszeit, ohne Angaben keine Leiste", () => {
    const own = { settings: { breaks: [{ from: "2026-08-01", to: "2026-10-11" }, { from: "2027-02-01", to: "2027-03-31" }] }, modules: [], homework: [], exams: [] };
    expect(semesterSpan(own, "2026-11-01")).toEqual({ from: "2026-10-12", to: "2027-02-21", label: "Semester" });
    expect(semesterSpan({ settings: {} }, "2026-11-01")).toBeNull();
    expect(semesterWeeks({ settings: {} }, null)).toEqual([]);
  });
});
