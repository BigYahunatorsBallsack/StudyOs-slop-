import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { emptyData } from "../../src/lib/data.js";
import { postponeHomework, postponeTargets } from "../../src/lib/postpone.js";
import { matchCommands } from "../../src/lib/commands.js";
import { syncNoteCards } from "../../src/lib/cards.js";
import { seriesSuggestion, withNumber, nextTitle } from "../../src/lib/study.js";
import { semesterSwitch } from "../../src/lib/curriculum.js";
import { deadlinesFromData, morningBody } from "../../src/lib/push.js";
import { dueReminders } from "../../src/server/reminders.js";
import { findDate, pdfText, sheetFromShare } from "../../src/lib/sheet.js";
import { openTodayCount, todoItems } from "../../src/lib/todo.js";
import { byUse } from "../../src/lib/forms.js";

const T = "2026-10-21"; /* Mittwoch */
const base = (p = {}) => ({ ...emptyData(), ...p, settings: { ...emptyData().settings, university: "TUM", ...(p.settings || {}) } });
const mods = [{ id: "ds", name: "Diskrete Strukturen", code: "IN0015" }, { id: "an", name: "Analysis für Informatik", code: "MA0902" }];

describe("Verschieben", () => {
  it("morgen und eine Woche nach der alten Frist", () => {
    expect(postponeTargets("2026-10-23", T)).toEqual([{ label: "Morgen", date: "2026-10-22" }, { label: "Eine Woche später", date: "2026-10-30" }]);
    expect(postponeTargets("2026-10-10", T)[1].date).toBe("2026-10-28");
  });
  it("Abo-Abgaben merken sich die Frist als geändert, „verpasst“ wird zurückgesetzt", () => {
    expect(postponeHomework({ feedKey: "moodle|1", locked: ["title"], missed: true }, "2026-10-30")).toEqual({ due: "2026-10-30", missed: false, locked: ["title", "due"] });
    expect(postponeHomework({}, "2026-10-30")).toEqual({ due: "2026-10-30", missed: false });
  });
});

describe("Befehle in der Suche", () => {
  it("findet Aktionen nach Wortanfängen", () => {
    expect(matchCommands("neue abg", mods).map((c) => c.title)).toEqual(["Neue Hausaufgabe"]);
    expect(matchCommands("einst", mods)[0].act).toEqual({ type: "more", sub: "daten" });
  });
  it("„timer ds“ startet den Timer für das Modul", () => {
    expect(matchCommands("timer ds", mods)).toEqual([expect.objectContaining({ title: "Timer: Diskrete Strukturen", act: { type: "timer", moduleId: "ds" } })]);
  });
  it("ohne Eingabe die häufigsten", () => {
    expect(matchCommands("", mods).length).toBeGreaterThan(2);
  });
});

describe("Karteikarten aus Notizen", () => {
  let n = 0;
  const id = () => `k${++n}`;
  const note = { id: "n", moduleId: "ds", title: "Graphen", text: "Was ist ein Baum? :: kreisfrei\nEin {{c1::Blatt}} hat Grad 1." };
  it("legt neue Karten an, ändert Antworten und behält den Lernstand bei geänderter Frage", () => {
    const r1 = syncNoteCards([], note, T, id);
    expect([r1.added, r1.updated, r1.removed]).toEqual([2, 0, 0]);
    const learned = r1.cards.map((c) => (c.front === "Was ist ein Baum?" ? { ...c, reps: 4 } : c));
    const r2 = syncNoteCards(learned, { ...note, text: "Was ist ein Baum? :: zusammenhängend und kreisfrei\nEin {{c1::Blatt}} hat Grad 1." }, T, id);
    expect([r2.added, r2.updated, r2.removed]).toEqual([0, 1, 0]);
    expect(r2.cards.find((c) => c.reps === 4).back).toBe("zusammenhängend und kreisfrei");
    const r3 = syncNoteCards(r2.cards, { ...note, text: "Was ist ein Wald? :: viele Bäume" }, T, id);
    expect([r3.added, r3.updated, r3.removed]).toEqual([0, 1, 1]);
    expect(r3.cards).toEqual([expect.objectContaining({ front: "Was ist ein Wald?", reps: 4 })]);
  });
  it("ohne Modul oder ohne Kartenzeilen passiert nichts", () => {
    const cards = [{ id: "x", front: "a", moduleId: "ds" }];
    expect(syncNoteCards(cards, { ...note, moduleId: "" }, T, id).cards).toBe(cards);
    expect(syncNoteCards(cards, { ...note, text: "nur Text" }, T, id).cards).toBe(cards);
  });
  it("doppelt sich nicht mit Karten, die es im Modul schon gibt", () => {
    expect(syncNoteCards([{ id: "x", front: "Was ist ein Baum?", moduleId: "ds" }], note, T, id).added).toBe(1);
  });
});

