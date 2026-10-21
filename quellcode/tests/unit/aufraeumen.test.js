/* Aufräumen nach #46 bis #50: Fehler-Regressionen und Sonderfälle der neuen Logik in src/lib
   (leere Daten, archivierte Module, Einträge ohne Modul, ausgefallene Termine, Wochenende, zwei Geräte) */
import { describe, expect, it } from "vitest";
import { emptyData, isOpenHw } from "../../src/lib/data.js";
import { lecturePeriods, semWeek, semWeekLabel } from "../../src/lib/semweek.js";
import { semesterSpan, semesterWeeks } from "../../src/lib/semester.js";
import { removeDuplicateCards, removeDuplicateSessions } from "../../src/lib/cleanup.js";
import { addReviewMinutes, deviceTag } from "../../src/lib/cards.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { readView, saveView } from "../../src/lib/view.js";
import { crowdedDueDays, fmtTypical, reconcileAllSessionLogs, reconcileSessionLogs } from "../../src/lib/study.js";
import { dayStrip, liveSession, nextGap, quietDay, resolveFocus, tomorrowPreview } from "../../src/lib/dayview.js";
import { returnAt, summarize, weatherPlaces } from "../../src/lib/weather.js";
import { isActiveModule, pickColor } from "../../src/lib/colors.js";
import { sortNotes, toggleTask } from "../../src/lib/notes.js";
import { pushRecent, recentResults } from "../../src/lib/recent.js";
import { addTrash, mergeTrash, pruneTrash, purgeTrash, restoreTrash, trashEntry, trashRemoved } from "../../src/lib/trash.js";
import { uniDates, uniDatesOn, upcomingUniDates } from "../../src/lib/tumdates.js";
import { describeChange } from "../../src/lib/feed.js";
import { fmtMin, isoWeek, isoYearWeek } from "../../src/lib/util.js";
import { isoWeek as mensaWeek } from "../../src/lib/mensa.js";
import { todoItems } from "../../src/lib/todo.js";
import { PALETTE } from "../../src/lib/constants.js";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const TUM = { university: "TUM" };

describe("Vorlesungswoche mit kurzen Ferien", () => {
  /* ohne TUM: Semesterferien und eine eigene Weihnachtspause */
  const settings = { university: "LMU", breaks: [
    { from: "2026-07-25", to: "2026-10-18", label: "Semesterferien" },
    { from: "2026-12-23", to: "2027-01-06", label: "Weihnachten" },
    { from: "2027-02-13", to: "2027-04-18", label: "Semesterferien" },
  ] };

  it("Weihnachten teilt das Semester nicht: die Zählung läuft im Januar weiter", () => {
    expect(lecturePeriods({ settings })).toEqual([{ from: "2026-10-19", to: "2027-02-12" }]);
    expect(semWeek("2026-10-21", { settings })).toEqual({ kw: 43, week: 1, total: 16, off: false });
    expect(semWeek("2026-12-30", { settings })).toMatchObject({ week: null, off: true });
    expect(semWeekLabel("2027-01-13", { settings })).toBe("KW 2 · VL-Woche 12 von 16");
    expect(semWeekLabel("2027-02-10", { settings })).toBe("KW 6 · VL-Woche 16 von 16");
  });

  it("überlappende Ferien zählen als ein Zeitraum; Semesterbeginn aus Modulen endet vor den nächsten langen Ferien", () => {
    const s = { breaks: [{ from: "2027-02-13", to: "2027-03-31" }, { from: "2027-03-15", to: "2027-04-18" }, { from: "2027-05-17", to: "2027-05-21" }, { from: "2027-07-24", to: "2027-10-17" }] };
    expect(lecturePeriods({ settings: s })).toEqual([{ from: "2027-04-19", to: "2027-07-23" }]);
    const mods = [{ id: "m", status: "belegt", semesterStart: "2027-04-19" }];
    expect(lecturePeriods({ settings: { breaks: [s.breaks[2], s.breaks[3]] }, modules: mods })).toEqual([{ from: "2027-04-19", to: "2027-07-23" }]);
  });

  it("ohne Daten: nur die Kalenderwoche, am Wochenende dieselbe Woche wie Montag", () => {
    expect(semWeekLabel("2026-10-25")).toBe("KW 43");
    expect(semWeek("2026-10-25")).toEqual(semWeek("2026-10-19"));
    expect(semesterSpan({}, "2026-10-21")).toBeNull();
    expect(semesterWeeks({}, null)).toEqual([]);
  });

  it("Semesterleiste ohne archivierte Abgaben zählt nur offene", () => {
    const data = { ...emptyData(), settings: TUM, homework: [
      { id: "a", due: "2026-10-22", status: "ausgegeben" }, { id: "b", due: "2026-10-22", status: "abgegeben" }, { id: "c", due: "2026-10-23", status: "ausgegeben", missed: true },
    ] };
    const w = semesterWeeks(data, semesterSpan(data, "2026-10-21"), "2026-10-21").find((x) => x.current);
    expect(w).toMatchObject({ kw: 43, week: 2, hw: 1 });
  });
});

