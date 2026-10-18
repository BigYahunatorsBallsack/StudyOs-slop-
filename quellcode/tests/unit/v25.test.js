import { describe, it, expect } from "vitest";
import { matches, nextFirstSession, queryOffset, recommend, commuteOf } from "../../src/lib/transit.js";
import { mvg } from "../../src/server/mvg.js";
import { freeGaps, suggestBlocks, blockReminders } from "../../src/lib/blocks.js";
import { whatNow } from "../../src/lib/now.js";
import { evaluate, gradeOf, pickCards } from "../../src/lib/mock.js";
import { learningRhythm, effortVsGrade } from "../../src/lib/stats.js";
import { applyArtemis, isMoodleDeadline, cleanTitle } from "../../src/lib/moodle.js";
import { dueReminders } from "../../src/server/reminders.js";
import { needsExtras } from "../../src/ui/extras.js";
import { emptyData } from "../../src/lib/data.js";

const at = (d, hm) => new Date(`${d}T${hm}:00`).getTime();

describe("Bus zur Uni", () => {
  const c = commuteOf({});
  const ses = [{ id: "a", date: "2026-10-19", start: "10:15", moduleId: "ds" }, { id: "b", date: "2026-10-19", start: "14:00" }, { id: "c", date: "2026-10-20", start: "08:30" }];
  it("Standard: 230 ab Haar Richtung Forschungszentrum", () => {
    expect(c).toMatchObject({ line: "230", towards: "Forschungszentrum", station: { id: "de:09184:2140" } });
    expect(commuteOf({ commute: null })).toBeNull();
    expect(matches({ line: "230", destination: "Garching, Forschungszentrum (U)" }, c)).toBe(true);
    expect(matches({ line: "230", destination: "Haar (S)" }, c)).toBe(false);
    expect(matches({ line: "241", destination: "Forschungszentrum" }, c)).toBe(false);
  });
  it("erste Veranstaltung: heute, solange sie noch nicht begonnen hat, sonst der nächste Tag", () => {
    expect(nextFirstSession(ses, new Date("2026-10-19T07:00:00")).id).toBe("a");
    expect(nextFirstSession(ses, new Date("2026-10-19T11:00:00")).id).toBe("c");
  });
  it("späteste passende Abfahrt mit Fahrzeit und Puffer", () => {
    const deps = [["08:53", 0], ["09:13", 2], ["09:23", 0], ["09:33", 0]].map(([hm, delay]) => ({ line: "230", destination: "Garching, Forschungszentrum (U)", time: at("2026-10-19", hm), delay, cancelled: false }));
    deps[2].cancelled = true;
    const r = recommend(deps, ses[0], c); /* 10:15 − 10 Puffer − 50 Fahrt → spätestens 9:15 */
    expect(new Date(r.dep.time).toTimeString().slice(0, 5)).toBe("09:13");
    expect(new Date(r.leaveAt).toTimeString().slice(0, 5)).toBe("09:08");
    expect(queryOffset(ses[0], c, new Date("2026-10-19T06:00:00"))).toBe(135);
  });
});

describe("MVG-Abfrage der Edge Function", () => {
  const fake = (body) => async (url) => { fake.last = url; return new Response(JSON.stringify(body)); };
  it("prüft Eingaben und kürzt die Antwort", async () => {
    expect((await mvg({ kind: "departures", station: "x'; drop" }, fake([]))).status).toBe(400);
    expect((await mvg({ kind: "departures", station: "de:09184:2140", types: "BUS;rm" }, fake([]))).status).toBe(400);
    expect((await mvg({ kind: "evil" }, fake([]))).status).toBe(400);
    const f = fake([{ label: "230", destination: "Garching, Forschungszentrum (U)", transportType: "REGIONAL_BUS", plannedDepartureTime: 1000, realtimeDepartureTime: 61000, delayInMinutes: 1, realtime: true, cancelled: false, secret: "x" }]);
    const r = await mvg({ kind: "departures", station: "de:09184:2140", offset: 30 }, f);
    expect(fake.last).toBe("https://www.mvg.de/api/bgw-pt/v3/departures?globalId=de:09184:2140&limit=40&offsetInMinutes=30&transportTypes=BUS,REGIONAL_BUS");
    expect(r.data).toEqual([{ line: "230", destination: "Garching, Forschungszentrum (U)", type: "REGIONAL_BUS", planned: 1000, time: 61000, delay: 1, realtime: true, cancelled: false }]);
    const s = await mvg({ kind: "stations", query: "Haar" }, fake([{ globalId: "de:09184:2140", name: "Haar", place: "Haar (b München)", transportTypes: ["SBAHN"] }]));
    expect(s.data[0]).toEqual({ id: "de:09184:2140", name: "Haar", place: "Haar (b München)", types: ["SBAHN"] });
  });
});

