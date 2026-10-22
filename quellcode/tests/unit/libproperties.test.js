/* Eigenschaftsbasierte Tests (fast-check) für die Logik-Schicht: Datumsrechnung über Monats-, Jahres- und
   Zeitumstellungsgrenzen, Schnelleingabe mit beliebigem Text, ICS- und CSV-Hin-und-zurück, GOP-Kombinationen */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addDays, diffDays, isoYearWeek, validDate, wdIdx, weekStart } from "../../src/lib/util.js";
import { parseQuick, quickToEntity } from "../../src/lib/quickadd.js";
import { buildICS, parseICS } from "../../src/lib/ics.js";
import { cardsToCsv, parseCsv, splitReviewTime } from "../../src/lib/cards.js";
import { minimalCombos } from "../../src/lib/tum.js";
import { nextTitle, numberOf } from "../../src/lib/study.js";
import { pushRecent } from "../../src/lib/recent.js";
import { findDate } from "../../src/lib/sheet.js";
import { emptyData } from "../../src/lib/data.js";

const pad = (n) => String(n).padStart(2, "0");
/* beliebiger Tag zwischen 1990 und 2099 als „JJJJ-MM-TT“ */
const day = fc.integer({ min: 0, max: 40000 }).map((n) => addDays("1990-01-01", n));

describe("Datumsrechnung", () => {
  it("addDays und diffDays sind zueinander invers und liefern echte Daten", () => {
    fc.assert(fc.property(day, fc.integer({ min: -800, max: 800 }), (d, n) => {
      const e = addDays(d, n);
      expect(validDate(e)).toBe(true);
      expect(diffDays(d, e)).toBe(n);
      expect(wdIdx(addDays(d, 7 * n)) === wdIdx(d)).toBe(true);
    }));
  });
  it("Wochenbeginn ist ein Montag höchstens 6 Tage vorher; alle Tage einer Woche haben dieselbe ISO-Woche", () => {
    fc.assert(fc.property(day, (d) => {
      const m = weekStart(d);
      expect(wdIdx(m)).toBe(0);
      expect(diffDays(m, d)).toBeGreaterThanOrEqual(0);
      expect(diffDays(m, d)).toBeLessThanOrEqual(6);
      const w = isoYearWeek(m);
      expect(w.week).toBeGreaterThanOrEqual(1);
      expect(w.week).toBeLessThanOrEqual(53);
      for (let i = 1; i < 7; i++) expect(isoYearWeek(addDays(m, i))).toEqual(w);
      expect(isoYearWeek(addDays(m, 7))).not.toEqual(w);
    }));
  });
  it("validDate stimmt mit dem Kalender überein", () => {
    fc.assert(fc.property(fc.integer({ min: 1900, max: 2200 }), fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 32 }), (y, m, d) => {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
      expect(validDate(`${y}-${pad(m)}-${pad(d)}`)).toBe(m >= 1 && m <= 12 && d >= 1 && d <= len);
    }));
  });
});

describe("Schnelleingabe mit beliebigem Text", () => {
  const words = fc.constantFrom("Blatt", "VL", "Klausur", "morgen", "heute", "nächsten", "Montag", "Fr", "31.02.", "29.02.", "14.11.", "2026-13-01", "2026-11-05",
    "10-12", "25", "Uhr", "um", "9", "1,5", "min", "2h", "90", "in", "3", "Tagen", "a-c", "Aufgaben", "1-4", "DS", "Analysis", "gelernt", "Karten", "-", ",", "Notiz:");
  const text = fc.oneof(fc.string({ maxLength: 40 }), fc.array(words, { maxLength: 8 }).map((w) => w.join(" ")));
  const mods = [{ id: "a", name: "Analysis für Informatik" }, { id: "d", name: "Diskrete Strukturen", code: "IN0015" }];
  it("stürzt nie ab; Datum leer oder echt, Uhrzeiten gültig, Minuten endlich", () => {
    fc.assert(fc.property(text, day, (s, today) => {
      const q = parseQuick(s, mods, today);
      expect(q.date === "" || validDate(q.date)).toBe(true);
      for (const t of [q.start, q.end]) expect(t === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).toBe(true);
      expect(q.minutes === null || Number.isFinite(q.minutes)).toBe(true);
      expect(["homework", "exam", "session", "log", "note"]).toContain(q.kind || (s.trim() ? "?" : "note")); /* leere Eingabe: noch keine Art */
      const e = quickToEntity(q, today);
      if (e.kind === "session") expect(e.vals.end > e.vals.start || e.vals.end === e.vals.start && e.vals.start === "23:59").toBe(true);
    }), { numRuns: 400 });
  });
  it("Frist aus einem Blatt ist leer oder ein echtes Datum", () => {
    fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 60 }), fc.array(fc.constantFrom("Abgabe", "31.11.", "14.11.2026", "3", "Aufgaben", "November", "14", "2026", "0.5.", "29.02."), { maxLength: 8 }).map((w) => w.join(" "))), (s) => {
      const d = findDate(s, "2026-10-21");
      expect(d === "" || validDate(d)).toBe(true);
    }));
  });
});

