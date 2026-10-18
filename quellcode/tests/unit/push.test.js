import { describe, it, expect } from "vitest";
import { deadlinesFromData } from "../../src/lib/push.js";
import { dueReminders } from "../../src/server/reminders.js";
import { emptyData } from "../../src/lib/data.js";

const T = "2026-10-21"; /* Mittwoch */
const data = (settings = {}) => ({ ...emptyData(), settings: { ...emptyData().settings, ...settings },
  modules: [{ id: "ds", name: "Diskrete Strukturen" }, { id: "old", name: "Altes Modul", archived: true }],
  sessions: [
    { id: "a", moduleId: "ds", type: "Vorlesung", date: T, start: "10:00", end: "12:00" },
    { id: "b", moduleId: "ds", type: "Übung", date: T, start: "14:00", end: "16:00", reviewed: true },
    { id: "c", moduleId: "ds", type: "Übung", date: T, start: "19:30", end: "21:00" }, /* endet nach 20 Uhr */
    { id: "d", moduleId: "old", type: "Vorlesung", date: T, start: "08:00", end: "09:00" },
    { id: "e", moduleId: "ds", type: "Vorlesung", date: "2026-10-26", start: "10:00", end: "12:00" },
  ],
  homework: [{ id: "h", moduleId: "ds", title: "Blatt 3", due: "2026-10-28", status: "ausgegeben" }],
  exams: [{ id: "x", moduleId: "ds", date: "2026-10-30" }],
});

describe("Erinnerungen: Nachbereitung und Wochenausblick", () => {
  it("bündelt offene Termine pro Tag, ohne archivierte und späte Termine", () => {
    const list = deadlinesFromData(data(), T);
    const review = list.filter((x) => x.kind === "review");
    expect(review.map((x) => [x.date, x.title, x.body])).toEqual([[T, "1 Termin", "Diskrete Strukturen (Vorlesung)"], ["2026-10-26", "1 Termin", "Diskrete Strukturen (Vorlesung)"]]);
  });
  it("Wochenausblick für den kommenden Sonntag", () => {
    const w = deadlinesFromData(data(), T).find((x) => x.kind === "weekly");
    expect(w).toMatchObject({ date: "2026-10-25", body: "Nächste Woche: 1 Abgabe, Prüfung: Diskrete Strukturen, 1 Termine." });
  });
  it("beides abschaltbar", () => {
    const kinds = deadlinesFromData(data({ pushReviews: false, pushWeekly: false }), T).map((x) => x.kind);
    expect(kinds).not.toContain("review");
    expect(kinds).not.toContain("weekly");
  });
  it("der Server verschickt sie zur richtigen Zeit", () => {
    const list = deadlinesFromData(data(), T);
    expect(dueReminders(list, {}, new Date("2026-10-21T17:55:00Z")).map((r) => r.title)).not.toContain("Noch nachzubereiten");
    const at20 = dueReminders(list, {}, new Date("2026-10-21T18:05:00Z")); /* 20:05 Sommerzeit */
    expect(at20.find((r) => r.title === "Noch nachzubereiten").body).toBe("Diskrete Strukturen (Vorlesung)");
    const sun = dueReminders(list, {}, new Date("2026-10-25T17:05:00Z")); /* So 18:05 Winterzeit */
    expect(sun.map((r) => r.title)).toContain("Deine nächste Woche");
  });
});