describe("Aufräumen: Doppel behalten ihre Häkchen", () => {
  const ses = (id, extra = {}) => ({ id, moduleId: "m1", date: "2026-10-20", start: "10:00", end: "11:30", type: "Vorlesung", ...extra });

  it("besucht und nachbereitet gehen auf den behaltenen Termin über, die Lernzeit bleibt", () => {
    /* s2 hat Notiz, Lerneinheit und ist vorbereitet, deshalb bleibt s2; s1 war besucht */
    const d = { ...emptyData(), modules: [{ id: "m1", name: "DS" }],
      sessions: [ses("s2", { prepared: true }), ses("s1", { attended: true, attendedAt: "2026-10-20T11:00:00.000Z" })],
      notes: [{ id: "n", moduleId: "m1", sessionId: "s2", title: "Mitschrift", text: "x" }],
      logs: [{ id: "l", moduleId: "m1", sessionId: "s1", kind: "Besucht", date: "2026-10-20", minutes: 90 }, { id: "l2", moduleId: "m1", sessionId: "s2", kind: "Nacharbeiten", date: "2026-10-20", minutes: 20 }] };
    const out = removeDuplicateSessions(d);
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0]).toMatchObject({ id: "s2", prepared: true, attended: true, attendedAt: "2026-10-20T11:00:00.000Z" });
    /* die Besuchszeit hängt jetzt am behaltenen, besuchten Termin und wird nicht weggekürzt */
    expect(reconcileAllSessionLogs(out).logs).toEqual([{ ...d.logs[0], sessionId: "s2" }, d.logs[1]]);
    /* Wiederherstellen nimmt auch die übernommenen Häkchen zurück */
    const t = addTrash(out, trashEntry(d, out));
    const back = restoreTrash(t, t.meta.trash[0].id);
    expect(back.sessions.find((s) => s.id === "s2").attended).toBeFalsy();
    expect(back.sessions.find((s) => s.id === "s1")).toMatchObject({ attended: true });
  });

  it("schon gesetzte Häkchen des behaltenen bleiben, fehlende kommen dazu; „schwer“ wandert mit der Karte", () => {
    const d = { ...emptyData(), sessions: [ses("a", { attended: true, attendedAt: "A" }), ses("b", { reviewed: true, reviewedAt: "2026-10-21" })] };
    expect(removeDuplicateSessions(d).sessions).toEqual([{ ...d.sessions[0], reviewed: true, reviewedAt: "2026-10-21" }]);
    const c = { ...emptyData(), cards: [{ id: "x", moduleId: "m", front: "F", back: "B", reps: 3 }, { id: "y", moduleId: "m", front: "F", back: "B", hard: true }] };
    expect(removeDuplicateCards(c).cards).toEqual([{ ...c.cards[0], hard: true }]);
    expect(removeDuplicateSessions(emptyData())).toEqual(emptyData());
  });
});

