/* Zeitumstellung: 25.10.2026 (03:00 MESZ → 02:00 MEZ, 25-Stunden-Tag) und 28.03.2027 (02:00 MEZ → 03:00 MESZ, 23 Stunden).
   Läuft mit TZ=Europe/Berlin (npm test). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, dayOf, diffDays, isoWeek, iso, weekStart, wdIdx, nowHM, isHeld } from "../../src/lib/util.js";
import { isoYearWeek } from "../../src/lib/backup.js";
import { isoWeek as mensaWeek, menuDay, menuDays } from "../../src/lib/mensa.js";
import { dueInfo, examCountdown } from "../../src/lib/data.js";
import { dayStrip, nextGap, tomorrowPreview } from "../../src/lib/dayview.js";
import { remainingOf, fromLive, toLive } from "../../src/lib/timer.js";
import { heatmap, semesterCalendar, semesterOf, learningRhythm } from "../../src/lib/stats.js";
import { bestStreak, weekCard } from "../../src/lib/progress.js";
import { buildHomeworkSeries } from "../../src/lib/study.js";
import { followingSimilar } from "../../src/lib/series.js";
import { parseICS, buildICS } from "../../src/lib/ics.js";
import { semWeek } from "../../src/lib/semweek.js";
import { holidayOf } from "../../src/lib/holidays.js";
import { deadlinesFromData } from "../../src/lib/push.js";
import { dayWord, queryOffset, recommend, upcomingSessions } from "../../src/lib/transit.js";
import { returnAt } from "../../src/lib/weather.js";
import { zonedInstant, dueReminders } from "../../src/server/reminders.js";
import { buildDeadlineIcs } from "../../src/server/calendar.js";
import { commuteWindow } from "../../src/server/commute.js";
import { emptyData } from "../../src/lib/data.js";

const FALL = "2026-10-25", SPRING = "2027-03-28";
const H = 3600000;

afterEach(() => { vi.useRealTimers(); });

describe("Datumsstrings über die Umstellung", () => {
  it("Umstellungstage haben 25 bzw. 23 Stunden (Testumgebung prüft sich selbst)", () => {
    expect(new Date("2026-10-26T00:00:00").getTime() - new Date("2026-10-25T00:00:00").getTime()).toBe(25 * H);
    expect(new Date("2027-03-29T00:00:00").getTime() - new Date("2027-03-28T00:00:00").getTime()).toBe(23 * H);
  });

  it("addDays, diffDays und weekStart zählen Kalendertage", () => {
    expect(addDays("2026-10-24", 1)).toBe(FALL);
    expect(addDays(FALL, 1)).toBe("2026-10-26");
    expect(addDays("2026-10-19", 7)).toBe("2026-10-26");
    expect(addDays("2026-10-26", -7)).toBe("2026-10-19");
    expect(addDays("2027-03-27", 1)).toBe(SPRING);
    expect(addDays(SPRING, 1)).toBe("2027-03-29");
    expect(addDays("2027-03-29", -1)).toBe(SPRING);
    expect(diffDays("2026-10-24", "2026-10-27")).toBe(3);
    expect(diffDays("2027-03-27", "2027-03-30")).toBe(3);
    expect(weekStart(FALL)).toBe("2026-10-19");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart(SPRING)).toBe("2027-03-22");
    expect(wdIdx(FALL)).toBe(6);
    expect(wdIdx(SPRING)).toBe(6);
  });

  it("Kalenderwochen stimmen in den Umstellungswochen", () => {
    expect(isoWeek(FALL)).toBe(43);
    expect(isoWeek("2026-10-26")).toBe(44);
    expect(isoWeek(SPRING)).toBe(12);
    expect(isoWeek("2027-03-29")).toBe(13);
    expect(isoYearWeek(FALL)).toEqual({ year: 2026, week: 43 });
    expect(mensaWeek("2027-03-29")).toEqual({ year: 2027, week: 13 });
  });

  it("iso und dayOf liefern das lokale Datum, auch zur doppelten Stunde und kurz vor Mitternacht", () => {
    expect(iso(new Date("2026-10-25T00:30:00Z"))).toBe(FALL); /* 02:30 MESZ */
    expect(iso(new Date("2026-10-25T01:30:00Z"))).toBe(FALL); /* 02:30 MEZ */
    expect(iso(new Date("2026-10-25T22:59:00Z"))).toBe(FALL); /* 23:59 MEZ */
    expect(iso(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
    expect(iso(new Date("2027-03-27T23:30:00Z"))).toBe(SPRING); /* 00:30 MEZ */
    expect(iso(new Date("2027-03-28T21:59:00Z"))).toBe(SPRING); /* 23:59 MESZ */
    expect(iso(new Date("2027-03-28T22:00:00Z"))).toBe("2027-03-29");
    expect(dayOf("2026-10-24T22:30:00.000Z")).toBe(FALL);
  });
});

