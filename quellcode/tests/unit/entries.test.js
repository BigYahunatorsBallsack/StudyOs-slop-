import { describe, it, expect } from "vitest";
import { duplicateEntry, markAttended, sessionNoteDraft, sessionNoteOf, setModule, shiftSessions } from "../../src/lib/entries.js";
import { toggleAttended } from "../../src/lib/study.js";
import { emptyData } from "../../src/lib/data.js";
import { shortName } from "../../src/lib/modules.js";

let n = 0;
const ids = () => "neu" + ++n;
const T = "2026-10-20";

describe("Duplizieren", () => {
  it("Abgabe: neue id, offen, Teilaufgaben nicht abgehakt, ohne Abo, Sperren und Anhänge", () => {
    const h = { id: "h1", moduleId: "m1", title: "Blatt 3", due: "2026-10-23", status: "bewertet", doneAt: "2026-10-22", points: 8, maxPoints: 10, feedback: "gut", missed: true,
      subtasks: [{ id: "a", title: "a", done: true }, { id: "b", title: "b", done: false }], feedKey: "moodle|1", source: "moodle", locked: ["due"], files: [{ id: "f1" }], seriesId: "s", updated: "x", fu: { "*": "x" } };
    const c = duplicateEntry("homework", h, T, ids);
    expect(c.id).not.toBe("h1");
    expect(c).toMatchObject({ moduleId: "m1", title: "Blatt 3", due: "2026-10-23", status: "ausgegeben", doneAt: null, points: null, maxPoints: 10, feedback: "", created: T });
    expect(c.subtasks.map((s) => [s.title, s.done])).toEqual([["a", false], ["b", false]]);
    expect(c.subtasks.map((s) => s.id)).not.toContain("a");
    for (const k of ["feedKey", "source", "locked", "files", "seriesId", "missed", "updated", "fu"]) expect(c).not.toHaveProperty(k);
    expect(h.subtasks[0].done).toBe(true);
  });

  it("Termin, Lernblock und Notiz", () => {
    const s = duplicateEntry("session", { id: "s1", moduleId: "m1", type: "Übung", date: T, start: "10:00", end: "12:00", room: "MI 1", prepared: true, attended: true, reviewed: true, reviewedAt: T, cancelled: true, offReason: "x", watchedTo: "40:00", feedKey: "k", locked: ["room"], change: { was: {} } }, T, ids);
    expect(s).toMatchObject({ moduleId: "m1", type: "Übung", date: T, room: "MI 1", prepared: false, attended: false, reviewed: false, reviewedAt: null, cancelled: false });
    for (const k of ["feedKey", "locked", "change", "offReason", "watchedTo"]) expect(s).not.toHaveProperty(k);
    expect(duplicateEntry("block", { id: "b1", title: "Lernen", done: true }, T, ids)).toMatchObject({ title: "Lernen", done: false });
    expect(duplicateEntry("note", { id: "n1", moduleId: "m1", sessionId: "s1", title: "VL 3", text: "x" }, T, ids)).toMatchObject({ moduleId: "m1", sessionId: "", title: "VL 3 (Kopie)", text: "x", updated: T });
  });
});