describe("Blatt-Serie erkennen", () => {
  const hw = [
    { id: "1", moduleId: "ds", title: "Blatt 1", due: "2026-10-23", status: "abgegeben" },
    { id: "2", moduleId: "ds", title: "Blatt 2", due: "2026-10-30", status: "ausgegeben" },
  ];
  const third = { id: "3", moduleId: "ds", title: "Blatt 3", due: "2026-11-06", dueTime: "12:00", status: "ausgegeben", subtasks: [{ id: "s", title: "a", done: true }] };
  it("schlägt nach dem dritten Blatt im Wochentakt die übrigen bis zu den Semesterferien vor", () => {
    const s = seriesSuggestion(base({ modules: mods, homework: hw }), third, base().settings);
    expect(s.key).toBe("ds|Blatt 0");
    expect(s.list[0]).toMatchObject({ title: "Blatt 4", due: "2026-11-13", dueTime: "12:00", status: "ausgegeben", subtasks: [{ title: "a", done: false }] });
    expect(s.list.every((h) => h.due < "2027-02-06")).toBe(true);
    expect(s.list.some((h) => h.due >= "2026-12-24" && h.due <= "2027-01-06")).toBe(false);
  });
  it("nicht bei Lücken, schon vorhandenen Folgeblättern oder schon gefragt", () => {
    expect(seriesSuggestion(base({ homework: [hw[0]] }), third, base().settings)).toBeNull();
    expect(seriesSuggestion(base({ homework: [...hw, { id: "4", moduleId: "ds", title: "Blatt 4", due: "2026-11-13" }] }), third, base().settings)).toBeNull();
    expect(seriesSuggestion(base({ homework: hw }), third, { ...base().settings, seriesAsked: ["ds|Blatt 0"] })).toBeNull();
  });
  it("Titelnummern", () => {
    expect(withNumber("Übungsblatt 04", 7)).toBe("Übungsblatt 07");
    expect(nextTitle("Blatt 9 (Graphen)")).toBe("Blatt 10 (Graphen)");
  });
});

describe("Semesterwechsel", () => {
  const d = (p = {}) => base({ settings: { curriculum: "tum-bsc-informatik-2026", ...(p.settings || {}) }, modules: [{ id: "a", name: "Diskrete Strukturen", semester: 1, status: "belegt" }], ...p });
  it("in den letzten Wochen der Semesterferien", () => {
    expect(semesterSwitch(d(), "2027-03-30")).toMatchObject({ key: "2027-04-11", from: 1, to: 2 });
    expect(semesterSwitch(d(), "2027-04-30")).toMatchObject({ from: 1, to: 2 });
  });
  it("nicht mitten im Semester, nicht zweimal, nicht wenn das nächste schon da ist", () => {
    expect(semesterSwitch(d(), "2026-11-20")).toBeNull();
    expect(semesterSwitch(d({ settings: { semesterAsked: "2027-04-11" } }), "2027-03-30")).toBeNull();
    expect(semesterSwitch(d({ modules: [{ id: "a", semester: 1, status: "belegt" }, { id: "b", semester: 2, status: "geplant" }] }), "2027-03-30")).toBeNull();
  });
});

describe("Tagesüberblick am Morgen", () => {
  const data = base({
    modules: mods,
    sessions: [{ id: "s", moduleId: "ds", type: "Vorlesung", date: T, start: "10:00", end: "12:00" }, { id: "t", moduleId: "an", type: "Übung", date: T, start: "08:00", end: "10:00", cancelled: true }],
    homework: [{ id: "h", moduleId: "ds", title: "Blatt 3", due: T, dueTime: "23:59", status: "ausgegeben" }, { id: "m", moduleId: "ds", title: "Blatt 2", due: T, status: "ausgegeben", missed: true }],
    cards: [{ id: "c", due: T }],
  });
  const mod = (id) => mods.find((m) => m.id === id)?.name || "";
  it("Termine, Abgaben und fällige Karten in einem Satz", () => {
    expect(morningBody(data, T, mod)).toBe("10:00 Diskrete Strukturen. Abgabe: Blatt 3 bis 23:59. 1 Karte fällig.");
    expect(morningBody(data, "2026-10-22", mod)).toBe("");
  });
  it("als Frist zur eingestellten Uhrzeit, abschaltbar; der Server schickt sie dann", () => {
    const list = deadlinesFromData({ ...data, settings: { ...data.settings, morningTime: "06:45" } }, T).filter((x) => x.kind === "morning");
    expect(list).toEqual([expect.objectContaining({ id: `morning-${T}`, date: T, time: "06:45" })]);
    expect(deadlinesFromData({ ...data, settings: { ...data.settings, pushMorning: false } }, T).some((x) => x.kind === "morning")).toBe(false);
    const sent = dueReminders(list, {}, new Date("2026-10-21T04:50:00Z")); /* 06:50 Sommerzeit */
    expect(sent).toEqual([expect.objectContaining({ title: "Dein Tag", url: "./?aktion=heute" })]);
  });
  it("verpasste Abgaben erinnern nicht mehr", () => {
    expect(deadlinesFromData(data, T).filter((x) => x.kind === "homework").map((x) => x.id)).toEqual(["h"]);
  });
});

