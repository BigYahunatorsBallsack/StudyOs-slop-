/* Randfälle der Logik-Schicht, die früher falsch liefen: ungültige Daten in der Schnelleingabe, ICS mit Erinnerungen
   und maskierten Zeichen, Prüfungen ohne Datum, kaputte Uhrzeiten aus alten Datenständen, abgelaufene Fristen von heute */
import { describe, expect, it } from "vitest";
import { parseQuick, quickToEntity } from "../../src/lib/quickadd.js";
import { buildICS, fold, parseICS } from "../../src/lib/ics.js";
import { buildPlan } from "../../src/lib/plan.js";
import { holidayOf, offDay } from "../../src/lib/holidays.js";
import { byOrder, validDate } from "../../src/lib/util.js";
import { sessionLength, workload } from "../../src/lib/study.js";
import { gopStatus, minimalCombos } from "../../src/lib/tum.js";
import { findDate } from "../../src/lib/sheet.js";
import { nextUp } from "../../src/lib/next.js";
import { gradeTimeline } from "../../src/lib/stats.js";
import { duplicateCards } from "../../src/lib/cleanup.js";
import { backlinks } from "../../src/lib/wiki.js";
import { emptyData, searchAll } from "../../src/lib/data.js";
import { periodStats } from "../../src/lib/progress.js";

const T = "2026-10-21"; /* Mittwoch */
const q = (s, mods = []) => parseQuick(s, mods, T);

describe("Schnelleingabe: nur echte Kalenderdaten", () => {
  it("31.02., 31.11. und ISO-Daten mit Monat 13 werden kein Datum, sondern bleiben im Titel", () => {
    expect(q("Blatt 3 31.02.").date).toBe("");
    expect(q("Blatt 3 31.02.").title).toContain("31.02.");
    expect(q("Blatt 3 31.11.2026").date).toBe("");
    expect(q("Blatt 2026-13-45").date).toBe("");
    expect(q("Blatt 2026-02-30").date).toBe("");
  });
  it("29.02. ohne Jahr springt ins nächste Schaltjahr, mit Jahr nur im Schaltjahr", () => {
    expect(q("Blatt 29.02.").date).toBe("2028-02-29");
    expect(parseQuick("Blatt 29.02.", [], "2027-01-10").date).toBe("2028-02-29");
    expect(q("Blatt 29.02.2028").date).toBe("2028-02-29");
    expect(q("Blatt 29.02.2027").date).toBe("");
  });
  it("Jahreszahlen mit drei Stellen sind kein Datum", () => {
    expect(q("Blatt 1.2.202").date).toBe("");
    expect(q("Blatt 1.2.27").date).toBe("2027-02-01");
  });
  it("„nächsten …“ meint den Wochentag der nächsten Kalenderwoche", () => {
    expect(q("Abgabe nächsten Montag").date).toBe("2026-10-26");
    expect(q("Abgabe nächsten Mittwoch").date).toBe("2026-10-28");
    expect(q("Abgabe nächsten Sonntag").date).toBe("2026-11-01");
    expect(parseQuick("Abgabe nächsten Montag", [], "2026-10-25").date).toBe("2026-10-26"); /* Sonntag */
  });
  it("Uhrzeiten über 23 Uhr oder mit Minuten über 59 werden ignoriert", () => {
    expect(q("VL morgen 25 Uhr").start).toBe("");
    expect(q("VL morgen 10:75-12").start).toBe("");
    expect(q("VL morgen 10:15-11:45").end).toBe("11:45");
  });
  it("„1,5 min“ ergibt eine Zahl, kein NaN", () => {
    expect(q("1,5 min gelernt").minutes).toBe(2);
  });
  it("ein Termin um 23 Uhr endet um 23:59 statt null Minuten zu dauern", () => {
    const e = quickToEntity(q("VL morgen 23:00", [{ id: "m", name: "Analysis" }]), T);
    expect(e.vals).toMatchObject({ start: "23:00", end: "23:59" });
    expect(quickToEntity(q("VL morgen 20:30"), T).vals.end).toBe("22:30");
  });
});