describe("Mehrfachauswahl", () => {
  const data = () => ({ ...emptyData(),
    modules: [{ id: "m1", name: "Diskrete Strukturen" }, { id: "m2", name: "Analysis" }],
    sessions: [
      { id: "s1", moduleId: "m1", type: "Vorlesung", date: "2026-10-19", start: "10:00", end: "11:30" },
      { id: "s2", moduleId: "m1", type: "Übung", date: "2026-10-20", start: "12:00", end: "13:00", attended: true },
      { id: "s3", moduleId: "m1", type: "Übung", date: "2026-10-21", start: "12:00", end: "13:00", cancelled: true },
      { id: "s4", moduleId: "m1", type: "Vorlesung", date: "2026-10-22", start: "10:00", end: "12:00", feedKey: "f4", locked: ["room"] },
    ],
    logs: [{ id: "l1", moduleId: "m1", topicId: "", sessionId: "s2", kind: "Besucht", date: T, minutes: 60 }],
    cards: [{ id: "c1", moduleId: "m1", topicId: "t1", front: "?" }],
    notes: [{ id: "n1", moduleId: "m1", sessionId: "s1", title: "a" }],
    homework: [{ id: "h1", moduleId: "m1", title: "Blatt", feedKey: "moodle|1" }, { id: "h2", moduleId: "m1", title: "Blatt 2" }],
  });

  it("Besucht nimmt denselben Weg wie der Schalter und zählt die Lernzeit", () => {
    const d = data();
    const out = markAttended(d, ["s1", "s2", "s3"], T);
    expect(out.sessions.map((s) => !!s.attended)).toEqual([true, true, false, false]);
    const expected = toggleAttended(d, "s1", T);
    expect(out.logs.map((l) => [l.sessionId, l.kind, l.minutes])).toEqual(expected.logs.map((l) => [l.sessionId, l.kind, l.minutes]));
    expect(out.logs.filter((l) => l.sessionId === "s1")).toMatchObject([{ kind: "Besucht", minutes: 90, moduleId: "m1" }]);
  });

  it("Verschieben um Tage, Abo-Termine merken sich das Datum", () => {
    const out = shiftSessions(data().sessions, ["s1", "s4"], 7);
    expect(out.map((s) => s.date)).toEqual(["2026-10-26", "2026-10-20", "2026-10-21", "2026-10-29"]);
    expect(out[3].locked).toEqual(["room", "date"]);
    expect(out[0]).not.toHaveProperty("locked");
    expect(shiftSessions(data().sessions, ["s1"], 0)).toEqual(data().sessions);
  });

  it("Modul ändern: Thema und Termin fallen weg, Abo merkt es sich, Lernzeit zieht mit", () => {
    const d = data();
    expect(setModule(d, "card", ["c1"], "m2").cards[0]).toMatchObject({ moduleId: "m2", topicId: "" });
    expect(setModule(d, "note", ["n1"], "").notes[0]).toMatchObject({ moduleId: "", sessionId: "" });
    const hw = setModule(d, "homework", ["h1", "h2"], "m2").homework;
    expect(hw[0]).toMatchObject({ moduleId: "m2", locked: ["moduleId"] });
    expect(hw[1]).toMatchObject({ moduleId: "m2" });
    expect(hw[1]).not.toHaveProperty("locked");
    const ses = setModule(d, "session", ["s2", "s4"], "m2");
    expect(ses.sessions.map((s) => s.moduleId)).toEqual(["m1", "m2", "m1", "m2"]);
    expect(ses.sessions[3].locked).toEqual(["room", "moduleId"]);
    expect(ses.logs[0].moduleId).toBe("m2");
    /* schon im Zielmodul: unverändert */
    expect(setModule(d, "card", ["c1"], "m1").cards[0]).toBe(d.cards[0]);
  });
});

describe("Notiz zum Termin", () => {
  it("Vorlage mit Modul, Titel aus Kurzname, Art und Datum, Gerüst mit Raum", () => {
    const s = { id: "s1", moduleId: "m1", type: "Vorlesung", date: "2026-10-20", start: "10:00", end: "12:00", room: "MI HS 1" };
    const d = sessionNoteDraft(s, { name: "Einführung in die Informatik" });
    expect(d).toMatchObject({ moduleId: "m1", sessionId: "s1", title: "EidI Vorlesung 20.10.2026" });
    expect(d.text.startsWith("# Vorlesung, 20.10.2026\n10:00–12:00, MI HS 1\n")).toBe(true);
    expect(d.text).toContain("## Mitschrift");
    expect(sessionNoteDraft({ ...s, room: "" }, null).title).toBe("Vorlesung 20.10.2026");
  });

  it("findet die jüngste vorhandene Notiz", () => {
    const notes = [{ id: "a", sessionId: "s1", updated: "2026-10-01" }, { id: "b", sessionId: "s1", updated: "2026-10-05" }, { id: "c", sessionId: "s2", updated: "2026-10-09" }];
    expect(sessionNoteOf(notes, "s1").id).toBe("b");
    expect(sessionNoteOf(notes, "s3")).toBeUndefined();
  });

  it("Kurzname: Klammerzusätze weg, lange Namen als Initialen", () => {
    expect(shortName("Diskrete Strukturen")).toBe("DS");
    expect(shortName("Lineare Algebra (Beispiel)")).toBe("LA");
    expect(shortName("Analysis 1")).toBe("Analysis 1");
  });
});