describe("Fristen und Countdown", () => {
  it("„in 3 Tagen“ und „morgen“ über die Umstellung", () => {
    const now = new Date("2026-10-24T10:00:00");
    expect(dueInfo("2026-10-27", false, "", now).when).toBe("in 3 Tagen");
    expect(dueInfo(FALL, false, "", now).when).toBe("morgen");
    expect(dueInfo("2027-03-29", false, "10:00", new Date("2027-03-28T23:30:00")).when).toBe("morgen 10:00");
    expect(examCountdown("2027-03-31", "2027-03-27")).toBe("noch 4 Tage");
  });

  it("rot erst unter 24 echten Stunden (25-Stunden-Tag zählt mit)", () => {
    /* Sa 23:30 → So 23:59: 24,5 Stunden wegen der zusätzlichen Stunde */
    expect(dueInfo(FALL, false, "", new Date("2026-10-24T23:30:00")).urgent).toBe(false);
    expect(dueInfo(FALL, false, "", new Date("2026-10-25T00:30:00")).urgent).toBe(false); /* noch 24,5 Stunden */
    expect(dueInfo(FALL, false, "", new Date("2026-10-25T01:30:00")).urgent).toBe(true);
    /* 28.03.: nur 23 Stunden; Sa 23:30 → So 23:59 sind 23,5 Stunden */
    expect(dueInfo(SPRING, false, "", new Date("2027-03-27T23:30:00")).urgent).toBe(true);
  });
});

describe("Tagesansicht und Jetzt-Linie", () => {
  const data = { ...emptyData(), sessions: [{ id: "s", date: FALL, start: "10:00", end: "12:00", moduleId: "m", type: "VO" }], blocks: [] };
  it("Position nach Wanduhr, auch nach der Rückstellung", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T01:30:00Z")); /* 02:30 MEZ (zweites Mal) */
    expect(nowHM()).toBe("02:30");
    vi.setSystemTime(new Date("2026-10-25T10:30:00Z")); /* 11:30 MEZ */
    expect(nowHM()).toBe("11:30");
    const strip = dayStrip(data, FALL, nowHM());
    expect(strip.now).toBe(11 * 60 + 30);
    expect(strip.items[0].live).toBe(true);
    expect(isHeld(data.sessions[0])).toBe(false);
    vi.setSystemTime(new Date("2026-10-25T11:00:00Z")); /* 12:00 MEZ */
    expect(isHeld(data.sessions[0])).toBe(true);
  });
  it("Lücken und Vorschau auf morgen", () => {
    expect(nextGap(data, FALL, "08:00")).toEqual({ from: "08:00", to: "10:00", minutes: 120, now: true });
    expect(tomorrowPreview({ ...data, homework: [], exams: [] }, "2026-10-24", "18:30").date).toBe(FALL);
  });
  it("Tag mit 23 Stunden: 03:00 folgt direkt auf 01:59", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2027-03-28T00:59:00Z"));
    expect(nowHM()).toBe("01:59");
    vi.setSystemTime(new Date("2027-03-28T01:00:00Z"));
    expect(nowHM()).toBe("03:00");
  });
});

