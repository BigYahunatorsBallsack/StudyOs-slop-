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
    expect(w).toMatchObject({ date: "2026-10-25", body: "Nächste Woche: 1 Abgabe, Prüfung: Diskrete Strukturen, 1 Termin. Rückblick: diese Woche noch nichts eingetragen." });
  });
  it("Wochenrückblick mit Lernzeit, Vorwoche und fälligen Karten", () => {
    const d = { ...data(), logs: [{ id: "l1", moduleId: "ds", date: "2026-10-19", minutes: 90 }, { id: "l2", moduleId: "ds", date: "2026-10-25", minutes: 45 }, { id: "l3", moduleId: "ds", date: "2026-10-14", minutes: 60 }],
      cards: [{ id: "c1", moduleId: "ds", due: "2026-10-26" }, { id: "c2", moduleId: "ds", due: "2026-11-30" }, { id: "c3", moduleId: "ds", due: "2026-10-01" }] };
    expect(deadlinesFromData(d, T).find((x) => x.kind === "weekly").body).toBe("Nächste Woche: 1 Abgabe, Prüfung: Diskrete Strukturen, 1 Termin. Rückblick: 2 h 15 min gelernt (Vorwoche 1 h), 2 Karten fällig.");
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

describe("Push bei Stundenplan-Änderungen", () => {
  it("meldet eine frische Änderung sofort und nur einmal, abschaltbar", () => {
    const at = new Date();
    const hm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    const today = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const d = { ...data(), sessions: [{ id: "s1", moduleId: "ds", type: "Vorlesung", date: today, start: "23:59", end: "23:59", room: "HS 2", change: { at: at.toISOString(), was: { room: "HS 1" }, wasCancelled: false } }] };
    const list = deadlinesFromData(d, today).filter((x) => x.kind === "change");
    expect(list).toEqual([expect.objectContaining({ kind: "change", date: today, time: hm, body: "Raum: HS 1 → HS 2" })]);
    const sent = dueReminders(list, {}, new Date(at.getTime() + 60000));
    expect(sent).toEqual([expect.objectContaining({ title: "Stundenplan geändert", body: expect.stringContaining("Raum: HS 1 → HS 2"), url: "./?aktion=heute" })]);
    expect(dueReminders(list, { [sent[0].key]: at.toISOString() }, new Date(at.getTime() + 60000))).toEqual([]);
    expect(deadlinesFromData({ ...d, settings: { ...d.settings, pushChanges: false } }, today).some((x) => x.kind === "change")).toBe(false);
  });
});