describe("ICS", () => {
  const cal = (...lines) => ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:a", "DTSTART:20261020T100000", ...lines, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  it("die SUMMARY einer Erinnerung (VALARM) überschreibt nicht den Titel des Termins", () => {
    const ev = parseICS(cal("SUMMARY:Analysis", "BEGIN:VALARM", "ACTION:EMAIL", "SUMMARY:Erinnerung", "DESCRIPTION:bald", "END:VALARM", "LOCATION:MI HS 1"));
    expect(ev[0].summary).toBe("Analysis");
    expect(ev[0].room).toBe("MI HS 1");
    expect(ev[0].description).toBe("");
  });
  it("maskierte Zeichen werden in einem Durchgang aufgelöst: \\\\n bleibt Backslash + n", () => {
    expect(parseICS(cal("SUMMARY:C:\\\\new\\, Teil\\; 2\\nZeile"))[0].summary).toBe("C:\\new, Teil; 2 Zeile");
  });
  it("Prüfungen ohne Datum landen nicht als ungültiges DTSTART im Export; spätes Ende höchstens 23:59", () => {
    const d = { ...emptyData(), exams: [{ id: "x", moduleId: "", date: "" }, { id: "y", moduleId: "", date: "2026-11-02", time: "22:30" }, { id: "z", moduleId: "", date: "2026-11-03", time: "9" }] };
    const out = buildICS(d, { uni: false });
    expect(out).not.toContain("DTSTART:T");
    expect(out).toContain("DTSTART:20261102T223000");
    expect(out).toContain("DTEND:20261102T235900");
    expect(out).toContain("DTSTART:20261103T090000"); /* kaputte Uhrzeit: 9:00 */
    expect(out).not.toContain("NaN");
  });
  it("lange Zeilen werden nach 75 Byte umbrochen und beim Einlesen wieder zusammengesetzt", () => {
    const title = "Übungsblatt mit einem sehr langen Titel – Ärger, Öl; Straße & noch viel mehr Text dahinter";
    const d = { ...emptyData(), modules: [{ id: "m", name: "Analysis für Informatik" }], homework: [{ id: "h", moduleId: "m", title, due: "2026-11-02", status: "ausgegeben" }] };
    const out = buildICS(d, { uni: false });
    for (const line of out.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const back = parseICS(out);
    expect(back[0].summary).toBe(`Abgabe: ${title} (Analysis für Informatik)`);
  });
  it("fold lässt kurze Zeilen unverändert und teilt keine Umlaute", () => {
    expect(fold("SUMMARY:kurz")).toBe("SUMMARY:kurz");
    const long = "X:" + "ä".repeat(60);
    const parts = fold(long).split("\r\n ");
    expect(parts.join("")).toBe(long);
    parts.forEach((p, i) => expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(i ? 74 : 75));
  });
  it("Zeilenumbrüche mit \\r\\n im Titel werden maskiert", () => {
    const d = { ...emptyData(), exams: [], homework: [{ id: "h", moduleId: "", title: "a\r\nb", due: "2026-11-02", status: "ausgegeben" }] };
    expect(buildICS(d, { uni: false })).toContain("SUMMARY:Abgabe: a\\nb (Allgemein)");
  });
});