describe("Karteikarten-Lernzeit auf zwei Geräten", () => {
  const opts = (dev) => ({ date: "2026-10-21", at: "10:00", newId: () => `l-${dev}`, dev });

  it("jedes Gerät zählt in seine eigene Tageseinheit, beim Sync bleiben beide Minuten erhalten", () => {
    const base = stampChanges(emptyData(), { ...emptyData(), logs: addReviewMinutes([], "m", 5, opts("A")) }, "2026-10-21T08:00:00.000Z");
    /* Gerät B hat Gerät A's Einheit schon bekommen und fragt selbst ab */
    const onB = stampChanges(base, { ...base, logs: addReviewMinutes(base.logs, "m", 3, opts("B")) }, "2026-10-21T09:00:00.000Z");
    const onA = stampChanges(base, { ...base, logs: addReviewMinutes(base.logs, "m", 2, opts("A")) }, "2026-10-21T09:30:00.000Z");
    const merged = mergeData(onA, onB, "2026-10-21T10:00:00.000Z").data;
    expect(merged.logs.reduce((n, l) => n + l.minutes, 0)).toBe(5 + 2 + 3);
    expect(merged.logs.map((l) => l.dev).sort()).toEqual(["A", "B"]);
  });

  it("Gerätekennung bleibt gleich und braucht keinen Speicher", () => {
    const st = memory();
    const a = deviceTag(st);
    expect(a).toMatch(/^\w+$/);
    expect(deviceTag(st)).toBe(a);
    expect(deviceTag(/** @type {any} */ ({ getItem: () => { throw new Error("gesperrt"); } }))).toBe("");
  });
});

describe("Sync: nur wachsende Listen in den Einstellungen", () => {
  it("gelöschte Abo-Prüfungen beider Geräte bleiben gelöscht, auf beiden Geräten gleich", () => {
    const base = stampChanges(emptyData(), { ...emptyData(), settings: { ...emptyData().settings, examsDismissed: ["alt"] } }, "2026-10-20T08:00:00.000Z");
    const a = stampChanges(base, { ...base, settings: { ...base.settings, examsDismissed: ["alt", "pa|1", "m|2026-12-01"] } }, "2026-10-21T08:00:00.000Z");
    const b = stampChanges(base, { ...base, settings: { ...base.settings, examsDismissed: ["alt", "pb|2"], seriesAsked: ["m|Blatt 0"] } }, "2026-10-21T09:00:00.000Z");
    const ab = mergeData(a, b, "2026-10-21T10:00:00.000Z").data.settings, ba = mergeData(b, a, "2026-10-21T10:00:00.000Z").data.settings;
    expect(ab.examsDismissed).toEqual(["alt", "pb|2", "pa|1", "m|2026-12-01"]);
    expect(ba.examsDismissed).toEqual(ab.examsDismissed);
    expect(ab.seriesAsked).toEqual(["m|Blatt 0"]);
    /* gleiche Listen: nichts ändert sich */
    expect(mergeData(a, a, "2026-10-21T10:00:00.000Z").data.settings.examsDismissed).toBe(a.settings.examsDismissed);
  });
});

describe("Ansicht merken", () => {
  it("merkt auch „Was ist neu“, verwirft Unbekanntes und kaputte Werte", () => {
    const st = memory();
    saveView({ tab: "mehr", more: "neu" }, st);
    expect(readView(st)).toEqual({ tab: "mehr", more: "neu" });
    saveView({ more: "gibtsnicht", moduleId: "../x" }, st);
    expect(readView(st)).toEqual({ tab: "mehr" });
    st.setItem("studyos-view", "{kaputt");
    expect(readView(st)).toEqual({});
    saveView({ tab: null }, st);
    expect(readView(st)).toEqual({});
  });
});

describe("Offene Abgaben einheitlich", () => {
  const hw = (id, due, extra = {}) => ({ id, moduleId: "m", title: id, due, status: "ausgegeben", ...extra });

  it("volle Abgabetage zählen verpasste Abgaben nicht mit", () => {
    const list = [hw("a", "2026-10-23"), hw("b", "2026-10-23"), hw("c", "2026-10-23", { missed: true }), hw("d", "2026-10-23", { status: "abgegeben" })];
    expect(crowdedDueDays(list, "2026-10-21")).toEqual([]);
    expect(crowdedDueDays([...list, hw("e", "2026-10-23")], "2026-10-21").map((x) => x.items.map((h) => h.id))).toEqual([["a", "b", "e"]]);
    expect(crowdedDueDays([], "2026-10-21")).toEqual([]);
  });

  it("isOpenHw wie in Zu erledigen, Morgen-Vorschau und Fokus", () => {
    expect([hw("a"), hw("b", "", { missed: true }), hw("c", "", { status: "bewertet" })].map(isOpenHw)).toEqual([true, false, false]);
    const d = { ...emptyData(), homework: [hw("a", "2026-10-22"), hw("b", "2026-10-22", { missed: true })] };
    expect(todoItems(d, "2026-10-21").map((x) => x.id)).toEqual(["a"]);
    expect(tomorrowPreview(d, "2026-10-21", "19:00").homework.map((h) => h.id)).toEqual(["a"]);
    expect(resolveFocus(d, { kind: "homework", id: "b" })).toMatchObject({ done: true });
  });
});

