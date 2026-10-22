/* Importe mit kaputten oder ungewöhnlichen Dateien: Sicherungen mit fehlenden/falschen Feldern, ICS-Varianten, CSV/Anki */
import { describe, it, expect } from "vitest";
import { migrate, normalizeImport } from "../../src/lib/data.js";
import { parseICS } from "../../src/lib/ics.js";
import { parseCardsCsv, parseCsv } from "../../src/lib/cards.js";
import { addDays, iso } from "../../src/lib/util.js";
import { todoItems } from "../../src/lib/todo.js";
import { effortVsGrade, learningRhythm } from "../../src/lib/stats.js";

const cal = (...ev) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...ev.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

describe("Sicherung mit fehlenden oder falschen Feldern", () => {
  const odd = {
    modules: [{ id: "m1" }, { id: "m2", name: 7 }],
    sessions: [{ id: "s1", moduleId: "m2" }, { id: "s2", moduleId: "m2", date: "2026-10-20", start: null, end: null, type: null }],
    homework: [{ id: "h1", moduleId: "m2" }, { id: "h2", moduleId: "m2", title: 3, due: 20261022, status: null }],
    topics: [{ id: "t1", moduleId: "m2" }],
    logs: [{ id: "l1" }, { id: "l2", date: null, kind: null, minutes: 30 }],
    notes: [{ id: "n1", title: ["x"], text: null }],
    cards: [{ id: "c1" }, { id: "c2", front: null, back: 5, due: null, lastReview: 20261001 }],
    exams: [{ id: "e1", moduleId: "m2", date: null, registerBy: null }],
    blocks: [{ id: "b1", date: "2026-10-20", start: 9 }],
  };
  it("macht Textfelder zu Text, damit Sortieren und Datumsvergleiche nicht abstürzen", () => {
    const d = normalizeImport(odd);
    expect(d.modules.map((m) => m.name)).toEqual(["", "7"]);
    expect(d.sessions[0]).toMatchObject({ date: "", start: "", end: "", type: "" });
    expect(d.sessions[1]).toMatchObject({ date: "2026-10-20", start: "", end: "", type: "" });
    expect(d.homework[0]).toMatchObject({ title: "", status: "ausgegeben" });
    expect(d.homework[0].due).toBeUndefined(); /* Abgabe ohne Frist bleibt ohne Frist */
    expect(d.homework[1]).toMatchObject({ title: "3", due: "20261022", status: "ausgegeben" });
    expect(d.topics[0]).toMatchObject({ title: "", state: "nicht begonnen" });
    expect(d.logs[1]).toMatchObject({ date: "", kind: "", minutes: 30 });
    expect(d.notes[0]).toMatchObject({ title: "", text: "" });
    expect(d.cards[0]).toMatchObject({ front: "", back: "", due: iso() });
    expect(d.cards[1]).toMatchObject({ front: "", back: "5", due: iso(), lastReview: "20261001" });
    expect(d.exams[0]).toMatchObject({ date: "", registerBy: null });
    expect(d.blocks[0]).toMatchObject({ start: "9", end: "" });
    /* die Heute-Liste lässt sich daraus bilden (vorher: TypeError bzw. RangeError und leeres Bild) */
    expect(() => todoItems(d, iso())).not.toThrow();
  });
  it("gültige Einträge bleiben dieselben Objekte", () => {
    const log = { id: "l", date: "2026-10-20", kind: "Nacharbeiten", minutes: 30 };
    const note = { id: "n", title: "T", text: "x" };
    const d = migrate({ modules: [], logs: [log], notes: [note] });
    expect(d.logs[0]).toBe(log);
    expect(d.notes[0]).toBe(note);
  });
  it("addDays mit ungültigem Datum gibt den Text zurück statt abzustürzen", () => {
    expect(addDays("", 3)).toBe("");
    expect(addDays("2026-13-45", 1)).toBe("2026-13-45");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("Versionsangabe als Text oder Kommazahl wird angenommen", () => {
    expect(normalizeImport({ version: "3", modules: [] }).version).toBe(3);
    expect(normalizeImport({ version: 2.9, modules: [] }).version).toBe(3);
    expect(() => normalizeImport({ version: "4", modules: [] })).toThrow(/neueren/);
  });
});

describe("ICS-Varianten", () => {
  it("DURATION statt DTEND ergibt das Ende", () => {
    const [e] = parseICS(cal(["SUMMARY:A", "DTSTART:20261020T101500", "DURATION:PT1H30M"]));
    expect(e).toMatchObject({ date: "2026-10-20", start: "10:15", end: "11:45" });
  });
  it("DURATION bei UTC-Serie über die Zeitumstellung", () => {
    const ev = parseICS(cal(["SUMMARY:A", "DTSTART:20261021T081500Z", "DURATION:PT2H", "RRULE:FREQ=WEEKLY;COUNT=2"]));
    expect(ev.map((e) => [e.date, e.start, e.end])).toEqual([["2026-10-21", "10:15", "12:15"], ["2026-10-28", "09:15", "11:15"]]);
  });
  it("tägliche Serie mit Wochentagen und COUNT (Blockkurs)", () => {
    const ev = parseICS(cal(["SUMMARY:Block", "DTSTART;TZID=Europe/Berlin:20261022T090000", "DTEND;TZID=Europe/Berlin:20261022T170000", "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=5", "EXDATE;TZID=Europe/Berlin:20261027T090000"]));
    /* Do, Fr, Mo, (Di fällt aus), Mi: fünf Vorkommen, eines davon ausgenommen */
    expect(ev.map((e) => e.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-28"]);
    expect(ev[0]).toMatchObject({ start: "09:00", end: "17:00" });
  });
  it("tägliche Serie mit INTERVAL und UNTIL", () => {
    const ev = parseICS(cal(["SUMMARY:A", "DTSTART:20261020T100000", "RRULE:FREQ=DAILY;INTERVAL=3;UNTIL=20261030T235959Z"]));
    expect(ev.map((e) => e.date)).toEqual(["2026-10-20", "2026-10-23", "2026-10-26", "2026-10-29"]);
  });
  it("Kleinschreibung, nur CR als Zeilenende und BOM", () => {
    expect(parseICS("begin:vcalendar\nbegin:vevent\nsummary:A\ndtstart:20261020T101500\nend:vevent\nend:vcalendar")).toHaveLength(1);
    expect(parseICS(cal(["SUMMARY:A", "DTSTART:20261020T101500"]).replace(/\r\n/g, "\r"))).toHaveLength(1);
    expect(parseICS("﻿" + cal(["SUMMARY:A", "DTSTART:20261020T101500"]))[0].summary).toBe("A");
  });
  it("gefaltete Zeilen mit nur CR", () => {
    expect(parseICS(cal(["SUMMARY:Lineare", " Algebra", "DTSTART:20261020T101500"]).replace(/\r\n/g, "\r"))[0].summary).toBe("LineareAlgebra");
  });
  it("mehrere EXDATE-Zeilen mit Zeitzone und Liste", () => {
    const ev = parseICS(cal(["SUMMARY:A", "DTSTART;TZID=Europe/Berlin:20261020T101500", "DTEND;TZID=Europe/Berlin:20261020T120000", "RRULE:FREQ=WEEKLY;COUNT=5",
      "EXDATE;TZID=Europe/Berlin:20261027T101500", "EXDATE;TZID=Europe/Berlin:20261103T101500,20261110T101500"]));
    expect(ev.map((e) => e.date)).toEqual(["2026-10-20", "2026-11-17"]);
  });
  it("Ganztägig: ohne Uhrzeit als ganztägig markiert", () => {
    const [e] = parseICS(cal(["SUMMARY:Ferien", "DTSTART;VALUE=DATE:20261221", "DTEND;VALUE=DATE:20270107"]));
    expect(e).toMatchObject({ date: "2026-12-21", allDay: true });
  });
  it("UNTIL vor dem Beginn ergibt keine Vorkommen, monatlich bleibt ein Einzeltermin", () => {
    expect(parseICS(cal(["SUMMARY:A", "DTSTART:20261020T101500", "RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z"]))).toEqual([]);
    expect(parseICS(cal(["SUMMARY:A", "DTSTART:20261020T101500", "RRULE:FREQ=MONTHLY;COUNT=3"]))).toHaveLength(1);
  });
  it("große Datei (5000 Serien) in vertretbarer Zeit", () => {
    const ev = [];
    for (let i = 0; i < 5000; i++) ev.push([`SUMMARY:K${i % 50}`, `UID:${i}`, `DTSTART:202610${String(1 + (i % 28)).padStart(2, "0")}T101500`, "RRULE:FREQ=WEEKLY;COUNT=14"]);
    const t = Date.now();
    expect(parseICS(cal(...ev))).toHaveLength(70000);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe("CSV und Anki", () => {
  it("BOM, Semikolon in Anführungszeichen, verdoppelte Anführungszeichen, CRLF", () => {
    expect(parseCsv('﻿"Vorne; mit Semikolon";"Hinten ""zitiert"""\r\nA;B\r\n')).toEqual([["Vorne; mit Semikolon", 'Hinten "zitiert"'], ["A", "B"]]);
    expect(parseCsv('Frage,Antwort\n"a, b",c\n')).toEqual([["Frage", "Antwort"], ["a, b", "c"]]);
    expect(parseCsv('a;"mehr\nzeilig";t\n')).toEqual([["a", "mehr\nzeilig", "t"]]);
  });
  it("Anki „Notizen als Klartext“ mit Kopfzeilen, HTML und Tag-Spalte", () => {
    const text = "#separator:tab\n#html:true\n#tags column:3\nWas ist <b>2+2</b>?\tVier<br>(4)&nbsp;&amp; mehr\tmathe grundlagen\n\"Mit\ttab\"\tB\t\n";
    const { cards, skipped } = parseCardsCsv(text);
    expect(skipped).toEqual([]);
    expect(cards).toEqual([
      { front: "Was ist 2+2?", back: "Vier\n(4) & mehr", tags: "mathe, grundlagen" },
      { front: "Mit\ttab", back: "B", tags: "" },
    ]);
  });
  it("Anki mit Deck- und Notiztyp-Spalten", () => {
    const text = "#separator:Semicolon\n#html:false\n#notetype column:1\n#deck column:2\n#tags column:5\nBasic;Mathe;Frage;Antwort;a b\n";
    expect(parseCardsCsv(text).cards).toEqual([{ front: "Frage", back: "Antwort", tags: "a, b" }]);
  });
  it("ohne Anki-Kopfzeilen wie bisher", () => {
    expect(parseCardsCsv("Vorderseite;Rückseite;Tags\nA;B;x, y\n").cards).toEqual([{ front: "A", back: "B", tags: "x, y" }]);
    expect(parseCardsCsv("#Kein Kopf\tB\n").cards).toEqual([{ front: "#Kein Kopf", back: "B", tags: "" }]);
  });
});

describe("Auswertungen in einem Durchgang", () => {
  it("effortVsGrade und learningRhythm wie vorher", () => {
    const data = { modules: [{ id: "a", name: "A", status: "bestanden", grade: "1,7", ects: 6 }, { id: "b", name: "B", status: "bestanden", grade: 2.3, ects: 5 }],
      logs: [{ moduleId: "a", minutes: 90, date: "2026-10-19", at: "09:00" }, { moduleId: "a", minutes: "30", date: "2026-10-19" }, { moduleId: "b", minutes: 60, date: "2026-10-21", at: "20:00" }, { moduleId: "x", minutes: 10, date: "2026-10-22" }] };
    expect(effortVsGrade(data).map((x) => [x.id, x.hours])).toEqual([["a", 2], ["b", 1]]);
    expect(learningRhythm(data.logs).weekdays).toEqual([120, 0, 60, 10, 0, 0, 0]);
  });
});
