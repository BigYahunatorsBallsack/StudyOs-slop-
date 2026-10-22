/* Einzeltests für bisher ungetestete Helfer der Logik-Schicht (util, data, forms, holidays, todo, next, transit,
   tum, study, mensa, moodle, recent, stats, progress, feed) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, byTime, diffDays, fmt, fmtDec, fmtH, fmtMin, fmtShort, isHeld, isoWeek, isoYearWeek, parseDec, pct, sum, wdIdx, weekStart, dayOf } from "../../src/lib/util.js";
import { COUNTDOWN_DAYS, countsOf, demoData, dueInfo, emptyData, examCountdown, isOpenHw, migrate, moduleStats, normalizeImport, repairCollapsedWeeklySeries, streakOf, upgradeSettings } from "../../src/lib/data.js";
import { DATA_VERSION } from "../../src/lib/constants.js";
import { byUse, formDef, modOpts, opt, topicOpts, EFFORT_OPTS, STAR_OPTS } from "../../src/lib/forms.js";
import { TUM_BREAKS, breakOf, breaksOf, cancelOffDays, easter, holidaysOf, inBreak } from "../../src/lib/holidays.js";
import { dueLabel, isLate, openTodayCount, REVIEW_WITHIN_DAYS, todoItems } from "../../src/lib/todo.js";
import { inWords, nextUp } from "../../src/lib/next.js";
import { CAMPUSES, commuteIncomplete, commuteOf, firstSessionOn, hhmm, isOnline, mapsLink, vehicle } from "../../src/lib/transit.js";
import { fmtWatch, gradeForecast, isGop, parseWatch, roomUrl, watchProgress } from "../../src/lib/tum.js";
import { HOURS_PER_ECTS, archivedIds, numberOf, openHomework, sessionCoverage, sessionLength, studyDiary, withoutArchived } from "../../src/lib/study.js";
import { CANTEENS, canteenName, dishesOn, menuUrl } from "../../src/lib/mensa.js";
import { artemisMap, courseOf, dueOf, feedSummary } from "../../src/lib/moodle.js";
import { readRecent, rememberOpened } from "../../src/lib/recent.js";
import { DAYPARTS, examDeadlines, learningRhythm, minutesBySemester, semesterOf } from "../../src/lib/stats.js";
import { cardReviews, skyPos, weakByTag, weakCards } from "../../src/lib/progress.js";
import { CHANGE_DAYS, CHANGE_FIELDS, FEED_VERSION, SOON_DAYS, describeChange, feedChanges, roomChange } from "../../src/lib/feed.js";
import { FSRS_W, retrievability } from "../../src/lib/cards.js";

const T = "2026-10-21"; /* Mittwoch */

describe("util", () => {
  it("Datumsrechnung über Monatsende, Jahreswechsel, Schaltjahr und Zeitumstellung", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); /* über die Umstellung am 25.10. */
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
    expect(diffDays("2026-03-30", "2026-03-28")).toBe(-2);
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
    expect(diffDays("2028-01-01", "2029-01-01")).toBe(366);
  });
  it("Wochentag, Wochenbeginn und ISO-Woche", () => {
    expect(wdIdx(T)).toBe(2);
    expect(wdIdx("2026-10-25")).toBe(6);
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
    expect(isoYearWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoYearWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoYearWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(T)).toBe(43);
  });
  it("Formatierung", () => {
    expect(fmt("2026-10-21")).toBe("21.10.2026");
    expect(fmt("")).toBe("");
    expect(fmt("2026-10-19T23:30:00.000Z")).toBe("20.10.2026"); /* lokal schon der nächste Tag */
    expect(dayOf("kaputt-und-lang")).toBe("kaputt-und");
    expect(fmtShort(T)).toBe("Mi, 21.10.");
    expect(fmtShort("")).toBe("");
    expect(pct(null)).toBe("–");
    expect(pct(0.456)).toBe("46 %");
    expect(fmtMin(0)).toBe("0 min");
    expect(fmtMin(59.6)).toBe("1 h");
    expect(fmtMin(125)).toBe("2 h 5 min");
    expect(fmtMin(undefined)).toBe("0 min");
    expect(fmtH(2.5)).toBe("2,5 h");
    expect(fmtH(14.4)).toBe("14 h");
  });
  it("Zahlen mit Komma", () => {
    expect(parseDec("1,7")).toBe(1.7);
    expect(parseDec(" ")).toBeNull();
    expect(parseDec(null)).toBeNull();
    expect(parseDec("abc")).toBeNaN();
    expect(fmtDec(1.7)).toBe("1,7");
    expect(fmtDec("")).toBe("");
    expect(sum([{ m: "3" }, { m: "x" }, { m: 4 }], (x) => x.m)).toBe(7);
  });
  it("Sortierung nach Zeit und gehaltene Termine", () => {
    const list = [{ date: "2026-10-21", start: "10:00" }, { date: "2026-10-20" }, { date: "2026-10-21", start: "08:00" }];
    expect([...list].sort(byTime).map((x) => x.start || "")).toEqual(["", "08:00", "10:00"]);
    expect(isHeld({ date: "2000-01-01" })).toBe(true);
    expect(isHeld({ date: "2999-01-01" })).toBe(false);
  });
});

