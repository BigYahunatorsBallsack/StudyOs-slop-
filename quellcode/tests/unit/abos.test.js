import { describe, it, expect } from "vitest";
import { parseICS } from "../../src/lib/ics.js";
import { applyExams, applyFeed, examDismissKeys, examModuleOf, isExamEvent } from "../../src/lib/feed.js";
import { applyArtemis, applyMoodle, taskLinkLabel, taskUrl } from "../../src/lib/moodle.js";
import { crowdedDueDays, fmtTypical, logOfHomework, recordingBacklog, typicalSheetTime } from "../../src/lib/study.js";
import { emptyData } from "../../src/lib/data.js";

const T = "2026-10-21";
const cal = (events) => "BEGIN:VCALENDAR\r\n" + events.map((e) => ["BEGIN:VEVENT", ...Object.entries(e).map(([k, v]) => `${k}:${v}`), "END:VEVENT"].join("\r\n")).join("\r\n") + "\r\nEND:VCALENDAR\r\n";

describe("Aufzeichnungs-Rückstand", () => {
  const ses = (id, extra) => ({ id, moduleId: "m", type: "Vorlesung", date: "2026-10-14", start: "10:00", end: "11:30", ...extra });
  it("zählt vergangene, nicht besuchte und nicht ganz angeschaute Vorlesungen mit Restminuten", () => {
    const data = { ...emptyData(), sessions: [
      ses("a"), ses("b", { watchedTo: "60:00" }), ses("c", { attended: true }), ses("d", { watchedTo: "1:30:00" }),
      ses("e", { type: "Übung" }), ses("f", { cancelled: true }), ses("g", { date: "2026-10-28" }), ses("h", { moduleId: "x" }),
      ses("i", { type: "Zentralübung", date: "2026-10-07" }),
    ] };
    const b = recordingBacklog(data, "m", (s) => s.date < T);
    expect(b.list.map((x) => [x.s.id, x.left])).toEqual([["i", 90], ["a", 90], ["b", 30]]);
    expect(b.minutes).toBe(210);
  });
});

describe("Bearbeitungszeit aus früheren Blättern", () => {
  const hw = (id, status = "abgegeben", moduleId = "m") => ({ id, moduleId, title: `Blatt ${id}`, status, due: T });
  const log = (minutes, extra) => ({ id: Math.random().toString(36), moduleId: "m", kind: "Übung/Hausaufgabe", minutes, date: T, ...extra });
  it("erst ab 2 gemessenen Blättern, Median gerundet", () => {
    const one = { ...emptyData(), homework: [hw("1"), hw("2"), hw("3", "ausgegeben")], logs: [log(100, { homeworkId: "1" }), log(140, { homeworkId: "1" })] };
    expect(typicalSheetTime(one, "m")).toBeNull();
    const two = { ...one, logs: [...one.logs, log(200, { note: "Blatt 2" }), log(500, { homeworkId: "3" })] };
    /* Blatt 1: 240, Blatt 2: 200 (alte Einheit, über die Notiz erkannt); Blatt 3 ist noch offen */
    expect(typicalSheetTime(two, "m")).toEqual({ minutes: 210, count: 2 });
    expect(fmtTypical(240)).toBe("meist ~4 h");
    expect(fmtTypical(90)).toBe("meist ~1 h 30 min");
    expect(fmtTypical(45)).toBe("meist ~45 min");
  });
  it("homeworkId hat Vorrang vor der Notiz", () => {
    expect(logOfHomework({ homeworkId: "2", note: "Blatt 1", moduleId: "m", kind: "Übung/Hausaufgabe" }, hw("1"))).toBe(false);
    expect(logOfHomework({ note: "Blatt 1", moduleId: "m", kind: "Nacharbeiten" }, hw("1"))).toBe(false);
  });
});

describe("Mehrere Abgaben am selben Tag", () => {
  it("meldet Tage der nächsten 7 Tage ab 3 offenen Abgaben", () => {
    const h = (due, status = "ausgegeben") => ({ id: Math.random().toString(36), title: "x", due, status });
    const list = [h("2026-10-22"), h("2026-10-22"), h("2026-10-22"), h("2026-10-23"), h("2026-10-23"), h("2026-10-23", "abgegeben"), h("2026-10-29"), h("2026-10-29"), h("2026-10-29")];
    expect(crowdedDueDays(list, T).map((x) => [x.date, x.items.length])).toEqual([["2026-10-22", 3]]);
    expect(crowdedDueDays([...list, h("2026-10-27"), h("2026-10-27"), h("2026-10-27")], T).map((x) => x.date)).toEqual(["2026-10-22", "2026-10-27"]);
  });
});