describe("Kaputte oder fehlende Werte aus älteren Datenständen", () => {
  it("Lernplan ohne Prüfungsdatum ist leer statt eines Plans für heute", () => {
    expect(buildPlan({ topics: [{ id: "a", moduleId: "m", title: "x", state: "gelernt" }] }, { moduleId: "m", date: "" }, T)).toEqual([]);
    expect(buildPlan({ topics: [] }, { moduleId: "m" }, T)).toEqual([]);
  });
  it("Feiertag eines ungültigen Datums ist null statt eines Absturzes", () => {
    expect(holidayOf("xx")).toBeNull();
    expect(holidayOf("")).toBeNull();
    expect(holidayOf(undefined)).toBeNull();
    expect(offDay("kaputt", {})).toBeNull();
    expect(holidayOf("2026-12-25")).toBe("1. Weihnachtstag");
  });
  it("Themen ohne Titel lassen sich sortieren", () => {
    const list = [{ order: 1 }, { order: 1, title: "b" }, { order: 0, title: "z" }, { title: "a" }];
    expect(() => [...list].sort(byOrder)).not.toThrow();
    expect([...list].sort(byOrder).map((x) => x.title)).toEqual(["a", "z", undefined, "b"]);
  });
  it("Uhrzeiten ohne Doppelpunkt ergeben 0 statt NaN Minuten Präsenz", () => {
    expect(sessionLength({ start: "10", end: "12" })).toBe(90);
    const data = { ...emptyData(), modules: [{ id: "m", ects: 6, status: "belegt" }], sessions: [{ id: "s", moduleId: "m", date: "2026-10-01", start: "10", end: "12", attended: true }], logs: [{ id: "l", moduleId: "m", date: "2026-10-02", minutes: 60, kind: "Nacharbeiten" }] };
    const w = workload(data, "m", "2026-10-14");
    expect(w.istH).toBe(1);
    expect(Number.isFinite(w.ratio)).toBe(true);
  });
  it("GOP: Prüfungen ohne Datum stehen hinter denen mit Datum", () => {
    const g = gopStatus({ settings: {}, modules: [{ id: "m", gop: true, ects: 5, status: "belegt" }], exams: [{ id: "a", moduleId: "m" }, { id: "b", moduleId: "m", date: "2027-02-10" }] });
    expect(g.open[0].exam.id).toBe("b");
  });
  it("Noten mit Komma zählen im Notenverlauf", () => {
    expect(gradeTimeline({ modules: [{ status: "bestanden", grade: "1,7", ects: 6, semester: 1 }, { status: "bestanden", grade: 2.3, ects: 6, semester: 2 }] }))
      .toEqual([{ semester: 1, ects: 6, avg: 1.7 }, { semester: 2, ects: 12, avg: 2 }]);
  });
});

describe("GOP-Kombinationen", () => {
  /* das frühere Verfahren: alle Bitmasken, minimale Mengen, nach Größe */
  const brute = (open, need) => {
    const combos = [];
    for (let mask = 1; mask < 1 << open.length; mask++) {
      const pick = open.filter((_, i) => mask & (1 << i));
      if (pick.reduce((s, m) => s + (Number(m.ects) || 0), 0) < need) continue;
      if (combos.some((c) => c.every((x) => pick.includes(x)))) continue;
      combos.push(pick);
    }
    return combos.sort((a, b) => a.length - b.length).slice(0, 4);
  };
  it("liefert dieselben Kombinationen wie die Suche über alle Teilmengen", () => {
    const sets = [[6, 8, 8], [5, 5, 5, 5, 10], [3, 4, 5, 6, 7, 8], [10, 2, 2, 2, 2, 2, 2], [0, 6, 6, 0, 12], [8, 8, 12, 5, 6, 6, 9, 4]];
    for (const ects of sets) {
      const open = ects.map((e, i) => ({ id: "m" + i, ects: e }));
      for (const need of [1, 6, 12, 16, 20, 26, 100]) expect(minimalCombos(open, need).map((c) => c.map((m) => m.id))).toEqual(brute(open, need).map((c) => c.map((m) => m.id)));
    }
  });
  it("bleibt bei vielen Modulen schnell (früher 2^n Teilmengen)", () => {
    const open = Array.from({ length: 24 }, (_, i) => ({ id: "m" + i, ects: 5 + (i % 4) }));
    const t0 = performance.now();
    const res = minimalCombos(open, 12);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(res).toHaveLength(4);
    res.forEach((c) => expect(c.length).toBe(2));
  });
});