describe("Knöpfe in Benachrichtigungen", () => {
  it("Abgabe: Abgegeben und Verschieben; Nachbereitung: alles nachbereitet", () => {
    const r = dueReminders([{ id: "h 1", kind: "homework", title: "Blatt 3", date: "2026-10-22" }, { id: "review-2026-10-21", kind: "review", title: "1 Termin", date: "2026-10-21" }], {}, new Date("2026-10-21T18:30:00Z"));
    expect(r.find((x) => x.tag === "homework-h 1").actions).toEqual([
      { action: "done", title: "Abgegeben", url: "./?aktion=push&tun=abgegeben&id=h%201" },
      { action: "later", title: "Verschieben", url: "./?aktion=push&tun=verschieben&id=h%201" },
    ]);
    expect(r.find((x) => x.tag.startsWith("review")).actions[0].url).toBe("./?aktion=push&tun=nachbereitet&tag=2026-10-21");
  });
});

describe("Übungsblatt aus einem geteilten PDF", () => {
  const data = base({ modules: mods, homework: [{ id: "p", moduleId: "ds", title: "Übungsblatt 04", due: "2026-10-20", dueTime: "10:00" }] });
  it("liest Modul, Nummer, Frist und Aufgaben", () => {
    const text = "Diskrete Strukturen (IN0015)\nÜbungsblatt 5\nAbgabe: Montag, 27.10.2026, 12:00 Uhr\nAufgabe 1 (Graphen)\nblabla\nAufgabe 2\nAufgabe 3";
    expect(sheetFromShare({ name: "blatt05.pdf", text }, data, T)).toEqual({ title: "Übungsblatt 05", moduleId: "ds", due: "2026-10-27", dueTime: "12:00", guessedDue: false,
      subtasks: [expect.objectContaining({ title: "Aufgabe 1" }), expect.objectContaining({ title: "Aufgabe 2" }), expect.objectContaining({ title: "Aufgabe 3" })] });
  });
  it("nur aus dem Dateinamen: Frist eine Woche nach dem letzten Blatt", () => {
    expect(sheetFromShare({ name: "DS_sheet06.pdf", text: "" }, data, T)).toMatchObject({ title: "Übungsblatt 06", moduleId: "ds", due: "2026-10-27", dueTime: "10:00", guessedDue: true });
  });
  it("kein Übungsblatt: null", () => {
    expect(sheetFromShare({ name: "Skript.pdf", text: "Kapitel 1 Einleitung" }, data, T)).toBeNull();
  });
  it("Datumsformate", () => {
    expect(findDate("Due: November 3, 2026", T)).toBe("2026-11-03");
    expect(findDate("bis zum 3. November", T)).toBe("2026-11-03");
    expect(findDate("Abgabe 05.01.", T)).toBe("2027-01-05");
    expect(findDate("2026-11-14 23:59", T)).toBe("2026-11-14");
  });
  it("Text aus einem PDF mit komprimiertem Inhaltsstrom", async () => {
    const content = "BT /F1 12 Tf 72 720 Td (\\334bungsblatt 3) Tj 0 -14 Td [(Ab)-30(gabe:)-400(10.11.2026)] TJ ET";
    const z = deflateSync(Buffer.from(content, "latin1"));
    const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), z, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
    const text = await pdfText(new Uint8Array(pdf));
    expect(text).toBe("Übungsblatt 3\nAbgabe: 10.11.2026");
    expect(sheetFromShare({ name: "x.pdf", text }, data, T)).toMatchObject({ title: "Blatt 3", moduleId: "", due: "2026-11-10" });
  });
});

describe("Heute: offen, verpasst, Modulreihenfolge", () => {
  const data = base({
    modules: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C", archived: true }],
    homework: [{ id: "1", moduleId: "a", title: "x", due: "2026-10-20", status: "ausgegeben" }, { id: "2", moduleId: "a", title: "y", due: "2026-10-19", status: "ausgegeben", missed: true }, { id: "3", moduleId: "a", title: "z", due: "2026-10-25", status: "ausgegeben" }],
    cards: [{ id: "k", due: T }, { id: "l", due: T }],
    logs: [{ id: "l1", moduleId: "b", date: T }, { id: "l2", moduleId: "b", date: T }],
  });
  it("Zahl am App-Symbol zählt Fälliges, Karten als eins, Verpasstes nicht", () => {
    expect(todoItems(data, T).map((x) => x.id)).toEqual(["1", "cards", "3"]);
    expect(openTodayCount(data, T)).toBe(2);
  });
  it("zuletzt genutzte Module zuerst, archivierte zuletzt", () => {
    expect(byUse(data, T).map((m) => m.id)).toEqual(["b", "a", "c"]);
  });
});