describe("Lernzeit aus Besuch und Aufzeichnung für alle Termine", () => {
  const s = (id, extra = {}) => ({ id, moduleId: "m", date: "2026-10-20", start: "10:00", end: "11:00", type: "Vorlesung", ...extra });
  const log = (id, sessionId, kind, minutes) => ({ id, moduleId: "m", sessionId, kind, date: "2026-10-20", minutes });

  it("kürzt wie einzeln je Termin, lässt fremde Einheiten und die Reihenfolge in Ruhe", () => {
    const d = { ...emptyData(), sessions: [s("a", { attended: true }), s("b"), s("c", { watchedTo: "30" })],
      logs: [log("1", "a", "Besucht", 60), log("2", "a", "Aufzeichnung", 20), log("x", "", "Nacharbeiten", 15), log("3", "b", "Besucht", 60), log("4", "c", "Aufzeichnung", 50), log("5", "weg", "Besucht", 60)] };
    let one = d.logs;
    for (const x of d.sessions) one = reconcileSessionLogs(one, x, "2026-10-21", { add: false }).logs;
    const all = reconcileAllSessionLogs(d);
    expect(all.logs).toEqual(one);
    expect(all.logs.map((l) => [l.id, l.minutes])).toEqual([["1", 60], ["x", 15], ["4", 30], ["5", 60]]);
    expect(all.logs[0]).toBe(d.logs[0]);
    expect(reconcileAllSessionLogs(all)).toBe(all);
    expect(reconcileAllSessionLogs(emptyData())).toEqual(emptyData());
  });
});