describe("Lernblöcke", () => {
  it("findet Lücken mit Puffer", () => {
    expect(freeGaps([{ start: "10:00", end: "12:00" }, { start: "14:00", end: "16:00" }], { from: "10:00", to: "19:00" })).toEqual([{ start: "12:15", end: "13:45" }, { start: "16:15", end: "19:00" }]);
  });
  it("schlägt Nachbereitung des Termins davor vor, nur an Uni-Tagen", () => {
    const d = { ...emptyData(), sessions: [{ id: "a", moduleId: "ds", type: "Vorlesung", date: "2026-10-19", start: "10:00", end: "12:00" }, { id: "b", moduleId: "la", type: "Übung", date: "2026-10-19", start: "14:00", end: "16:00" }] };
    const s = suggestBlocks(d, ["2026-10-19", "2026-10-20"], new Date("2026-10-19T08:00:00"));
    expect(s.map((x) => `${x.start}-${x.end} ${x.title} ${x.moduleId}`)).toEqual(["12:15-13:45 Vorlesung nachbereiten ds", "16:15-17:45 Übung nachbereiten la"]);
  });
  it("Erinnerung 10 Minuten vorher, nicht verspätet", () => {
    const list = blockReminders({ blocks: [{ id: "x", title: "Blatt 3", date: "2026-10-19", start: "12:15", end: "13:45" }] }, () => "DS", "2026-10-19");
    expect(dueReminders(list, {}, new Date("2026-10-19T10:06:00Z")).map((r) => [r.title, r.body])).toEqual([["Gleich: Lernblock", "12:15 Blatt 3 (DS)"]]);
    expect(dueReminders(list, {}, new Date("2026-10-19T10:40:00Z"))).toEqual([]);
  });
});

describe("Was jetzt?", () => {
  const d = { ...emptyData(), modules: [{ id: "ds", name: "DS" }],
    homework: [{ id: "h", moduleId: "ds", title: "Blatt 3", due: "2026-10-20", status: "ausgegeben" }],
    sessions: [{ id: "s", moduleId: "ds", type: "Vorlesung", date: "2026-10-19", start: "08:00", end: "10:00" }],
    cards: Array.from({ length: 10 }, (_, i) => ({ id: "c" + i, due: "2026-10-18" })) };
  it("mit Zeit: Abgabe morgen vorne; mit 15 Minuten: Karten", () => {
    expect(whatNow(d, 60, new Date("2026-10-19T12:00:00"))[0]).toMatchObject({ title: "Blatt 3", why: "morgen fällig", minutes: 50 });
    expect(whatNow(d, 15, new Date("2026-10-19T12:00:00"))[0]).toMatchObject({ action: "cards", title: "10 Karteikarten wiederholen" });
  });
});

describe("Probeklausur", () => {
  it("wertet nach Thema aus, schwächstes zuerst", () => {
    const cards = [{ id: "a", topicId: "t1" }, { id: "b", topicId: "t1" }, { id: "c", tags: "graphen" }];
    const r = evaluate(cards, { a: 1, b: 0.5, c: 0 }, (id) => (id === "t1" ? "Mengen" : ""));
    expect(r.pct).toBeCloseTo(0.5);
    expect(r.groups.map((g) => g.label)).toEqual(["graphen", "Mengen"]);
    expect(r.wrong.map((c) => c.id)).toEqual(["b", "c"]);
    expect([gradeOf(0.92), gradeOf(0.5), gradeOf(0.49)]).toEqual([1.0, 4.0, 5.0]);
    expect(pickCards(cards, 2)).toHaveLength(2);
  });
});

describe("Lernrhythmus", () => {
  it("Tageszeit und Wochentag", () => {
    const r = learningRhythm([{ date: "2026-10-19", minutes: 60, at: "20:30" }, { date: "2026-10-20", minutes: 30, at: "09:00" }, { date: "2026-10-21", minutes: 45 }]);
    expect(r.best.label).toBe("Abends");
    expect(r.weekdays.slice(0, 3)).toEqual([60, 30, 45]);
    expect(r.timed).toBe(90);
  });
  it("Lernzeit je ECTS gegen Note", () => {
    const d = { ...emptyData(), modules: [{ id: "a", name: "A", ects: 6, status: "bestanden", grade: "1,7" }], logs: [{ moduleId: "a", minutes: 600 }] };
    expect(effortVsGrade(d)[0]).toMatchObject({ grade: 1.7, hours: 10 });
  });
});

describe("Artemis und Formeln", () => {
  it("Artemis: Abgabefristen ja, Veröffentlichung und Vorlesungen nein", () => {
    expect(isMoodleDeadline({ summary: "Abgabefrist: Blatt 05 – Rekursion" })).toBe(true);
    expect(isMoodleDeadline({ summary: "Due date: W05H01" })).toBe(true);
    expect(isMoodleDeadline({ summary: "Veröffentlichung: Blatt 05" })).toBe(false);
    expect(isMoodleDeadline({ summary: "Vorlesung: Einführung" })).toBe(false);
    expect(cleanTitle("Abgabefrist: Blatt 05 – Rekursion")).toBe("Blatt 05 – Rekursion");
    const feed = { id: "f1", moduleId: "eidi" };
    const r = applyArtemis(emptyData(), feed, [{ uid: "u1", summary: "Due date: W05H01", date: "2026-10-30", start: "18:00", course: "" }], "2026-10-20");
    expect(r.homework[0]).toMatchObject({ title: "W05H01", moduleId: "eidi", feedKey: "artemis:f1|u1", dueTime: "18:00" });
  });
  it("erkennt Formeln und Code", () => {
    expect(needsExtras("Es gilt $a^2$.")).toBe(true);
    expect(needsExtras("```java\nint x;\n```")).toBe(true);
    expect(needsExtras("Preis 5 €")).toBe(false);
  });
});