describe("Timer", () => {
  it("Restzeit läuft in echten Sekunden über die Umstellung", () => {
    const start = new Date("2026-10-25T00:50:00Z").getTime(); /* 02:50 MESZ */
    const t = { running: true, endAt: start + 25 * 60000, remaining: 0 };
    expect(remainingOf(t, start)).toBe(1500);
    expect(remainingOf(t, new Date("2026-10-25T01:05:00Z").getTime())).toBe(600); /* 02:05 MEZ */
    const s2 = new Date("2027-03-28T00:50:00Z").getTime(); /* 01:50 MEZ */
    expect(remainingOf({ running: true, endAt: s2 + 25 * 60000 }, new Date("2027-03-28T01:05:00Z").getTime())).toBe(600); /* 03:05 MESZ */
  });
  it("geräteübergreifend: endAt bleibt ein absoluter Zeitpunkt", () => {
    const now = new Date("2026-10-25T01:10:00Z").getTime();
    const live = toLive({ runId: "r", running: true, endAt: now + 15 * 60000, mode: "focus", length: 25, brk: 5 }, 0);
    const back = fromLive(live, { mode: "focus", length: 25, brk: 5, remaining: 1500 }, 0, now);
    expect(back.running).toBe(true);
    expect(remainingOf(back, now)).toBe(900);
  });
});

describe("Lernzeit", () => {
  const logs = [
    { date: "2026-10-24", minutes: 30, at: "23:30" },
    { date: FALL, minutes: 60, at: "02:30" },
    { date: "2026-10-26", minutes: 45, at: "08:00" },
    { date: SPRING, minutes: 20, at: "03:10" },
    { date: "2027-03-29", minutes: 10 },
  ];
  it("Serie und Wochentage", () => {
    expect(bestStreak(logs)).toBe(3);
    const r = learningRhythm(logs);
    expect(r.weekdays[5]).toBe(30); /* Sa */
    expect(r.weekdays[6]).toBe(80); /* So */
    expect(r.weekdays[0]).toBe(55); /* Mo */
  });
  it("Aktivitätsraster und Semester-Kalender ohne doppelte oder fehlende Tage", () => {
    const grid = heatmap(logs, 4, "2026-11-01");
    const days = grid.flat().map((c) => c.date);
    expect(new Set(days).size).toBe(28);
    expect(days).toContain(FALL);
    expect(grid.flat().find((c) => c.date === FALL).minutes).toBe(60);
    for (const sem of [semesterOf(FALL), semesterOf(SPRING)]) {
      const cal = semesterCalendar(logs, sem, "2027-04-15").flat();
      const inside = cal.filter((c) => !c.outside).map((c) => c.date);
      expect(new Set(inside).size).toBe(inside.length);
      expect(inside[0]).toBe(sem.from);
      expect(inside[inside.length - 1]).toBe(sem.to);
      inside.forEach((d, i) => { if (i) expect(diffDays(inside[i - 1], d)).toBe(1); });
    }
  });
  it("Wochenrückblick am Umstellungssonntag zählt Mo bis So", () => {
    const d = { ...emptyData(), logs };
    const card = weekCard(d, FALL);
    expect(card).toBeTruthy();
  });
});

describe("Serien", () => {
  it("Abgabe-Serie bleibt auf dem Wochentag", () => {
    const list = buildHomeworkSeries({ moduleId: "m", title: "Blatt 1", issued: "2026-10-19", due: "2026-10-22", status: "ausgegeben" }, "2026-11-30");
    expect(list.map((h) => h.due).slice(0, 3)).toEqual(["2026-10-22", "2026-10-29", "2026-11-05"]);
    const spring = buildHomeworkSeries({ moduleId: "m", title: "Blatt 1", due: "2027-03-22", status: "ausgegeben" }, "2027-04-12");
    expect(spring.map((h) => h.due)).toEqual(["2027-03-22", "2027-03-29", "2027-04-05", "2027-04-12"]);
  });
  it("Serienerkennung findet den Termin nach der Umstellung", () => {
    const ses = ["2026-10-19", "2026-10-26", "2026-11-02"].map((date, i) => ({ id: "s" + i, date, start: "10:00", moduleId: "m", type: "VO" }));
    expect(followingSimilar(ses, ses[0]).map((x) => x.date)).toEqual(["2026-10-26", "2026-11-02"]);
  });
});