describe("Link zur Aufgabe", () => {
  const base = () => ({ ...emptyData(), modules: [{ id: "m", name: "Algo" }] });
  it("liest URL und Beschreibung aus dem Kalender", () => {
    const [e] = parseICS(cal([{ UID: "1", SUMMARY: "Blatt 1 ist fällig", DTSTART: "20261023T120000", URL: "https://moodle.example/mod/assign/view.php?id=9", DESCRIPTION: "Bitte abgeben\\, danke" }]));
    expect(e.url).toBe("https://moodle.example/mod/assign/view.php?id=9");
    expect(e.description).toBe("Bitte abgeben, danke");
  });
  it("Moodle: Aktivitätslink aus der Beschreibung, sonst Tagesansicht; Artemis: Aufgaben des Kurses", () => {
    expect(taskUrl({ uid: "5@www.moodle.tum.de", description: "Siehe Aufgabe [https://www.moodle.tum.de/mod/assign/view.php?id=77]", date: T, start: "12:00" })).toBe("https://www.moodle.tum.de/mod/assign/view.php?id=77");
    const day = taskUrl({ uid: "5@www.moodle.tum.de", description: "", date: T, start: "12:00" }, "moodle", "https://www.moodle.tum.de/calendar/export_execute.php?userid=1&authtoken=x");
    expect(day).toBe(`https://www.moodle.tum.de/calendar/view.php?view=day&time=${new Date(`${T}T12:00:00`).getTime() / 1000}`);
    expect(taskUrl({ uid: "urn:uuid:x", date: T }, "artemis:f1", "https://artemis.tum.de/api/calendar/courses/451/calendar-events-ics?token=abc")).toBe("https://artemis.tum.de/courses/451/exercises");
    expect(taskUrl({ uid: "urn:uuid:x", date: T }, "artemis:f1", "https://example.org/kalender.ics")).toBe("");
  });
  it("wird beim Import gespeichert und still nachgetragen", () => {
    const events = parseICS(cal([{ UID: "7@moodle.example", SUMMARY: "Blatt 2 ist fällig", DTSTART: "20261024T235900", CATEGORIES: "ALGO" }]));
    const r = applyMoodle(base(), events, { ALGO: "m" }, T, [], "moodle", "https://moodle.example/calendar/export_execute.php?x=1");
    expect(r.homework[0].url).toMatch(/^https:\/\/moodle\.example\/calendar\/view\.php\?view=day&time=\d+$/);
    expect(taskLinkLabel(r.homework[0])).toBe("In Moodle öffnen");
    const old = { ...base(), homework: [{ ...r.homework[0], url: undefined }] };
    const again = applyMoodle(old, events, { ALGO: "m" }, T, [], "moodle", "https://moodle.example/calendar/export_execute.php?x=1");
    expect(again.homework[0].url).toBe(r.homework[0].url);
    expect(again.stats.updated).toBe(0);
    const art = applyArtemis(base(), { id: "f1", moduleId: "m", url: "https://artemis.tum.de/api/calendar/courses/9/calendar-events-ics?token=t" }, parseICS(cal([{ UID: "a", SUMMARY: "ALGO Exercise | Due: Hausaufgabe 1", DTSTART: "20261025T120000" }])), T);
    expect(taskLinkLabel(art.homework[0])).toBe("In Artemis öffnen");
    expect(taskLinkLabel({ url: "" })).toBeNull();
  });
});