describe("Frist aus dem Übungsblatt", () => {
  it("überspringt unmögliche Daten und Zahlen vor dem Monatsnamen", () => {
    expect(findDate("Abgabe bis 31.11.2026", T)).toBe("");
    expect(findDate("Version 1.13. Abgabe 14.11.2026", T)).toBe("2026-11-14");
    expect(findDate("Abgabe: 3 Aufgaben bis 14. November 2026", T)).toBe("2026-11-14");
    expect(findDate("due in 2 weeks, i.e. November 14, 2026", T)).toBe("2026-11-14");
    expect(findDate("Abgabe 0.5. 2026", T)).toBe("");
  });
});

describe("Als Nächstes", () => {
  const hw = (dueTime) => ({ sessions: [], exams: [], homework: [{ id: "h", due: T, dueTime, status: "ausgegeben" }] });
  it("eine heute schon abgelaufene Frist heißt „Überfällig seit 14:00“, nicht „Abgabe heute 14:00“", () => {
    expect(nextUp(hw("14:00"), T, "18:00").when).toBe("Überfällig seit 14:00");
    expect(nextUp(hw("14:00"), T, "14:00").when).toBe("Abgabe heute 14:00");
    expect(nextUp(hw("14:00"), T, "09:00").when).toBe("Abgabe heute 14:00");
    expect(nextUp(hw(""), T, "23:00").when).toBe("Abgabe heute");
  });
});

describe("Aufräumen, Backlinks, Suche, Wochenkarte", () => {
  it("bei gleich oft gelernten doppelten Karten bleibt die mit mehr Wiederholungen", () => {
    const g = duplicateCards({ cards: [{ id: "a", moduleId: "m", front: "F", back: "B", reps: 2, reviews: 3 }, { id: "b", moduleId: "m", front: "F", back: "B", reps: 2, reviews: 9 }] });
    expect(g[0].keep.id).toBe("b");
  });
  it("Backlinks lösen gleiche Titel wie findNote auf (eigenes Modul zuerst)", () => {
    const notes = [
      { id: "z1", title: "Ziel", moduleId: "A", text: "" },
      { id: "z2", title: "ziel", moduleId: "B", text: "" },
      { id: "a", title: "x", moduleId: "A", text: "siehe [[Ziel]]" },
      { id: "b", title: "y", moduleId: "B", text: "siehe [[ZIEL|hier]]" },
      { id: "c", title: "z", moduleId: "C", text: "[[ziel]] und [[Anderes]]" },
      { id: "d", title: "w", moduleId: "A", text: "ohne Link" },
    ];
    expect(backlinks(notes, notes[0]).map((n) => n.id)).toEqual(["a", "c"]);
    expect(backlinks(notes, notes[1]).map((n) => n.id)).toEqual(["b"]);
    expect(backlinks(notes, { id: "q", title: "  " })).toEqual([]);
  });
  it("Suche: bei doppelter Modul-id gilt wie bisher das erste Modul", () => {
    const d = { ...emptyData(), modules: [{ id: "m", name: "Analysis", ects: 6, status: "belegt" }, { id: "m", name: "Doppel", ects: 6, status: "belegt" }], homework: [{ id: "h", moduleId: "m", title: "Blatt 1", status: "ausgegeben" }] };
    expect(searchAll(d, "blatt")[0].sub).toBe("Analysis · ausgegeben");
    expect(searchAll(d, "analysis blatt")).toHaveLength(1);
  });
  it("Zeitraum-Kennzahlen zählen gehaltene Termine bis zum übergebenen Tag", () => {
    const d = { ...emptyData(), sessions: [{ id: "s", date: "2030-01-07", reviewed: true }, { id: "t", date: "2030-01-09" }] };
    expect(periodStats(d, "2030-01-06", "2030-01-12", "2030-01-08")).toMatchObject({ held: 1, heldReviewed: 1 });
  });
});

describe("validDate", () => {
  it("prüft Monatsenden und Schaltjahre", () => {
    expect(["2024-02-29", "2000-02-29", "2026-12-31", "2026-04-30"].every(validDate)).toBe(true);
    expect(["2026-02-29", "1900-02-29", "2026-04-31", "2026-00-10", "2026-1-1", "", null, "2026-10-21T10:00"].some(validDate)).toBe(false);
  });
});