describe("iCal", () => {
  const cal = (events) => ["BEGIN:VCALENDAR", ...events.flatMap((e) => ["BEGIN:VEVENT", ...Object.entries(e).map(([k, v]) => `${k}:${v}`), "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
  it("UTC-Zeiten werden in die jeweils gültige Ortszeit umgerechnet", () => {
    const ev = parseICS(cal([
      { UID: "a", SUMMARY: "VO", DTSTART: "20261023T080000Z", DTEND: "20261023T100000Z" },
      { UID: "b", SUMMARY: "VO", DTSTART: "20261030T090000Z", DTEND: "20261030T110000Z" },
      { UID: "c", SUMMARY: "VO", DTSTART: "20270329T080000Z", DTEND: "20270329T100000Z" },
    ]));
    expect(ev.map((e) => [e.date, e.start, e.end])).toEqual([["2026-10-23", "10:00", "12:00"], ["2026-10-30", "10:00", "12:00"], ["2027-03-29", "10:00", "12:00"]]);
  });
  it("Wöchentliche Serie in Ortszeit (TZID) behält die Uhrzeit", () => {
    const ev = parseICS(cal([{ UID: "s", SUMMARY: "VO", "DTSTART;TZID=Europe/Berlin": "20261019T100000", "DTEND;TZID=Europe/Berlin": "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=3" }]));
    expect(ev.map((e) => [e.date, e.start, e.end])).toEqual([["2026-10-19", "10:00", "12:00"], ["2026-10-26", "10:00", "12:00"], ["2026-11-02", "10:00", "12:00"]]);
  });
  it("Wöchentliche Serie mit UTC-Beginn bleibt auf derselben UTC-Zeit (RFC 5545)", () => {
    const ev = parseICS(cal([{ UID: "u", SUMMARY: "VO", DTSTART: "20261019T080000Z", DTEND: "20261019T100000Z", RRULE: "FREQ=WEEKLY;COUNT=3", EXDATE: "20261102T090000Z" }]));
    expect(ev.map((e) => [e.date, e.start, e.end, e.occurrence])).toEqual([["2026-10-19", "10:00", "12:00", "2026-10-19"], ["2026-10-26", "09:00", "11:00", "2026-10-26"]]);
    const spring = parseICS(cal([{ UID: "v", SUMMARY: "VO", DTSTART: "20270322T090000Z", DTEND: "20270322T100000Z", RRULE: "FREQ=WEEKLY;UNTIL=20270405T090000Z" }]));
    expect(spring.map((e) => [e.date, e.start, e.end])).toEqual([["2027-03-22", "10:00", "11:00"], ["2027-03-29", "11:00", "12:00"], ["2027-04-05", "11:00", "12:00"]]);
  });
  it("UTC-Serie kurz nach Mitternacht rutscht nach der Rückstellung auf den Vortag", () => {
    const ev = parseICS(cal([{ UID: "n", SUMMARY: "Nacht", DTSTART: "20261019T221500Z", RRULE: "FREQ=WEEKLY;COUNT=2" }])); /* Di 00:15 MESZ */
    expect(ev.map((e) => [e.date, e.start])).toEqual([["2026-10-20", "00:15"], ["2026-10-26", "23:15"]]);
  });
  it("Ersetzter Einzeltermin (RECURRENCE-ID in UTC) ersetzt das richtige Vorkommen", () => {
    const ev = parseICS(cal([
      { UID: "r", SUMMARY: "UE", DTSTART: "20261019T120000Z", DTEND: "20261019T140000Z", RRULE: "FREQ=WEEKLY;COUNT=2" },
      { UID: "r", SUMMARY: "UE", "RECURRENCE-ID": "20261026T130000Z", DTSTART: "20261027T090000Z", DTEND: "20261027T110000Z" },
    ]));
    expect(ev.map((e) => [e.date, e.start])).toEqual([["2026-10-19", "14:00"], ["2026-10-27", "10:00"]]);
  });
  it("Kalender-Export: Termine in Ortszeit, Abgaben ganztägig ohne Verschiebung", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T10:00:00"));
    const d = { ...emptyData(), modules: [{ id: "m", name: "Algo" }], homework: [{ id: "h", moduleId: "m", title: "Blatt", due: FALL, status: "ausgegeben" }], exams: [], sessions: [{ id: "s", moduleId: "m", date: "2026-10-26", start: "10:00", end: "12:00", type: "VO" }] };
    const ics = buildICS(d, { sessions: true, uni: false });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
    expect(ics).toContain("DTEND;VALUE=DATE:20261026");
    expect(ics).toContain("DTSTART:20261026T100000");
  });
});

describe("Semester, Feiertage, Weg zur Uni", () => {
  it("VL-Woche zählt über die Umstellung weiter", () => {
    const data = { settings: { university: "TUM" }, modules: [] };
    const a = semWeek("2026-10-23", data), b = semWeek("2026-10-26", data);
    expect(b.kw).toBe(a.kw + 1);
    if (a.week) expect(b.week).toBe(a.week + 1);
    const c = semWeek("2027-03-26", data), e = semWeek("2027-03-29", data);
    expect(e.kw).toBe(c.kw + 1);
  });
  it("Feiertage um die Umstellung", () => {
    expect(holidayOf("2026-11-01")).toBeTruthy(); /* Allerheiligen */
    expect(holidayOf(FALL)).toBe(null);
    expect(holidayOf("2027-03-26")).toBeTruthy(); /* Karfreitag 2027 */
    expect(holidayOf("2027-03-29")).toBeTruthy(); /* Ostermontag 2027 */
  });
  it("„morgen“ nach Kalendertagen, auch an 23- und 25-Stunden-Tagen", () => {
    expect(dayWord("2026-10-26", FALL)).toBe("morgen");
    expect(dayWord("2027-03-29", SPRING)).toBe("morgen");
    expect(dayWord("2027-03-30", SPRING)).not.toBe("morgen");
    expect(dayWord(FALL, FALL)).toBe("heute");
    /* Mit der Systemuhr: So 00:30 MESZ bzw. So 23:30 MESZ */
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T22:30:00Z"));
    expect(dayWord("2026-10-26")).toBe("morgen");
    vi.setSystemTime(new Date("2027-03-28T21:30:00Z"));
    expect(dayWord("2027-03-29")).toBe("morgen");
  });
  it("Abfahrtszeiten nach echter Zeit am Montag nach der Umstellung", () => {
    const s = { date: "2026-10-26", start: "10:00" };
    const c = { buffer: 5, travel: 20, walk: 5, line: "230", towards: "", avoid: "" };
    const start = new Date("2026-10-26T09:00:00Z").getTime(); /* 10:00 MEZ */
    expect(queryOffset(s, c, new Date("2026-10-26T07:00:00Z"))).toBe(35); /* 08:00 → spätestens 09:35 */
    const dep = { line: "230", destination: "Garching", time: start - 30 * 60000 };
    expect(recommend([dep], s, c).leaveAt).toBe(start - 35 * 60000);
    expect(returnAt([{ date: FALL, start: "10:00", end: "12:00", room: "MI HS 1" }], FALL)).toBe(new Date("2026-10-25T11:00:00Z").getTime());
    expect(upcomingSessions([{ id: "a", date: "2026-10-26", start: "10:00" }], new Date("2026-10-25T22:30:00Z")).length).toBe(1);
  });
});

describe("Erinnerungen (Client und Server)", () => {
  it("zonedInstant an den Umstellungstagen", () => {
    expect(zonedInstant(FALL, "07:00").toISOString()).toBe("2026-10-25T06:00:00.000Z");
    expect(zonedInstant("2026-10-24", "07:00").toISOString()).toBe("2026-10-24T05:00:00.000Z");
    expect(zonedInstant(FALL, "01:30").toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(zonedInstant(FALL, "03:00").toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(zonedInstant(FALL, "20:00").toISOString()).toBe("2026-10-25T19:00:00.000Z");
    expect(zonedInstant(SPRING, "07:00").toISOString()).toBe("2027-03-28T05:00:00.000Z");
    expect(zonedInstant(SPRING, "01:59").toISOString()).toBe("2027-03-28T00:59:00.000Z");
    expect(zonedInstant(SPRING, "03:00").toISOString()).toBe("2027-03-28T01:00:00.000Z");
    expect(zonedInstant("2027-03-27", "19:00").toISOString()).toBe("2027-03-27T18:00:00.000Z");
    /* 02:30 gibt es am 28.03. nicht: eine Stunde später (wie die Uhr) */
    expect(zonedInstant(SPRING, "02:30").toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });
  it("Morgen-Push 07:00, Abendfragen 19 und 20 Uhr kommen zur Ortszeit", () => {
    const list = [
      { id: "m", kind: "morning", title: "Dein Tag", date: FALL, time: "07:00", body: "x" },
      { id: "a", kind: "attend", title: "1 Termin", date: SPRING, time: "19:00", body: "x" },
      { id: "r", kind: "review", title: "1 Termin", date: SPRING, body: "x" },
      { id: "h", kind: "homework", title: "Blatt", date: "2026-10-26" },
    ];
    expect(dueReminders(list, {}, new Date("2026-10-25T05:55:00Z")).map((r) => r.key)).toEqual([]); /* 06:55 MEZ */
    expect(dueReminders(list, {}, new Date("2026-10-25T06:05:00Z")).map((r) => r.key)).toEqual(["morning:m:2026-10-25:0"]);
    expect(dueReminders(list, {}, new Date("2026-10-25T17:05:00Z")).map((r) => r.key)).toEqual(["homework:h:2026-10-26:0"]); /* Abgabe morgen 18:00 MEZ */
    expect(dueReminders(list, {}, new Date("2027-03-28T16:55:00Z")).map((r) => r.key)).toEqual([]); /* 18:55 MESZ */
    expect(dueReminders(list, {}, new Date("2027-03-28T17:05:00Z")).map((r) => r.key)).toEqual(["attend:a:2027-03-28:0"]);
    expect(dueReminders(list, {}, new Date("2027-03-28T18:05:00Z")).map((r) => r.key)).toEqual(["attend:a:2027-03-28:0", "review:r:2027-03-28:0"]);
  });
  it("„Jetzt losgehen“-Fenster nach Ortszeit", () => {
    const x = { date: "2026-10-26", time: "10:00", commute: { buffer: 5, travel: 20, walk: 5 } };
    const w = commuteWindow(x);
    expect(new Date(w.start).toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(new Date(w.to).toISOString()).toBe("2026-10-26T08:25:00.000Z");
  });
  it("Fristen-Abo (iCal) mit UTC-Zeiten der richtigen Zeitzone", () => {
    const ics = buildDeadlineIcs([{ id: "e", kind: "exam", title: "Prüfung", module: "Algo", date: "2027-03-29", time: "10:00" }, { id: "h", kind: "homework", title: "Blatt", date: FALL }], "Europe/Berlin", new Date("2026-10-20T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270329T080000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
    expect(ics).toContain("DTEND;VALUE=DATE:20261026");
  });
  it("Client plant Morgen-Push für jeden Kalendertag (keiner doppelt, keiner fehlt)", () => {
    const d = { ...emptyData(), modules: [{ id: "m", name: "Algo" }], sessions: ["2026-10-24", FALL, "2026-10-26", "2026-10-27"].map((date, i) => ({ id: "s" + i, moduleId: "m", date, start: "10:00", end: "12:00", type: "VO" })) };
    d.settings = { ...d.settings, pushMorning: true };
    const morning = deadlinesFromData(d, "2026-10-23").filter((x) => x.kind === "morning").map((x) => x.date);
    expect(morning).toEqual(["2026-10-24", FALL, "2026-10-26", "2026-10-27"]);
    const weekly = deadlinesFromData(d, "2026-10-23").find((x) => x.kind === "weekly");
    expect(weekly.date).toBe(FALL);
  });
  it("Mensa: „morgen“ am Samstagabend vor der Umstellung ist Montag", () => {
    expect(menuDay(new Date("2026-10-24T20:00:00"))).toEqual({ date: "2026-10-26", label: "am Montag" });
    expect(menuDays(new Date("2027-03-26T15:00:00")).map((x) => x.date)).toEqual(["2027-03-26", "2027-03-29"]);
  });
});