describe("Prüfungen aus den Abos", () => {
  const base = () => ({ ...emptyData(), modules: [{ id: "m", name: "Einführung in die Informatik" }, { id: "d", name: "Diskrete Strukturen" }] });
  it("erkennt Prüfungstermine, aber keine Einsicht, Anmeldung oder Artemis-Nebentermine", () => {
    const yes = ["Klausur Einführung in die Informatik", "Modulprüfung Diskrete Strukturen", "EIDI Exam | Endterm", "Wiederholungsklausur EIDI"];
    const no = ["Klausureinsicht EIDI", "Prüfungsanmeldung", "Probeklausur DS", "EIDI Exam | Results Release: Endterm", "EIDI Klausur | Einsicht Start: Endterm", "Einführung in die Informatik VO", "EIDI Exercise | Due: Blatt 1"];
    yes.forEach((s) => expect(isExamEvent({ summary: s }), s).toBe(true));
    no.forEach((s) => expect(isExamEvent({ summary: s }), s).toBe(false));
  });
  it("findet das Modul über Zuordnung oder Titel", () => {
    const mods = base().modules;
    expect(examModuleOf({ summary: "Klausur Einführung in die Informatik" }, {}, mods)).toBe("m");
    expect(examModuleOf({ summary: "Klausur EIDI" }, { "Klausur EIDI": "d" }, mods)).toBe("d");
    expect(examModuleOf({ summary: "Klausur Einführung in die Informatik" }, { "Klausur Einführung in die Informatik": "__skip" }, mods)).toBeNull();
    expect(examModuleOf({ summary: "Klausur Sport" }, {}, mods)).toBeNull();
  });
  it("legt an, aktualisiert statt doppelt und legt gelöschte nicht wieder an", () => {
    const events = parseICS(cal([{ UID: "k1", SUMMARY: "Klausur Einführung in die Informatik", DTSTART: "20270210T130000", DTEND: "20270210T150000", LOCATION: "MW 0001" }]));
    const of = (e) => examModuleOf(e, {}, base().modules);
    const r = applyExams(base(), events, of, { prefix: "tum", today: T });
    expect(r.stats.added).toBe(1);
    expect(r.exams[0]).toMatchObject({ moduleId: "m", date: "2027-02-10", time: "13:00", room: "MW 0001", feedKey: "tum|k1", result: "offen" });
    /* nochmal: nichts Neues; geänderte Zeit wird übernommen */
    expect(applyExams({ ...base(), exams: r.exams }, events, of, { prefix: "tum", today: T }).stats).toEqual({ added: 0, updated: 0 });
    const moved = parseICS(cal([{ UID: "k1", SUMMARY: "Klausur Einführung in die Informatik", DTSTART: "20270211T090000", LOCATION: "MI HS 1" }]));
    expect(applyExams({ ...base(), exams: r.exams }, moved, of, { prefix: "tum", today: T }).exams[0]).toMatchObject({ date: "2027-02-11", time: "09:00", room: "MI HS 1" });
    /* von Hand geänderte Felder bleiben */
    expect(applyExams({ ...base(), exams: [{ ...r.exams[0], room: "Eigener Raum", locked: ["room"] }] }, moved, of, { prefix: "tum", today: T }).exams[0].room).toBe("Eigener Raum");
    /* vorhandene Prüfung am selben Tag wird übernommen */
    const manual = { id: "x", moduleId: "m", date: "2027-02-10", time: "09:00", room: "" };
    const m2 = applyExams({ ...base(), exams: [manual] }, events, of, { prefix: "tum", today: T });
    expect(m2.exams).toHaveLength(1);
    expect(m2.exams[0]).toMatchObject({ id: "x", time: "13:00", room: "MW 0001", feedKey: "tum|k1" });
    /* ein zweites Abo (Artemis, ohne Raum) ändert die Zeit nicht */
    const art = parseICS(cal([{ UID: "a1", SUMMARY: "EIDI Exam | Endterm", DTSTART: "20270210T123000", DTEND: "20270210T150000" }]));
    expect(applyExams({ ...base(), exams: m2.exams }, art, () => "m", { prefix: "artemis:f", today: T }).stats.updated).toBe(0);
    /* gelöscht: nicht wieder anlegen, auch nicht aus dem anderen Abo */
    const dismissed = examDismissKeys(r.exams[0]);
    expect(applyExams(base(), events, of, { prefix: "tum", today: T, dismissed }).exams).toHaveLength(0);
    expect(applyExams(base(), art, () => "m", { prefix: "artemis:f", today: T, dismissed }).exams).toHaveLength(0);
    /* vergangene werden nicht angelegt */
    expect(applyExams(base(), events, of, { prefix: "tum", today: "2027-03-01" }).exams).toHaveLength(0);
  });
  it("trägt eine Wiederholungsklausur als Wiederholungstermin ein", () => {
    const exams = [{ id: "x", moduleId: "m", date: "2027-02-10", time: "13:00", result: "offen" }];
    const events = parseICS(cal([{ UID: "w", SUMMARY: "Wiederholungsklausur Einführung in die Informatik", DTSTART: "20270410T100000" }]));
    const r = applyExams({ ...base(), exams }, events, () => "m", { prefix: "tum", today: T });
    expect(r.exams).toHaveLength(1);
    expect(r.exams[0]).toMatchObject({ retakeDate: "2027-04-10", retakeKey: "tum|w" });
  });
  it("Prüfungstermine im Stundenplan-Abo werden keine Lehrtermine mehr", () => {
    const events = parseICS(cal([
      { UID: "vo", SUMMARY: "Einführung in die Informatik VO", DTSTART: "20261022T100000", DTEND: "20261022T120000" },
      { UID: "k1", SUMMARY: "Einführung in die Informatik Klausur", DTSTART: "20270210T130000", DTEND: "20270210T150000" },
    ]));
    const map = { "Einführung in die Informatik VO": "m", "Einführung in die Informatik Klausur": "m" };
    const old = { id: "s1", feedKey: "k1|2027-02-10", moduleId: "m", type: "Vorlesung", date: "2027-02-10", start: "13:00", end: "15:00" };
    const r = applyFeed({ ...base(), sessions: [old] }, events, map, T);
    expect(r.sessions.map((s) => s.feedKey)).toEqual(["vo|2026-10-22"]);
  });
});