describe("ICS hin und zurück", () => {
  const title = fc.string({ minLength: 1, maxLength: 120, unit: fc.constantFrom(..."abcÄöü߀😀 ,;:\\\"'xyz-–".split("")) });
  it("Titel kommen mit Sonderzeichen und Umbrüchen über 75 Byte unverändert zurück", () => {
    fc.assert(fc.property(fc.array(title, { minLength: 1, maxLength: 4 }), (titles) => {
      const d = { ...emptyData(), homework: titles.map((t, i) => ({ id: "h" + i, moduleId: "", title: t, due: addDays("2030-01-01", i), status: "ausgegeben" })) };
      const out = buildICS(d, { uni: false });
      for (const line of out.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      const back = parseICS(out);
      expect(back.map((e) => e.summary)).toEqual(titles.map((t) => `Abgabe: ${t} (Allgemein)`));
    }));
  });
});

describe("CSV hin und zurück", () => {
  const field = fc.string({ maxLength: 20, unit: fc.constantFrom(..."ab;,\t\"\n\r xÄ".split("")) });
  it("Vorder- und Rückseite überstehen Export und Import", () => {
    fc.assert(fc.property(fc.array(fc.record({ front: field.filter((s) => s.trim() !== ""), back: field, tags: field }), { maxLength: 6 }), (cards) => {
      const rows = parseCsv(cardsToCsv(cards));
      expect(rows[0]).toEqual(["Vorderseite", "Rückseite", "Tags", "Modul"]);
      /* \r allein wird beim Einlesen nicht verändert, \r\n bleibt innerhalb von Anführungszeichen erhalten */
      expect(rows.slice(1).map((r) => [r[0], r[1], r[2]])).toEqual(cards.map((c) => [c.front, c.back, c.tags]));
    }));
  });
  it("Abfragezeit geht beim Aufteilen nicht verloren", () => {
    fc.assert(fc.property(fc.dictionary(fc.constantFrom("a", "b", ""), fc.integer({ min: 0, max: 10 * 3600000 })), (pending) => {
      const { add, rest } = splitReviewTime(pending);
      for (const [k, ms] of Object.entries(pending)) expect((add[k] || 0) * 60000 + (rest[k] || 0)).toBe(ms);
      const fin = splitReviewTime(pending, true);
      expect(fin.rest).toEqual({});
    }));
  });
});

describe("GOP-Kombinationen", () => {
  const brute = (open, need) => {
    const combos = [];
    for (let mask = 1; mask < 1 << open.length; mask++) {
      const pick = open.filter((_, i) => mask & (1 << i));
      if (pick.reduce((s, m) => s + m.ects, 0) < need) continue;
      if (combos.some((c) => c.every((x) => pick.includes(x)))) continue;
      combos.push(pick);
    }
    return combos.sort((a, b) => a.length - b.length).slice(0, 4);
  };
  it("gleich wie die vollständige Suche über alle Teilmengen", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 15 }), { maxLength: 9 }), fc.integer({ min: 1, max: 60 }), (ects, need) => {
      const open = ects.map((e, i) => ({ id: "m" + i, ects: e }));
      expect(minimalCombos(open, need)).toEqual(brute(open, need));
    }));
  });
});

describe("Kleinkram", () => {
  it("nextTitle zählt die Blattnummer um eins hoch", () => {
    fc.assert(fc.property(fc.constantFrom("Blatt", "Übungsblatt", "Sheet", "Hausaufgabe Nr.", "Woche"), fc.integer({ min: 0, max: 98 }), fc.boolean(), (w, n, lead) => {
      const t = `${w} ${lead ? pad(n) : n}`;
      expect(numberOf(nextTitle(t))).toBe(n + 1);
    }));
  });
  it("pushRecent: neuester vorn, keine Doppelten, höchstens max", () => {
    fc.assert(fc.property(fc.array(fc.record({ kind: fc.constantFrom("note", "module"), id: fc.constantFrom("a", "b", "c", "d") })), fc.constantFrom("note", "module"), fc.constantFrom("a", "b", "e"), (list, kind, id) => {
      const out = pushRecent(list, kind, id, 3);
      expect(out[0]).toEqual({ kind, id });
      expect(out.length).toBeLessThanOrEqual(3);
      expect(out.filter((x) => x.kind === kind && x.id === id)).toHaveLength(1);
    }));
  });
});
