import { describe, it, expect } from "vitest";
import { REVIEW_GAP_MAX, addReviewMinutes, reviewGap, splitReviewTime } from "../../src/lib/cards.js";
import { workload } from "../../src/lib/study.js";
import { emptyData } from "../../src/lib/data.js";

let n = 0;
const newId = () => `l${++n}`;

describe("Karteikarten als Lernzeit", () => {
  it("zählt Pausen zwischen zwei Schritten höchstens zwei Minuten", () => {
    expect(reviewGap(1000, 31000)).toBe(30000);
    expect(reviewGap(1000, 1000 + 10 * 60000)).toBe(REVIEW_GAP_MAX);
    expect(reviewGap(0, 50000)).toBe(0); /* ohne Start nichts */
    expect(reviewGap(5000, 4000)).toBe(0); /* Uhr zurückgestellt */
  });

  it("schreibt nur volle Minuten und behält den Rest, am Ende wird gerundet", () => {
    expect(splitReviewTime({ a: 150000, b: 20000 })).toEqual({ add: { a: 2 }, rest: { a: 30000, b: 20000 } });
    expect(splitReviewTime({ a: 60000 })).toEqual({ add: { a: 1 }, rest: {} });
    expect(splitReviewTime({ a: 30000, b: 29000 }, true)).toEqual({ add: { a: 1 }, rest: {} });
    expect(splitReviewTime({})).toEqual({ add: {}, rest: {} });
  });

  it("legt je Modul und Tag eine Einheit an und zählt weitere Minuten dazu", () => {
    const manual = { id: "m1", moduleId: "a", kind: "Karteikarten", date: "2026-10-20", minutes: 30 };
    let logs = addReviewMinutes([manual], "a", 3, { date: "2026-10-20", at: "10:00", newId });
    expect(logs).toHaveLength(2);
    const auto = logs[1];
    expect(auto).toMatchObject({ moduleId: "a", kind: "Karteikarten", auto: "karten", date: "2026-10-20", at: "10:00", minutes: 3 });
    logs = addReviewMinutes(logs, "a", 2, { date: "2026-10-20", at: "11:00", newId });
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ id: auto.id, minutes: 5, at: "10:00" });
    expect(logs[0]).toBe(manual); /* von Hand eingetragene Einheit bleibt unberührt */
    /* anderes Modul, anderer Tag: eigene Einheiten */
    logs = addReviewMinutes(logs, "b", 1, { date: "2026-10-20", at: "11:00", newId });
    logs = addReviewMinutes(logs, "a", 1, { date: "2026-10-21", at: "09:00", newId });
    expect(logs).toHaveLength(4);
    expect(addReviewMinutes(logs, "a", 0, { date: "2026-10-21", at: "09:00", newId })).toBe(logs);
  });

  it("zählt im ECTS-Workload wie andere Lernzeit", () => {
    const d = emptyData();
    d.modules = [{ id: "a", name: "Analysis", ects: 5, status: "belegt", semesterStart: "2026-10-01" }];
    const before = workload(d, "a", "2026-10-20").selfH;
    d.logs = addReviewMinutes(d.logs, "a", 60, { date: "2026-10-20", at: "10:00", newId });
    expect(workload(d, "a", "2026-10-20").selfH).toBe(before + 1);
  });
});
