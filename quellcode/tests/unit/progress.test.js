import { describe, it, expect } from "vitest";
import { achievements, bestStreak, cardReviews, moduleGoals, periodStats, skyPos, weakByTag, weakCards, weekCard } from "../../src/lib/progress.js";
import { emptyData } from "../../src/lib/data.js";
import { schedule, parseTags } from "../../src/lib/cards.js";

const log = (date, minutes, moduleId = "m") => ({ id: date + minutes + moduleId, date, minutes, moduleId });

describe("Erfolge", () => {
  it("längste Serie, auch wenn sie vorbei ist", () => {
    expect(bestStreak([])).toBe(0);
    expect(bestStreak([log("2026-10-01", 30), log("2026-10-02", 10), log("2026-10-03", 5), log("2026-10-05", 20), log("2026-10-05", 0)])).toBe(3);
    expect(bestStreak([log("2026-10-31", 30), log("2026-11-01", 30)])).toBe(2);
  });
  it("Wiederholungen zählen weiter, auch nach „Nochmal“", () => {
    let c = { reps: 0 };
    c = { ...c, ...schedule(c, 2, "2026-10-01") };
    c = { ...c, ...schedule(c, 0, "2026-10-05") };
    expect(c).toMatchObject({ reps: 0, reviews: 2 });
    expect(cardReviews([c, { reps: 4 }, {}])).toBe(6);
  });
  it("Fortschritt und freigeschaltete Abzeichen", () => {
    const d = { ...emptyData(), logs: [log("2026-10-01", 600), log("2026-10-02", 60), log("2026-10-03", 30)] };
    d.homework = [{ id: "h", status: "abgegeben", doneAt: "2026-10-01", due: "2026-10-03" }, { id: "i", status: "abgegeben", doneAt: "2026-10-03", due: "2026-10-03" }];
    d.settings.weeklyGoal = 10;
    const by = Object.fromEntries(achievements(d).map((b) => [b.id, b]));
    expect(by.start.done).toBe(true);
    expect(by["serie-3"].done).toBe(true);
    expect(by["serie-7"]).toMatchObject({ done: false, value: 3, goal: 7 });
    expect(by["zeit-10"]).toMatchObject({ done: true, value: 10 });
    expect(by["zeit-50"].value).toBe(11.5);
    expect(by["frueh-5"].value).toBe(1);
    expect(by.ziel.done).toBe(true);
    expect(by.bestanden.done).toBe(false);
  });
});

describe("Wochenkarte", () => {
  const d = { ...emptyData(), logs: [log("2026-10-12", 60), log("2026-10-19", 90), log("2026-10-21", 30), log("2026-10-25", 45)] };
  d.homework = [{ id: "h", doneAt: "2026-10-20", status: "abgegeben" }];
  it("nur sonntags (laufende Woche) und montags (vergangene Woche)", () => {
    expect(weekCard(d, "2026-10-22")).toBe(null);
    expect(weekCard(d, "2026-10-25")).toMatchObject({ from: "2026-10-19", to: "2026-10-25", current: true, minutes: 165, days: 3, hwDone: 1, prevMinutes: 60, bestDay: { date: "2026-10-19", minutes: 90 } });
    expect(weekCard(d, "2026-10-26")).toMatchObject({ from: "2026-10-19", current: false, minutes: 165 });
  });
  it("leere Woche: keine Karte", () => {
    expect(weekCard(d, "2026-11-08")).toBe(null);
    expect(periodStats(d, "2026-11-02", "2026-11-08").minutes).toBe(0);
  });
});

describe("Wochenziele pro Modul", () => {
  it("Lernzeit ab Montag gegen das Ziel in Stunden", () => {
    const d = { ...emptyData(), modules: [{ id: "m", name: "Analysis", weeklyGoal: 2 }, { id: "n", name: "Ohne Ziel" }, { id: "a", name: "Alt", weeklyGoal: 3, archived: true }], logs: [log("2026-10-18", 300), log("2026-10-19", 60), log("2026-10-20", 60), log("2026-10-20", 60, "n")] };
    expect(moduleGoals(d, "2026-10-20").map(({ m, minutes, goalMin, done }) => [m.id, minutes, goalMin, done])).toEqual([["m", 120, 120, true]]);
    expect(moduleGoals(d, "2026-10-19")[0]).toMatchObject({ minutes: 60, done: false });
  });
});

describe("Schwachstellen", () => {
  const cards = [
    { id: "a", lapses: 1, difficulty: 5, tags: "graphen" },
    { id: "b", lapses: 3, difficulty: 7, tags: "graphen, bäume" },
    { id: "c", lapses: 0, difficulty: 8.5, tags: "" },
    { id: "d", lapses: 2, difficulty: 9, tags: "bäume" },
  ];
  it("oft vergessen oder sehr schwer, schlimmste zuerst", () => {
    expect(weakCards(cards).map((c) => c.id)).toEqual(["b", "d", "c"]);
  });
  it("nach Tags gruppiert", () => {
    expect(weakByTag(weakCards(cards), (c) => parseTags(c.tags))).toEqual([{ tag: "bäume", count: 2 }, { tag: "", count: 1 }, { tag: "graphen", count: 1 }]);
  });
});

describe("Himmel", () => {
  it("Sonne am Tag im Bogen, Mond in der Nacht", () => {
    const noon = skyPos(new Date(2026, 9, 20, 12, 57)); // Oktober: 7,6 bis 18,3 Uhr
    expect(noon.kind).toBe("sun");
    expect(noon.x).toBeCloseTo(0.5, 1);
    expect(noon.y).toBeCloseTo(1, 1);
    expect(skyPos(new Date(2026, 9, 20, 8, 0))).toMatchObject({ kind: "sun" });
    const night = skyPos(new Date(2026, 9, 20, 23, 0));
    expect(night.kind).toBe("moon");
    expect(skyPos(new Date(2026, 9, 21, 7, 0)).x).toBeGreaterThan(night.x);
  });
});
