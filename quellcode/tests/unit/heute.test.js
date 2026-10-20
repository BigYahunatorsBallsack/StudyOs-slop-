/* Heute: lesbare Abgabefristen, Prüfungs-Countdown, Raumwechsel im „Als Nächstes“ und „Erledigt heute“ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { dueInfo, emptyData, examCountdown } from "../../src/lib/data.js";
import { roomChange } from "../../src/lib/feed.js";
import { doneToday } from "../../src/lib/todo.js";
import { blockDone } from "../../src/lib/blocks.js";
import { toggleAttended } from "../../src/lib/study.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { todayLayout } from "../../src/lib/todayLayout.js";

afterEach(() => vi.useRealTimers());

describe("Abgabefristen lesbar", () => {
  const NOW = new Date("2026-10-20T15:00:00"); // Dienstag
  const at = (due, time = "", done = false) => dueInfo(due, done, time, NOW);

  it("heute und morgen mit Uhrzeit, dann in Tagen, ab einer Woche mit Wochentag und Datum", () => {
    expect(at("2026-10-20", "18:00").text).toBe("Abgabe heute 18:00");
    expect(at("2026-10-21", "23:59").text).toBe("Abgabe morgen 23:59");
    expect(at("2026-10-21").text).toBe("Abgabe morgen");
    expect(at("2026-10-23", "12:00").text).toBe("Abgabe in 3 Tagen");
    expect(at("2026-10-26").text).toBe("Abgabe in 6 Tagen");
    expect(at("2026-10-27").text).toBe("Abgabe Di, 27.10.");
    expect(at("2026-10-23").when).toBe("in 3 Tagen");
  });

  it("rot, sobald weniger als 24 Stunden bleiben (ohne Uhrzeit zählt das Tagesende)", () => {
    expect(at("2026-10-20").urgent).toBe(true);
    expect(at("2026-10-21", "14:00").urgent).toBe(true);
    expect(at("2026-10-21", "16:00").urgent).toBe(false);
    expect(at("2026-10-21").urgent).toBe(false);
    expect(at("2026-10-21", "14:00").cls).toContain("text-rose-400");
    expect(at("2026-10-23").cls).not.toContain("rose");
  });

  it("überfällig, erledigt und ohne Frist", () => {
    expect(at("2026-10-20", "14:00")).toMatchObject({ text: "überfällig seit 14:00", urgent: true });
    expect(at("2026-10-19").text).toBe("überfällig seit gestern");
    expect(at("2026-10-17").text).toBe("überfällig seit 3 Tagen");
    expect(at("2026-10-19", "", true)).toMatchObject({ text: "Abgabe Mo, 19.10.", urgent: false });
    expect(at("").text).toBe("ohne Frist");
  });
});

describe("Prüfungs-Countdown", () => {
  it("unter vier Wochen: heute, morgen, noch N Tage", () => {
    const T = "2026-10-20";
    expect(examCountdown("2026-10-20", T)).toBe("heute");
    expect(examCountdown("2026-10-21", T)).toBe("morgen");
    expect(examCountdown("2026-11-01", T)).toBe("noch 12 Tage");
    expect(examCountdown("2026-11-16", T)).toBe("noch 27 Tage");
  });
  it("nichts bei vier Wochen und mehr oder vergangenen Prüfungen", () => {
    const T = "2026-10-20";
    expect(examCountdown("2026-11-17", T)).toBeNull();
    expect(examCountdown("2026-10-19", T)).toBeNull();
    expect(examCountdown("", T)).toBeNull();
  });
});

describe("Raumwechsel", () => {
  it("meldet neuen und alten Raum, solange die Änderung nicht bestätigt ist", () => {
    expect(roomChange({ room: "Interims 1", change: { was: { room: "MI HS 1" } } })).toEqual({ from: "MI HS 1", to: "Interims 1" });
    expect(roomChange({ room: "", change: { was: { room: "MI HS 1" } } })).toEqual({ from: "MI HS 1", to: "" });
  });
  it("nichts ohne Raumänderung", () => {
    expect(roomChange({ room: "MI HS 1", change: null })).toBeNull();
    expect(roomChange({ room: "MI HS 1", change: { was: { start: "10:00" } } })).toBeNull();
    expect(roomChange({ room: "MI HS 1", change: { was: { room: "MI HS 1" } } })).toBeNull();
  });
});

describe("Erledigt heute", () => {
  const T = "2026-10-20";
  const d = () => ({ ...emptyData(),
    homework: [
      { id: "h-heute", title: "Blatt 3", status: "abgegeben", doneAt: T },
      { id: "h-gestern", title: "Blatt 2", status: "abgegeben", doneAt: "2026-10-19" },
      { id: "h-offen", title: "Blatt 4", status: "in Arbeit", doneAt: T }, // veralteter Zeitpunkt zählt nicht
    ],
    sessions: [
      { id: "s-nb", date: "2026-10-19", start: "10:00", end: "12:00", type: "Vorlesung", reviewed: true, reviewedAt: T },
      { id: "s-bes", date: T, start: "08:00", end: "10:00", type: "Übung", attended: true, attendedAt: `${T}T08:05:00` },
      { id: "s-alt", date: "2026-10-13", start: "08:00", end: "10:00", attended: true, reviewed: true, reviewedAt: "2026-10-14" },
    ],
    blocks: [
      { id: "b-heute", date: T, start: "14:00", end: "15:00", title: "Wiederholen", done: true, doneAt: `${T}T15:00:00` },
      { id: "b-timer", date: T, start: "16:00", end: "17:00", title: "Üben", done: true }, // vom Timer abgehakt, ohne Zeitpunkt
      { id: "b-alt", date: "2026-10-19", start: "14:00", end: "15:00", title: "Alt", done: true },
      { id: "b-offen", date: T, start: "18:00", end: "19:00", title: "Offen", done: false, doneAt: null },
    ],
    logs: [{ id: "l1", date: T, minutes: 45 }, { id: "l2", date: T, minutes: 30 }, { id: "l3", date: "2026-10-19", minutes: 60 }],
  });

  it("sammelt Abgaben, Nachbereitung, Besuche, Lernblöcke und die Lernzeit von heute", () => {
    const r = doneToday(d(), T);
    expect(r.items.map((x) => `${x.kind}:${x.id}`)).toEqual(["homework:h-heute", "reviewed:s-nb", "attended:s-bes", "block:b-heute", "block:b-timer"]);
    expect(r).toMatchObject({ minutes: 75, logs: 2 });
  });

  it("Besucht und Lernblock merken sich den Zeitpunkt, wieder öffnen löscht ihn", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${T}T09:00:00`));
    const on = toggleAttended(d(), "s-alt", T);
    expect(on.sessions.find((s) => s.id === "s-alt")).toMatchObject({ attended: false, attendedAt: null });
    const again = toggleAttended(on, "s-alt", T);
    expect(doneToday(again, T).items.some((x) => x.kind === "attended" && x.id === "s-alt")).toBe(true);
    expect(blockDone(true)).toMatchObject({ done: true });
    expect(doneToday({ ...emptyData(), blocks: [{ id: "b", date: "2026-10-18", done: true, ...blockDone(true) }] }, T).items).toHaveLength(1);
    expect(blockDone(false)).toEqual({ done: false, doneAt: null });
  });

  it("Besucht und sein Zeitpunkt werden beim Sync gemeinsam zusammengeführt", () => {
    const at = (h) => `2026-10-20T${String(h).padStart(2, "0")}:00:00.000Z`;
    const base = stampChanges({ ...emptyData() }, { ...emptyData(), sessions: [{ id: "s", attended: false }] }, at(8));
    const a = stampChanges(base, { ...base, sessions: [{ ...base.sessions[0], attended: true, attendedAt: at(9) }] }, at(9));
    expect(Object.keys(a.sessions[0].fu)).not.toContain("attendedAt");
    /* ein älteres Gerät kennt attendedAt nicht und hakt später selbst „Besucht“ an: das Paar kommt aus einer Änderung */
    const b = stampChanges(base, { ...base, sessions: [{ ...base.sessions[0], attended: true, prepared: true }] }, at(10));
    const m = mergeData(a, b, at(11)).data.sessions[0];
    expect(m).toMatchObject({ attended: true, prepared: true });
    expect(m.attendedAt).toBeUndefined();
  });

  it("ist ein eigener Bereich unter „Heute anpassen“, direkt hinter „Zu erledigen“", () => {
    const ids = todayLayout({ todayOrder: ["mensa", "todo", "next"] }).map((b) => b.id);
    expect(ids.indexOf("erledigt")).toBe(ids.indexOf("todo") + 1);
  });
});