describe("Gemeinsame Hilfen", () => {
  it("eine ISO-Kalenderwoche für Kopfzeile, Mensa und Sicherung, auch über den Jahreswechsel", () => {
    expect(isoYearWeek("2026-12-31")).toEqual({ year: 2026, week: 53 });
    expect(isoYearWeek("2027-01-03")).toEqual({ year: 2026, week: 53 });
    expect(isoYearWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
    expect(isoYearWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
    expect(isoWeek("2026-10-21")).toBe(43);
    expect(mensaWeek("2026-10-25")).toEqual({ year: 2026, week: 43 });
  });

  it("Dauer und Datum gleich formatiert", () => {
    expect([fmtMin(60), fmtMin(35), fmtMin(80)]).toEqual(["1 h", "35 min", "1 h 20 min"]);
    expect([fmtTypical(240), fmtTypical(90), fmtTypical(45)]).toEqual(["meist ~4 h", "meist ~1 h 30 min", "meist ~45 min"]);
    expect(describeChange({ date: "2026-10-22", start: "10:00", end: "12:00", change: { was: { date: "2026-10-20" } } })).toBe("verschoben vom 20.10.2026");
  });
});

describe("Heute: Sonderfälle", () => {
  const base = (x = {}) => ({ sessions: [], blocks: [], exams: [], homework: [], ...x });
  const ses = (id, date, start, end, more = {}) => ({ id, moduleId: "ds", type: "Vorlesung", date, start, end, ...more });

  it("Wochenende mit ausgefallenem Termin ist ruhig, mit stattfindendem nicht", () => {
    const sat = "2026-10-24";
    expect(quietDay(sat, {}, [ses("a", sat, "10:00", "12:00", { cancelled: true })])).toBe(true);
    expect(quietDay(sat, {}, [ses("a", sat, "10:00", "12:00")])).toBe(false);
    expect(quietDay("2026-10-21", {}, [])).toBe(false);
    expect(quietDay("2026-12-28", TUM, [])).toBe(true); /* Weihnachtspause an der TUM */
  });

  it("Termine ohne Beginn oder Ende, ausgefallene und andere Tage", () => {
    const T = "2026-10-21";
    const d = base({ sessions: [ses("a", T, "", "12:00"), ses("b", T, "10:00", ""), ses("c", T, "09:00", "10:00", { cancelled: true }), ses("d", "2026-10-22", "09:00", "10:00")] });
    expect(dayStrip(d, T, "10:00").items.map((x) => x.id)).toEqual(["b"]);
    expect(dayStrip(d, T, "10:00", "2026-10-20").now).toBeNull();
    expect(liveSession(d.sessions, T, "10:00")).toBeNull();
    expect(liveSession([ses("e", T, "10:00", "11:00")], T, "10:00")).toMatchObject({ left: 60 });
    expect(nextGap(base(), T, "22:00")).toBeNull();
    expect(nextGap(base(), T, "08:00")).toMatchObject({ from: "08:00", to: null, now: true });
  });

  it("Morgen-Vorschau erst ab 18 Uhr, ohne ausgefallene Termine und bestandene Prüfungen", () => {
    const d = base({ sessions: [ses("a", "2026-10-22", "08:00", "10:00", { cancelled: true }), ses("b", "2026-10-22", "12:00", "14:00")],
      exams: [{ id: "e1", date: "2026-10-22", result: "bestanden" }, { id: "e2", date: "2026-10-01", retakeDate: "2026-10-22", result: "nicht bestanden" }] });
    expect(tomorrowPreview(d, "2026-10-21", "17:59")).toBeNull();
    const p = tomorrowPreview(d, "2026-10-21", "18:00");
    expect(p.first.id).toBe("b");
    expect(p.exams).toEqual([{ e: d.exams[1], retake: true }]);
    expect(tomorrowPreview(base(), "2026-10-21", "20:00")).toBeNull();
  });

  it("Fokus auf gelöschte oder ausgefallene Einträge löst sich auf", () => {
    const d = base({ sessions: [ses("a", "2026-10-21", "10:00", "12:00", { cancelled: true })], blocks: [{ id: "b", done: false }] });
    expect(resolveFocus(d, { kind: "session", id: "a" })).toMatchObject({ done: true });
    expect(resolveFocus(d, { kind: "session", id: "weg" })).toBeNull();
    expect(resolveFocus(d, { kind: "unbekannt", id: "a" })).toBeNull();
    expect(resolveFocus(d, { kind: "block", id: "b" })).toMatchObject({ done: false });
  });
});

describe("Wetter: Sonderfälle", () => {
  it("ohne Vorhersage nichts; Rückfahrt ohne ausgefallene und Online-Termine", () => {
    expect(summarize([], 0)).toBeNull();
    expect(summarize(undefined, 0)).toBeNull();
    const day = "2026-10-21";
    expect(returnAt([], day)).toBeNull();
    expect(returnAt([{ date: day, start: "10:00", end: "12:00", cancelled: true }], day)).toBeNull();
    expect(returnAt([{ date: day, start: "10:00", end: "12:00", room: "Online" }], day)).toBeNull();
    expect(new Date(returnAt([{ date: day, start: "16:00", end: "" }], day)).getHours()).toBe(17);
  });
  it("Standort zählt nur mit dem Auto und gültigen Koordinaten", () => {
    const car = { mode: "car", car: { fromHere: true, campus: "weihenstephan" } };
    expect(weatherPlaces(car, "48.1234,11.5678").start).toEqual({ name: "Standort", lat: 48.12, lon: 11.57 });
    expect(weatherPlaces(car, "kaputt").start.name).toBe("Zorneding");
    expect(weatherPlaces({ mode: "transit", car: {} }, "48,11").goal.name).toBe("Garching");
  });
});

describe("Modulfarben", () => {
  it("archivierte und abgeschlossene Module geben ihre Farbe frei", () => {
    expect(isActiveModule(null)).toBe(false);
    expect(isActiveModule({ status: "belegt", archived: true })).toBe(false);
    expect(isActiveModule({ status: "nicht bestanden" })).toBe(false);
    expect(pickColor([])).toBe(PALETTE[0]);
    /* nur archivierte: erste noch nicht vergebene Farbe */
    expect(pickColor([{ color: PALETTE[0], archived: true }])).toBe(PALETTE[1]);
    expect(pickColor([{ color: "kaputt", status: "belegt" }])).toBe(PALETTE[0]);
  });
});

describe("Notizen und zuletzt Geöffnetes", () => {
  it("Kästchen umschalten nur in echten Listenpunkten", () => {
    expect(toggleTask("1. [ ] eins\n- [x] zwei", 0)).toBe("1. [x] eins\n- [x] zwei");
    expect(toggleTask("1. [ ] eins\n- [x] zwei", 1)).toBe("1. [ ] eins\n- [ ] zwei");
    expect(toggleTask("[ ] kein Listenpunkt", 0)).toBe("[ ] kein Listenpunkt");
    expect(toggleTask("- [ ] a", 5)).toBe("- [ ] a");
    expect(toggleTask(null, 0)).toBe("");
  });
  it("angeheftete zuerst, Notizen ohne Zeitstempel zuletzt", () => {
    expect(sortNotes([{ id: "a" }, { id: "b", updated: "2026-10-20" }, { id: "c", pinned: true }]).map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
  it("zuletzt Geöffnetes: ohne Doppel, gelöschte fallen weg, Notiz ohne Modul heißt Allgemein", () => {
    let list = pushRecent(null, "note", "n1");
    for (let i = 0; i < 8; i++) list = pushRecent(list, "module", "m" + i);
    expect(list).toHaveLength(6);
    list = pushRecent(pushRecent([], "note", "n1"), "module", "m1");
    list = pushRecent([...list, null, { kind: "note", id: "weg" }], "note", "n1");
    const data = { modules: [{ id: "m1", name: "DS" }], notes: [{ id: "n1", moduleId: "", title: "" }] };
    expect(recentResults(data, list).map((r) => [r.kind, r.title, r.sub])).toEqual([["note", "Notiz", "Allgemein"], ["module", "DS", "Modul"]]);
    expect(recentResults(data, "kaputt")).toEqual([]);
  });
});

describe("Papierkorb: Sonderfälle", () => {
  it("ungültige Einträge fallen beim Zusammenführen weg, abgelaufene ebenso", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const ok = { id: "a", at: "2026-10-20T00:00:00.000Z" }, old = { id: "b", at: "2026-09-01T00:00:00.000Z" };
    expect(mergeTrash([ok, null, { id: 1 }], "kaputt", new Set(), now)).toEqual([ok]);
    expect(mergeTrash([ok, old], [ok], new Set(["a"]), now)).toEqual([]);
    expect(pruneTrash(undefined, now)).toEqual([]);
    expect(trashRemoved([ok, old], [old])).toEqual(["a"]);
    expect(trashRemoved(undefined, undefined)).toEqual([]);
  });
  it("nichts gelöscht: kein Eintrag; leeren und Wiederherstellen eines fehlenden Eintrags ändern nichts", () => {
    const d = emptyData();
    expect(trashEntry(d, d)).toBeNull();
    expect(addTrash(d, null)).toBe(d);
    expect(restoreTrash(d, "weg")).toBe(d);
    expect(purgeTrash(d).meta.trash).toEqual([]);
  });
});

describe("Uni-Fristen: Sonderfälle", () => {
  it("nur an der TUM und abschaltbar; laufende Zeiträume mit Ende", () => {
    expect(uniDates({})).toEqual([]);
    expect(uniDates({ ...TUM, tumDates: false })).toEqual([]);
    expect(uniDatesOn("2026-10-12", TUM).map((x) => x.id)).toEqual(["vl-ws26"]);
    const list = upcomingUniDates(TUM, "2026-12-01");
    expect(list).toEqual([expect.objectContaining({ id: "pa-ws26-r", running: true, to: "2027-01-15" })]);
    /* letzter Tag des Zeitraums liegt im Fenster: als Ende, nicht als „läuft“ */
    expect(upcomingUniDates(TUM, "2027-01-05").map((x) => x.id)).toEqual(["pa-ws26-b"]);
    expect(upcomingUniDates({}, "2026-12-01")).toEqual([]);
  });
});
