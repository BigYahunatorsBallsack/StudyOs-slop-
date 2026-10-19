import { describe, it, expect } from "vitest";
import { parseICS } from "../../src/lib/ics.js";
import { applyFeed, describeChange, feedChanges, groupParallel, guessMapping, resolveNewModules, unmappedSummaries, NEW, SKIP } from "../../src/lib/feed.js";
import { emptyData } from "../../src/lib/data.js";

const T = "2026-10-21";
const cal = (events) => "BEGIN:VCALENDAR\r\n" + events.map((e) => ["BEGIN:VEVENT", ...Object.entries(e).map(([k, v]) => `${k}:${v}`), "END:VEVENT"].join("\r\n")).join("\r\n") + "\r\nEND:VCALENDAR\r\n";
const ev = (uid, day, extra = {}) => ({ UID: uid, SUMMARY: "Analysis für Informatik VO", DTSTART: `202610${day}T101500`, DTEND: `202610${day}T114500`, LOCATION: "MI HS 1", ...extra });

describe("ICS-Parser für Abos", () => {
  it("liefert UID, Absagen und ersetzt geänderte Serientermine", () => {
    const text = cal([
      { UID: "serie", SUMMARY: "DS UE", DTSTART: "20261019T140000", DTEND: "20261019T160000", RRULE: "FREQ=WEEKLY;COUNT=3" },
      { UID: "serie", SUMMARY: "DS UE", "RECURRENCE-ID": "20261026T140000", DTSTART: "20261027T090000", DTEND: "20261027T110000", LOCATION: "Ersatzraum" },
      { UID: "abgesagt", SUMMARY: "DS VO", DTSTART: "20261022T080000", DTEND: "20261022T100000", STATUS: "CANCELLED" },
    ]);
    const out = parseICS(text);
    const serie = out.filter((e) => e.uid === "serie");
    expect(serie.map((e) => [e.date, e.start, e.occurrence])).toEqual([["2026-10-19", "14:00", "2026-10-19"], ["2026-10-27", "09:00", "2026-10-26"], ["2026-11-02", "14:00", "2026-11-02"]]);
    expect(out.find((e) => e.uid === "abgesagt").cancelled).toBe(true);
  });
});