describe("data", () => {
  it("repariert Serien, deren Termine alle auf einem Datum liegen", () => {
    const s = [{ id: "a", seriesId: "x", date: "2026-10-05" }, { id: "b", seriesId: "x", date: "2026-10-05" }, { id: "c", seriesId: "x", date: "2026-10-05" }, { id: "d", date: "2026-10-05" }];
    expect(repairCollapsedWeeklySeries(s).map((x) => x.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-05"]);
    const ok = [{ id: "a", seriesId: "y", date: "2026-10-05" }, { id: "b", seriesId: "y", date: "2026-10-12" }];
    expect(repairCollapsedWeeklySeries(ok).map((x) => x.date)).toEqual(["2026-10-05", "2026-10-12"]);
  });
  it("alte Vorgaben bleiben für ältere Einstellungen, neue Stände bleiben unberührt", () => {
    expect(upgradeSettings({ defaultsRev: 2 })).toEqual({});
    const old = upgradeSettings({});
    expect(old).toMatchObject({ program: "Informatik", mensa: "mensa-garching", curriculum: "tum-bsc-informatik-2026", defaultsRev: 2 });
    expect(old.commute.line).toBe("230");
    expect(upgradeSettings({ university: "LMU", program: "Physik", commute: null })).toMatchObject({ mensa: "", curriculum: "", commute: null });
    const own = upgradeSettings({ commute: { walk: 3, feeder: null } });
    expect(own.commute.walk).toBe(3);
    expect(own.commute.feeder).toBeNull();
  });
  it("migrate füllt fehlende Felder und wirft kaputte Einträge weg", () => {
    const m = migrate({ modules: [{ id: "m", name: "A" }, null, { name: "ohne id" }], sessions: [{ id: "s", date: "2026-10-01" }], cards: [{ id: "c", front: "F" }], exams: [{ id: "e" }], deleted: [{ c: "modules", id: "x", at: "2026-01-01" }, { c: "quatsch", id: "y", at: "z" }] });
    expect(m.version).toBe(DATA_VERSION);
    expect(m.modules).toHaveLength(1);
    expect(m.modules[0].color).toBeTruthy();
    expect(m.sessions[0]).toMatchObject({ cancelled: false, attended: false, reviewedAt: null });
    expect(m.cards[0]).toMatchObject({ ease: 2.5, reps: 0 });
    expect(m.exams[0]).toMatchObject({ attempt: 1, freeWeekdays: [] });
    expect(m.deleted).toHaveLength(1);
    expect(m.notes).toEqual([]);
  });
  it("normalizeImport prüft Form und Version", () => {
    expect(() => normalizeImport(null)).toThrow(/modules/);
    expect(() => normalizeImport({ modules: [], version: DATA_VERSION + 1 })).toThrow(/neueren/);
    expect(normalizeImport({ modules: [] }).modules).toEqual([]);
  });
  it("Zählung, offene Abgaben, Serie und Countdown", () => {
    expect(countsOf(emptyData())).toBe("0 Module, 0 Termine, 0 Hausaufgaben, 0 Themen, 0 Lerneinheiten, 0 Notizen, 0 Karten, 0 Prüfungen");
    expect(isOpenHw({ status: "ausgegeben" })).toBe(true);
    expect(isOpenHw({ status: "abgegeben" })).toBe(false);
    expect(isOpenHw({ status: "in Arbeit", missed: true })).toBe(false);
    expect(streakOf([])).toBe(0);
    expect(examCountdown("", T)).toBeNull();
    expect(examCountdown(T, T)).toBe("heute");
    expect(examCountdown(addDays(T, 1), T)).toBe("morgen");
    expect(examCountdown(addDays(T, 12), T)).toBe("noch 12 Tage");
    expect(examCountdown(addDays(T, COUNTDOWN_DAYS), T)).toBeNull();
    expect(examCountdown(addDays(T, -1), T)).toBeNull();
  });
  it("Frist lesbar, auch über Mitternacht", () => {
    const now = new Date("2026-10-21T23:30:00");
    expect(dueInfo("", false, "", now).text).toBe("ohne Frist");
    expect(dueInfo(T, true, "", now).text).toBe("Abgabe Mi, 21.10.");
    expect(dueInfo(T, false, "", now)).toMatchObject({ text: "Abgabe heute", urgent: true });
    expect(dueInfo("2026-10-22", false, "08:00", now)).toMatchObject({ text: "Abgabe morgen 08:00", urgent: true });
    expect(dueInfo("2026-10-20", false, "", now).text).toBe("überfällig seit gestern");
    expect(dueInfo("2026-10-18", false, "", now).text).toBe("überfällig seit 3 Tagen");
    expect(dueInfo(T, false, "12:00", now).text).toBe("überfällig seit 12:00");
    expect(dueInfo("2026-10-25", false, "", now).text).toBe("Abgabe in 4 Tagen");
    expect(dueInfo("2026-11-05", false, "", now).text).toBe("Abgabe Do, 05.11.");
  });
  it("Modulstatistik ohne Einträge hat keine Quoten", () => {
    const d = { ...emptyData(), modules: [{ id: "m", bonusPct: "50" }] };
    expect(moduleStats(d, "m")).toMatchObject({ held: 0, overall: null, reviewQuote: null, pointsQuote: null, bonusPct: 50 });
  });
  it("Beispieldaten sind in sich stimmig", () => {
    const d = demoData();
    const ids = new Set(d.modules.map((m) => m.id));
    expect(d.modules).toHaveLength(4);
    for (const c of ["sessions", "homework", "topics", "logs", "cards", "exams", "notes"]) for (const x of d[c]) expect(ids.has(x.moduleId)).toBe(true);
    expect(new Set(d.sessions.map((s) => s.id)).size).toBe(d.sessions.length);
    expect(migrate(d).sessions).toHaveLength(d.sessions.length);
  });
});

describe("forms", () => {
  const d = {
    modules: [{ id: "a", name: "Analysis" }, { id: "b", name: "Bio" }, { id: "c", name: "Chemie", archived: true }, { id: "e", name: "Elektro" }],
    logs: [{ date: "2026-10-20", moduleId: "e" }, { date: "2026-10-19", moduleId: "e" }, { date: "2026-01-01", moduleId: "a" }],
    homework: [{ created: "2026-10-15", moduleId: "b" }],
    notes: [{ updated: "2026-10-20T10:00:00.000Z", moduleId: "e" }],
    topics: [{ id: "t2", moduleId: "a", title: "Zwei", order: 2 }, { id: "t1", moduleId: "a", title: "Eins", order: 1 }, { id: "t3", moduleId: "b", title: "Bio" }],
    sessions: [],
  };
  it("zuletzt genutzte Module zuerst, archivierte zuletzt", () => {
    expect(byUse(d, T).map((m) => m.id)).toEqual(["e", "b", "a", "c"]);
    expect(modOpts(d, true)[0]).toEqual({ value: "", label: "Allgemein (kein Modul)" });
    expect(modOpts(d, false)).toHaveLength(4);
  });
  it("Themen nach Reihenfolge, Optionen", () => {
    expect(topicOpts(d, { moduleId: "a" }).map((o) => o.value)).toEqual(["", "t1", "t2"]);
    expect(opt(["x", { value: "y", label: "Y" }])).toEqual([{ value: "x", label: "x" }, { value: "y", label: "Y" }]);
    expect(EFFORT_OPTS.map((o) => o.value)).toEqual(["1", "2", "3"]);
    expect(STAR_OPTS[5].label).toBe("★★★★★");
  });
  it("Prüfregeln der Formulare", () => {
    const v = (kind, vals) => formDef(kind, d).validate(vals);
    expect(v("session", { start: "12:00", end: "10:00" })).toMatch(/Ende/);
    expect(v("session", { start: "10:00", end: "12:00", date: T, repeatUntil: "2026-10-01" })).toMatch(/Wiederholungsende/);
    expect(v("session", { start: "10:00", end: "12:00", watchedTo: "99:99" })).toMatch(/Angeschaut/);
    expect(v("session", { start: "10:00", end: "12:00", watchedTo: "47:12" })).toBe("");
    expect(v("homework", { issued: T, due: "2026-10-01" })).toMatch(/Ausgabedatum/);
    expect(v("homework", { due: T, points: "12", maxPoints: "10" })).toMatch(/Punkte/);
    expect(v("homework", { due: T, points: 0, maxPoints: "" })).toBe("");
    expect(v("log", { minutes: 0 })).toMatch(/Dauer/);
    expect(v("card", { front: "{{c1::x}}", back: "" })).toBe("");
    expect(v("card", { front: "Frage", back: " " })).toMatch(/Rückseite/);
    expect(v("module", { liveUrl: "http://x" })).toMatch(/https/);
    expect(v("block", { start: "10:00", end: "09:00" })).toMatch(/Ende/);
    expect(formDef("quatsch", d)).toEqual({ title: "", fields: [] });
    for (const k of ["module", "session", "homework", "topic", "block", "log", "note", "card", "exam"]) expect(formDef(k, d).fields.length).toBeGreaterThan(0);
  });
});

describe("holidays", () => {
  it("Ostern und bewegliche Feiertage", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(easter(2000)).toBe("2000-04-23");
    const h = holidaysOf(2026);
    expect(h.get("2026-04-03")).toBe("Karfreitag");
    expect(h.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(h.get("2026-06-04")).toBe("Fronleichnam");
    expect(holidaysOf(2026)).toBe(h); /* zwischengespeichert */
  });
  it("vorlesungsfreie Zeit: eigene, TUM, Weihnachten", () => {
    const tum = { university: "TUM", breaks: [{ from: "2026-11-02", to: "2026-11-06", label: "Exkursion" }, { from: "2026-12-10", to: "2026-12-01" }, null] };
    expect(breaksOf(tum)).toEqual([tum.breaks[0], ...TUM_BREAKS]);
    expect(breaksOf({ ...tum, tumBreaks: false })).toEqual([tum.breaks[0]]);
    expect(breakOf("2026-11-03", tum)).toEqual({ kind: "break", label: "Exkursion" });
    expect(breakOf("2026-12-28", tum).label).toBe("Weihnachtspause");
    expect(breakOf("2027-01-06", tum).label).toBe("Weihnachtspause");
    expect(breakOf("2027-01-07", tum)).toBeNull();
    expect(breakOf("2026-12-28", { university: "LMU" })).toBeNull();
    expect(breakOf("2026-12-28", { ...tum, christmasBreak: false })).toBeNull();
    expect(inBreak("2027-03-01", tum)).toBe(true);
    expect(breakOf("", tum)).toBeNull();
  });
  it("selbst angelegte Termine an Feiertagen fallen einmal aus", () => {
    const s = [
      { id: "a", date: "2026-12-25", type: "Vorlesung" },
      { id: "b", date: "2026-12-25", type: "Vorlesung", feedKey: "k" },
      { id: "c", date: "2026-12-25", type: "Sonstiges" },
      { id: "d", date: "2026-12-25", type: "Vorlesung", offChecked: true },
      { id: "e", date: "2025-12-25", type: "Vorlesung" },
      { id: "f", date: "2026-11-25", type: "Vorlesung" },
    ];
    const r = cancelOffDays(s, {}, T);
    expect(r.count).toBe(1);
    expect(r.sessions[0]).toMatchObject({ cancelled: true, offChecked: true, offReason: "1. Weihnachtstag" });
    const rest = s.slice(1);
    expect(cancelOffDays(rest, {}, T)).toEqual({ sessions: rest, count: 0 });
    expect(cancelOffDays(rest, {}, T).sessions).toBe(rest); /* nichts zu tun: dieselbe Liste */
  });
});

describe("todo und Als Nächstes", () => {
  it("Fristen kurz", () => {
    expect(dueLabel("2026-10-20", T)).toBe("seit gestern");
    expect(dueLabel("2026-10-18", T)).toBe("seit 3 Tagen");
    expect(dueLabel(T, T)).toBe("heute");
    expect(dueLabel("2026-10-22", T)).toBe("morgen");
    expect(dueLabel("2026-10-26", T)).toBe("in 5 Tagen");
    expect(isLate({ kind: "homework", due: "2026-10-20" }, T)).toBe(true);
    expect(isLate({ kind: "review", due: "2026-10-20" }, T)).toBe(false);
    expect(REVIEW_WITHIN_DAYS).toBe(2);
  });
  it("Zahl am App-Symbol: fällige Abgaben, Nachbereitungen, Karten als eins", () => {
    const d = { ...emptyData(),
      homework: [{ id: "h1", due: T, status: "ausgegeben" }, { id: "h2", due: "2026-10-25", status: "ausgegeben" }, { id: "h3", due: "2026-10-01", status: "abgegeben" }],
      sessions: [{ id: "s", date: "2026-10-19", end: "10:00" }],
      cards: [{ id: "c1", due: T }, { id: "c2", due: "2026-10-01" }, { id: "c3", due: "2026-11-01" }],
      exams: [{ id: "e", registerBy: "2026-10-23" }] };
    const items = todoItems(d, T);
    expect(items.map((x) => x.kind)).toEqual(["homework", "review", "cards", "register", "homework"]);
    expect(items.find((x) => x.kind === "cards").count).toBe(2);
    expect(openTodayCount(d, T)).toBe(3);
  });
  it("inWords", () => {
    expect(inWords(0)).toBe("jetzt");
    expect(inWords(45)).toBe("in 45 min");
    expect(inWords(60)).toBe("in 1 h");
    expect(inWords(95)).toBe("in 1 h 35 min");
    expect(inWords(200)).toBeNull();
  });
  it("Reihenfolge: laufend > Prüfung > Abgabe > später heute > morgen > bald > ruhig", () => {
    const base = { ...emptyData() };
    const ses = (id, date, start, end) => ({ id, moduleId: "m", date, start, end });
    expect(nextUp(base, T, "10:00")).toEqual({ type: "calm" });
    expect(nextUp({ ...base, sessions: [ses("a", T, "09:00", "11:00")] }, T, "10:00")).toMatchObject({ type: "session", live: true, when: "Läuft gerade, noch 60 min" });
    expect(nextUp({ ...base, exams: [{ id: "e", date: addDays(T, 1), time: "09:00" }] }, T, "10:00").when).toBe("Prüfung morgen um 09:00");
    expect(nextUp({ ...base, exams: [{ id: "e", date: T, time: "09:00" }] }, T, "10:00")).toEqual({ type: "calm" }); /* schon vorbei */
    expect(nextUp({ ...base, homework: [{ id: "h", due: "2026-10-20", status: "ausgegeben" }] }, T, "10:00").when).toBe("Überfällig seit 1 Tag");
    expect(nextUp({ ...base, sessions: [ses("a", T, "11:30", "13:00")] }, T, "10:00").when).toBe("in 1 h 30 min");
    expect(nextUp({ ...base, sessions: [ses("a", T, "16:00", "18:00")] }, T, "10:00").when).toBe("Heute um 16:00");
    expect(nextUp({ ...base, homework: [{ id: "h", due: "2026-10-22", dueTime: "12:00", status: "ausgegeben" }] }, T, "10:00").when).toBe("Abgabe morgen 12:00");
    expect(nextUp({ ...base, sessions: [ses("a", "2026-10-23", "08:00", "10:00")] }, T, "10:00").when).toBe("In 2 Tagen um 08:00");
    expect(nextUp({ ...base, sessions: [{ ...ses("a", T, "09:00", "11:00"), cancelled: true }] }, T, "10:00")).toEqual({ type: "calm" });
  });
});

describe("transit", () => {
  it("Online-Termine und erster Termin des Tages", () => {
    expect(isOnline({ room: "https://zoom.us/j/1" })).toBe(true);
    expect(isOnline({ room: "Online (Zoom)" })).toBe(true);
    expect(isOnline({ room: "MI HS 1", type: "Vorlesung" })).toBe(false);
    expect(isOnline(null)).toBe(false);
    const s = [{ id: "a", date: T, start: "12:00" }, { id: "b", date: T, start: "08:00", cancelled: true }, { id: "c", date: T, start: "9:00" }, { id: "d", date: T, start: "10:00" }];
    expect(firstSessionOn(s, T).id).toBe("d");
    expect(firstSessionOn(s, "2026-10-22")).toBeUndefined();
  });
  it("Verkehrsmittel, Uhrzeit, Kartenlink", () => {
    expect(vehicle({ line: "230", type: "BUS" })).toEqual({ icon: "bus", with: "mit dem Bus 230" });
    expect(vehicle({ line: "S6", type: "SBAHN" })).toEqual({ icon: "train", with: "mit der S6" });
    expect(vehicle({ line: "17", type: "TRAM" }).icon).toBe("bus"); /* Ziffer am Anfang: wie bisher Bus */
    expect(vehicle({ line: "", type: "" }).with).toBe("mit der Bahn");
    expect(hhmm(new Date("2026-10-21T08:05:00").getTime())).toBe("08:05");
    expect(mapsLink({ from: "A B", to: "C" })).toBe("https://www.google.com/maps/dir/?api=1&origin=A%20B&destination=C&travelmode=driving");
    expect(mapsLink({ from: "A", to: "C" }, true)).not.toContain("origin");
  });
  it("Pendel-Einstellungen: aus, Campus nach Studiengang", () => {
    expect(commuteOf({})).toBeNull();
    const c = commuteOf({ commute: { mode: "car", car: {} }, program: "Pharmazeutische Bioprozesstechnik PBT" });
    expect(c.car.campus).toBe("weihenstephan");
    expect(commuteIncomplete(c)).toBe(false);
    expect(commuteOf({ commute: { car: { campus: "garching" } } }).car.to).toBe(CAMPUSES[0].to);
    expect(commuteIncomplete({ mode: "transit", station: {}, feeder: null })).toBe(true);
  });
});

describe("tum", () => {
  it("NavigaTUM-Links", () => {
    expect(roomUrl("")).toBeNull();
    expect(roomUrl("MI HS 1 (5602.EG.001)")).toBe("https://nav.tum.de/room/5602.EG.001");
    expect(roomUrl("Interims I, Hörsaal 1")).toBe("https://nav.tum.de/search?q=Interims%20I");
  });
  it("Aufzeichnungsstand", () => {
    expect(parseWatch("")).toBeNull();
    expect(parseWatch("47")).toBe(2820);
    expect(parseWatch("47:12")).toBe(2832);
    expect(parseWatch("1:05:30")).toBe(3930);
    expect(parseWatch("1:65:30")).toBeNaN();
    expect(parseWatch("4:61")).toBeNaN();
    expect(fmtWatch(3930)).toBe("1:05:30");
    expect(fmtWatch(2832)).toBe("47:12");
    expect(watchProgress({ watchedTo: "45", start: "10:00", end: "11:30" })).toEqual({ label: "45:00", ratio: 0.5 });
    expect(watchProgress({ watchedTo: "200", start: "10:00", end: "11:30" }).ratio).toBe(1);
    expect(watchProgress({ watchedTo: "x" })).toBeNull();
    expect(sessionCoverage({ attended: true })).toEqual({ ratio: 1, label: "besucht" });
    expect(sessionCoverage({ watchedTo: "45", start: "10:00", end: "11:30" }).label).toBe("50 % angeschaut");
    expect(sessionCoverage({})).toBeNull();
  });
  it("GOP-Kennzeichen und Notenprognose", () => {
    expect(isGop({ code: "in0001" }, new Set(["IN0001"]))).toBe(true);
    expect(isGop({ gop: true })).toBe(true);
    expect(isGop({ code: "X" })).toBe(false);
    const f = gradeForecast({ modules: [
      { status: "bestanden", grade: "1,0", ects: 6 }, { status: "bestanden", grade: 3, ects: 6 }, { status: "bestanden", grade: 6, ects: 6 },
      { status: "belegt", expectedGrade: "2,0", ects: 12 }, { status: "nicht bestanden", expectedGrade: 1, ects: 6 },
    ] });
    expect(f).toMatchObject({ current: 2, currentEcts: 12, forecast: 2, expectedEcts: 12, expectedCount: 1 });
    expect(gradeForecast({ modules: [] })).toMatchObject({ current: null, forecast: null });
  });
});

describe("study", () => {
  it("Blattnummer, Länge, Archiv, offene Abgaben, Tagebuch", () => {
    expect(numberOf("Übungsblatt 04")).toBe(4);
    expect(numberOf("Woche 3 – Aufgabe 2")).toBe(3);
    expect(numberOf("Projekt")).toBeNull();
    expect(numberOf(undefined)).toBeNull();
    expect(sessionLength({ start: "10:00", end: "11:30" })).toBe(90);
    expect(sessionLength({ start: "10:00", end: "12:00" })).toBe(120);
    expect(sessionLength({})).toBe(90);
    expect(HOURS_PER_ECTS).toBe(30);
    const d = { ...emptyData(), modules: [{ id: "a" }, { id: "b", archived: true }], sessions: [{ id: "s1", moduleId: "a" }, { id: "s2", moduleId: "b" }], homework: [{ id: "h1", moduleId: "a", status: "ausgegeben" }, { id: "h2", moduleId: "a", status: "bewertet" }, { id: "h3", moduleId: "b", status: "ausgegeben" }] };
    expect([...archivedIds(d)]).toEqual(["b"]);
    const live = withoutArchived(d);
    expect(live.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(live.modules.map((m) => m.id)).toEqual(["a"]);
    expect(withoutArchived(emptyData()).modules).toEqual([]);
    expect(openHomework(d, "a").map((h) => h.id)).toEqual(["h1"]);
    const diary = studyDiary([
      { id: "1", moduleId: "a", date: "2026-10-20", at: "09:00", minutes: 30 }, { id: "2", moduleId: "a", date: "2026-10-20", at: "18:00", minutes: "15" },
      { id: "3", moduleId: "a", date: "2026-10-21", minutes: 10 }, { id: "4", moduleId: "b", date: "2026-10-21", minutes: 99 }, { id: "5", moduleId: "a", minutes: 5 },
    ], "a");
    expect(diary.map((x) => [x.date, x.minutes, x.logs.map((l) => l.id)])).toEqual([["2026-10-21", 10, ["3"]], ["2026-10-20", 45, ["2", "1"]]]);
  });
});

describe("mensa, moodle, recent", () => {
  it("Mensa", () => {
    expect(canteenName("mensa-garching")).toBe("Mensa Garching");
    expect(canteenName("unbekannt")).toBe("unbekannt");
    expect(CANTEENS.length).toBeGreaterThan(5);
    expect(menuUrl("mensa-garching", "2027-01-01")).toBe("https://tum-dev.github.io/eat-api/mensa-garching/2026/53.json");
    const week = { days: [{ date: T, dishes: [
      { name: " Linsen ", dish_type: "Eintopf", labels: ["VEGAN"], prices: { students: { base_price: 2.5 } } },
      { name: "Salat", labels: ["VEGETARIAN"], prices: { students: { price_per_unit: 0.9, unit: "100g" } } },
      { name: "Schnitzel", labels: ["PORK"], prices: { students: { base_price: 1, price_per_unit: 0.5 } } },
      { name: "Lachs", labels: ["FISH"] }, { name: "" },
    ] }] };
    expect(dishesOn(week, T)).toEqual([
      { name: "Linsen", type: "Eintopf", price: "2,50 €", diet: "vegan" },
      { name: "Salat", type: "", price: "0,90 €/100g", diet: "vegetarisch" },
      { name: "Schnitzel", type: "", price: "1,00 € + 0,50 €/100g", diet: "Fleisch" },
      { name: "Lachs", type: "", price: "", diet: "Fisch" },
    ]);
    expect(dishesOn(null, T)).toEqual([]);
  });
  it("Moodle: Kurs, Zuordnung für Artemis, Fälligkeit um Mitternacht, Übersicht", () => {
    expect(courseOf({ course: "Analysis" })).toBe("Analysis");
    expect(courseOf({ summary: "EIST Exercise | Due: Blatt 1" })).toBe("EIST");
    expect(courseOf({ summary: "irgendwas" })).toBe("Ohne Kurs");
    expect(artemisMap([{ summary: "EIST Exercise | Due: A" }, { summary: "EIST Lecture | VL" }, { summary: "x" }], "m")).toEqual({ EIST: "m", "Ohne Kurs": "m" });
    expect(dueOf({ date: T, start: "00:00" })).toEqual({ due: "2026-10-20", dueTime: "23:59" });
    expect(dueOf({ date: "2026-11-01", start: "00:00" })).toEqual({ due: "2026-10-31", dueTime: "23:59" });
    expect(dueOf({ date: T, allDay: true })).toEqual({ due: T, dueTime: "" });
    expect(dueOf({ date: T, start: "12:00" })).toEqual({ due: T, dueTime: "12:00" });
    expect(feedSummary([{ summary: "EIST Exercise | Due: A" }, { summary: "EIST Lecture | VL" }, { summary: "Blatt 2 ist fällig" }, { summary: "Sprechstunde" }]))
      .toEqual({ Abgaben: 2, Vorlesungen: 1, "sonstige Termine": 1 });
  });
  describe("zuletzt geöffnet (localStorage)", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("liest, merkt und verträgt kaputte oder fehlende Speicher", () => {
      const store = new Map();
      vi.stubGlobal("localStorage", { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
      expect(readRecent()).toEqual([]);
      rememberOpened("note", "n1");
      rememberOpened("module", "m1");
      rememberOpened("note", "n1");
      rememberOpened("note", "");
      expect(readRecent()).toEqual([{ kind: "note", id: "n1" }, { kind: "module", id: "m1" }]);
      store.set("studyos-recent", "{kaputt");
      expect(readRecent()).toEqual([]);
      store.set("studyos-recent", "{}");
      expect(readRecent()).toEqual([]);
      vi.stubGlobal("localStorage", { getItem: () => { throw new Error("gesperrt"); }, setItem: () => { throw new Error("gesperrt"); } });
      expect(readRecent()).toEqual([]);
      expect(() => rememberOpened("note", "x")).not.toThrow();
    });
  });
});

describe("stats und progress", () => {
  it("Semester, Lernzeit je Semester, Fristen", () => {
    expect(semesterOf("2026-10-01").short).toBe("WiSe 2026/27");
    expect(semesterOf("2027-03-31").short).toBe("WiSe 2026/27");
    expect(semesterOf("2027-04-01").short).toBe("SoSe 2027");
    expect(semesterOf("2027-04-01", -1)).toMatchObject({ from: "2026-10-01", to: "2027-03-31" });
    expect(semesterOf("2027-01-15", 1)).toMatchObject({ from: "2027-04-01", to: "2027-09-30", label: "Sommersemester 2027" });
    const d = { modules: [{ id: "a", semester: 2 }, { id: "b", semester: 1 }, { id: "c" }], logs: [{ moduleId: "a", minutes: 30 }, { moduleId: "b", minutes: "15" }, { moduleId: "c", minutes: 5 }, { moduleId: "x", minutes: 100 }] };
    expect(minutesBySemester(d)).toEqual([{ semester: 0, minutes: 5 }, { semester: 1, minutes: 15 }, { semester: 2, minutes: 30 }]);
    const ex = { exams: [
      { id: "1", registerBy: "2026-10-25" }, { id: "2", registerBy: "2026-10-25", registered: true }, { id: "3", registerBy: "2026-12-25" },
      { id: "4", retakeDate: "2026-10-23", result: "nicht bestanden" }, { id: "5", retakeDate: "2026-10-23", result: "bestanden" },
    ] };
    expect(examDeadlines(ex, T).map((x) => [x.exam.id, x.kind])).toEqual([["4", "wiederholung"], ["1", "anmeldung"]]);
  });
  it("Lernrhythmus nach Tageszeit, auch nach Mitternacht", () => {
    const r = learningRhythm([{ date: T, minutes: 30, at: "08:00" }, { date: T, minutes: 20, at: "01:30" }, { date: "2026-10-25", minutes: 10 }, { date: T, minutes: 0, at: "09:00" }]);
    expect(r.parts.find((p) => p.label === "Morgens").minutes).toBe(30);
    expect(r.parts.find((p) => p.label === "Nachts").minutes).toBe(20);
    expect(r.weekdays[2]).toBe(50);
    expect(r.weekdays[6]).toBe(10);
    expect(r.timed).toBe(50);
    expect(r.best.label).toBe("Morgens");
    expect(learningRhythm([]).best).toBeNull();
    expect(DAYPARTS).toHaveLength(5);
  });
  it("Karten: Wiederholungen, Schwachstellen, Tags", () => {
    expect(cardReviews([{ reviews: 5 }, { reps: 3 }, {}])).toBe(8);
    const w = weakCards([{ id: "a", lapses: 2 }, { id: "b", difficulty: 9 }, { id: "c", lapses: 5, difficulty: 9 }, { id: "d", lapses: 1 }]);
    expect(w.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(weakByTag([{ t: ["x"] }, { t: [] }, { t: ["x", "y"] }], (c) => c.t)).toEqual([{ tag: "x", count: 2 }, { tag: "", count: 1 }, { tag: "y", count: 1 }]);
  });
  it("Sonne und Mond", () => {
    expect(skyPos(new Date("2026-06-21T13:12:00"))).toMatchObject({ kind: "sun" });
    expect(skyPos(new Date("2026-12-21T23:00:00")).kind).toBe("moon");
    const noon = skyPos(new Date(2026, 5, 21, 13, 12));
    expect(noon.y).toBeGreaterThan(0.99);
  });
  it("FSRS-Grundlagen", () => {
    expect(FSRS_W).toHaveLength(19);
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
  });
});

describe("feed: Änderungsmeldungen", () => {
  it("Konstanten, Liste und Texte", () => {
    expect(CHANGE_FIELDS).toEqual(["date", "start", "end", "room"]);
    expect(SOON_DAYS).toBeLessThan(CHANGE_DAYS);
    expect(FEED_VERSION).toBeGreaterThanOrEqual(2);
    const s = [
      { id: "a", date: "2026-10-23", start: "10:00", change: { was: {} } }, { id: "b", date: "2026-10-22", change: { was: {} } },
      { id: "c", date: "2026-10-20", change: { was: {} } }, { id: "d", date: "2026-10-22" },
    ];
    expect(feedChanges(s, T).map((x) => x.id)).toEqual(["b", "a"]);
    expect(describeChange({ cancelled: true, change: {} })).toBe("fällt aus");
    expect(describeChange({ cancelled: false, change: { wasCancelled: true } })).toBe("findet wieder statt");
    expect(describeChange({ start: "12:00", end: "14:00", room: "B", date: "2026-10-23", change: { was: { date: "2026-10-22", start: "10:00", room: "" } } }))
      .toBe("verschoben vom 22.10.2026, Zeit: 10:00–14:00 → 12:00–14:00, Raum: ohne → B");
    expect(describeChange({})).toBe("geändert");
    expect(roomChange({ room: "B", change: { was: { room: "A" } } })).toEqual({ from: "A", to: "B" });
    expect(roomChange({ room: "A", change: { was: { room: "A" } } })).toBeNull();
    expect(roomChange(null)).toBeNull();
  });
});
