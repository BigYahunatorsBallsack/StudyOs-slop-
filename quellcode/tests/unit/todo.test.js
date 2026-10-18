import { describe, it, expect, vi, afterEach } from "vitest";
import { todoItems, dueLabel } from "../../src/lib/todo.js";
import { emptyData } from "../../src/lib/data.js";

afterEach(() => vi.useRealTimers());

describe("Zu erledigen", () => {
  it("mischt Abgaben, Nachbereitung, Anmeldefristen und Karten nach Dringlichkeit", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T12:00:00"));
    const T = "2026-10-21";
    const d = { ...emptyData(),
      homework: [
        { id: "h-morgen", due: "2026-10-22", status: "ausgegeben" },
        { id: "h-ueber", due: "2026-10-19", status: "in Arbeit" },
        { id: "h-fertig", due: "2026-10-22", status: "abgegeben" },
        { id: "h-fern", due: "2026-11-30", status: "ausgegeben" },
      ],
      sessions: [
        { id: "s-alt", date: "2026-10-14", start: "10:00", end: "12:00", reviewed: false },
        { id: "s-gestern", date: "2026-10-20", start: "10:00", end: "12:00", reviewed: false },
        { id: "s-ok", date: "2026-10-20", start: "14:00", end: "16:00", reviewed: true },
        { id: "s-aus", date: "2026-10-20", start: "16:00", end: "18:00", cancelled: true },
        { id: "s-morgen", date: "2026-10-22", start: "10:00", end: "12:00" },
        { id: "s-heute", date: "2026-10-21", start: "08:00", end: "10:00", reviewed: false },
      ],
      exams: [{ id: "e", registerBy: "2026-10-24" }, { id: "e2", registerBy: "2026-10-23", registered: true }],
      cards: [{ id: "c", due: "2026-10-20" }, { id: "c2", due: "2026-12-01" }],
    };
    const items = todoItems(d, T);
    expect(items.map((x) => x.id)).toEqual(["s-alt", "h-ueber", "cards", "h-morgen", "s-gestern", "e"]);
    expect(items.find((x) => x.kind === "cards").count).toBe(1);
  });
  it("Fristtexte", () => {
    const T = "2026-10-21";
    expect(["2026-10-19", "2026-10-20", T, "2026-10-22", "2026-10-25"].map((x) => dueLabel(x, T))).toEqual(["seit 2 Tagen", "seit gestern", "heute", "morgen", "in 4 Tagen"]);
  });
});