describe("Stundenplan-Abo", () => {
  const base = () => ({ ...emptyData(), modules: [{ id: "ana", name: "Analysis für Informatik", code: "MA0902" }] });
  const map = { "Analysis für Informatik VO": "ana" };

  it("schlägt Zuordnungen vor und legt fehlende Module an", () => {
    const sums = ["Analysis für Informatik VO", "Grundlagen: Datenbanken UE", "Sport"];
    const g = guessMapping(sums, base().modules);
    expect(g).toEqual({ "Analysis für Informatik VO": "ana", "Grundlagen: Datenbanken UE": NEW, Sport: NEW });
    const r = resolveNewModules(base(), { ...g, Sport: SKIP });
    expect(r.modules.map((m) => m.name)).toEqual(["Analysis für Informatik", "Grundlagen: Datenbanken"]);
    expect(r.map.Sport).toBe(SKIP);
    expect(unmappedSummaries([{ summary: "A" }, { summary: "B" }], { A: "x" })).toEqual(["B"]);
  });

  it("legt neue Termine an und erkennt sie beim nächsten Abruf wieder", () => {
    const events = parseICS(cal([ev("a1", "22"), ev("a2", "29")]));
    const first = applyFeed(base(), events, map, T);
    expect(first.stats).toEqual({ added: 2, updated: 0, cancelled: 0, removed: 0, merged: 0 });
    expect(first.sessions[0]).toMatchObject({ moduleId: "ana", type: "Vorlesung", start: "10:15", end: "11:45", room: "MI HS 1", feedKey: "a1|2026-10-22" });
    const d = { ...base(), sessions: first.sessions };
    expect(applyFeed(d, events, map, T).stats).toEqual({ added: 0, updated: 0, cancelled: 0, removed: 0, merged: 0 });
  });

  it("übernimmt Raumänderungen und Absagen, behält eigene Häkchen", () => {
    const d1 = { ...base(), sessions: applyFeed(base(), parseICS(cal([ev("a1", "22")])), map, T).sessions };
    d1.sessions[0] = { ...d1.sessions[0], prepared: true };
    const r = applyFeed(d1, parseICS(cal([ev("a1", "22", { LOCATION: "Interims 1" })])), map, T);
    expect(r.stats.updated).toBe(1);
    expect(r.sessions[0]).toMatchObject({ room: "Interims 1", prepared: true });
    const c = applyFeed({ ...base(), sessions: r.sessions }, parseICS(cal([ev("a1", "22", { STATUS: "CANCELLED" })])), map, T);
    expect(c.stats.cancelled).toBe(1);
    expect(c.sessions[0]).toMatchObject({ cancelled: true, prepared: true });
  });

  it("entfernt verschwundene künftige Termine, behält bearbeitete und vergangene", () => {
    const evs = parseICS(cal([ev("past", "12"), ev("a1", "31"), ev("a2", "29"), ev("bleibt", "30")]));
    const d = { ...base(), sessions: applyFeed(base(), evs, map, T).sessions };
    const reviewed = d.sessions.find((s) => s.feedKey.startsWith("a2"));
    reviewed.reviewed = true;
    const r = applyFeed(d, parseICS(cal([ev("bleibt", "30")])), map, T);
    expect(r.stats).toMatchObject({ removed: 1, cancelled: 1 });
    expect(r.sessions.map((s) => [s.feedKey.split("|")[0], !!s.cancelled]).sort()).toEqual([["a2", true], ["bleibt", false], ["past", false]]);
  });

  it("meldet Raum- und Zeitänderungen der nächsten Wochen, bis man sie bestätigt", () => {
    const d = { ...base(), sessions: applyFeed(base(), parseICS(cal([ev("a1", "22"), ev("weit", "30")])), map, T).sessions };
    expect(feedChanges(d.sessions, T)).toEqual([]);
    const r = applyFeed(d, parseICS(cal([ev("a1", "22", { LOCATION: "Interims 1", DTSTART: "20261022T120000", DTEND: "20261022T134500" }), ev("weit", "30")])), map, T);
    const [c] = feedChanges(r.sessions, T);
    expect(c.change.was).toEqual({ start: "10:15", end: "11:45", room: "MI HS 1" });
    expect(describeChange(c)).toBe("Zeit: 10:15–11:45 → 12:00–13:45, Raum: MI HS 1 → Interims 1");
    /* zweite Änderung: der ursprüngliche Stand bleibt; zurück auf den alten Raum zählt nur noch die Zeit */
    const r2 = applyFeed({ ...base(), sessions: r.sessions }, parseICS(cal([ev("a1", "22", { DTSTART: "20261022T120000", DTEND: "20261022T134500" }), ev("weit", "30")])), map, T);
    expect(describeChange(feedChanges(r2.sessions, T)[0])).toBe("Zeit: 10:15–11:45 → 12:00–13:45");
    /* bald anstehender Termin verschwindet aus dem Kalender: bleibt als „fällt aus“ stehen */
    const r3 = applyFeed({ ...base(), sessions: r2.sessions.map((s) => ({ ...s, change: null })) }, parseICS(cal([ev("weit", "30")])), map, T);
    expect(r3.stats).toMatchObject({ removed: 0, cancelled: 1 });
    expect(feedChanges(r3.sessions, T).map(describeChange)).toEqual(["fällt aus"]);
  });

  it("ein leerer Kalender löscht nichts", () => {
    const d = { ...base(), sessions: applyFeed(base(), parseICS(cal([ev("a1", "22")])), map, T).sessions };
    expect(applyFeed(d, [], map, T).sessions).toHaveLength(1);
  });

  it("übernimmt früher manuell importierte Termine statt sie zu verdoppeln", () => {
    const d = { ...base(), sessions: [{ id: "alt", moduleId: "ana", date: "2026-10-22", start: "10:15", end: "11:45", reviewed: true }] };
    const r = applyFeed(d, parseICS(cal([ev("a1", "22")])), map, T);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0]).toMatchObject({ id: "alt", feedKey: "a1|2026-10-22", reviewed: true, room: "MI HS 1" });
  });

  it("übersprungene und unzugeordnete Veranstaltungen werden ignoriert", () => {
    const evs = parseICS(cal([ev("a1", "22"), { UID: "x", SUMMARY: "Sport", DTSTART: "20261022T180000", DTEND: "20261022T190000" }]));
    expect(applyFeed(base(), evs, { ...map, Sport: SKIP }, T).stats.added).toBe(1);
    expect(applyFeed(base(), evs, {}, T).stats.added).toBe(0);
  });

  describe("parallele Säle", () => {
    const hs1 = (day, extra) => ev(`h1-${day}`, day, extra);
    const hs2 = (day, extra) => ev(`h2-${day}`, day, { LOCATION: "Interims I", ...extra });

    it("fasst gleichzeitige Termine desselben Moduls zu einem zusammen", () => {
      const evs = parseICS(cal([hs1("22"), hs2("22"), hs1("29"), hs2("29")]));
      const g = groupParallel(evs, map);
      expect(g).toHaveLength(2);
      expect(g[0]).toMatchObject({ room: "MI HS 1 / Interims I", cancelled: false });
      const r = applyFeed(base(), evs, map, T);
      expect(r.stats.added).toBe(2);
      expect(r.sessions.map((x) => x.room)).toEqual(["MI HS 1 / Interims I", "MI HS 1 / Interims I"]);
      // zweiter Abruf: nichts ändert sich
      expect(applyFeed({ ...base(), sessions: r.sessions }, evs, map, T).stats).toMatchObject({ added: 0, updated: 0, removed: 0, merged: 0 });
    });

    it("legt früher doppelt importierte Termine zusammen, Häkchen und Notizen bleiben", () => {
      /* Stand vor dem Update: pro Saal ein eigener Termin */
      const old = [
        { id: "s1", moduleId: "ana", feedKey: "h1-22|2026-10-22", date: "2026-10-22", start: "10:15", end: "11:45", room: "MI HS 1", prepared: true, reviewed: false },
        { id: "s2", moduleId: "ana", feedKey: "h2-22|2026-10-22", date: "2026-10-22", start: "10:15", end: "11:45", room: "Interims I", reviewed: true, reviewedAt: "2026-10-22" },
      ];
      const d = { ...base(), sessions: old, notes: [{ id: "n", sessionId: "s2", title: "Mitschrift" }] };
      const r = applyFeed(d, parseICS(cal([hs1("22"), hs2("22")])), map, T);
      expect(r.stats.merged).toBe(1);
      expect(r.sessions).toHaveLength(1);
      expect(r.sessions[0]).toMatchObject({ prepared: true, reviewed: true, reviewedAt: "2026-10-22", room: "MI HS 1 / Interims I" });
      expect(r.notes[0].sessionId).toBe(r.sessions[0].id);
    });

    it("sagt ein Saal ab, bleibt der Termin mit dem anderen Raum bestehen", () => {
      const d = { ...base(), sessions: applyFeed(base(), parseICS(cal([hs1("22"), hs2("22")])), map, T).sessions };
      const r = applyFeed(d, parseICS(cal([hs1("22"), hs2("22", { STATUS: "CANCELLED" })])), map, T);
      expect(r.sessions).toHaveLength(1);
      expect(r.sessions[0]).toMatchObject({ room: "MI HS 1", cancelled: false });
      const both = applyFeed({ ...base(), sessions: r.sessions }, parseICS(cal([hs1("22", { STATUS: "CANCELLED" }), hs2("22", { STATUS: "CANCELLED" })])), map, T);
      expect(both.sessions[0].cancelled).toBe(true);
    });

    it("Vorlesung und Übung zur selben Zeit bleiben getrennt", () => {
      const evs = parseICS(cal([hs1("22"), ev("u", "22", { SUMMARY: "Analysis für Informatik UE" })]));
      const r = applyFeed(base(), evs, { ...map, "Analysis für Informatik UE": "ana" }, T);
      expect(r.sessions.map((x) => x.type).sort()).toEqual(["Vorlesung", "Übung"]);
    });
  });
});
