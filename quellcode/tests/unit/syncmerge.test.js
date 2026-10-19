/* Feldweises Zusammenführen und hybride Uhr: Uhrfehler, gleichzeitige Änderungen an verschiedenen Feldern,
   Gleichstände und gemischte App-Versionen. */
import { afterEach, describe, expect, it } from "vitest";
import { fingerprint } from "../../src/lib/cloudsync.js";
import { emptyData } from "../../src/lib/data.js";
import { findConflicts, mergeData, nowIso, restoreConflicts, setClockOffset, stampChanges, stampMap } from "../../src/lib/sync.js";

const T = (h, m = 0) => `2026-10-17T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const withHw = (items) => ({ ...emptyData(), homework: items });
const edit = (d, fn, at) => stampChanges(d, fn(d), at);
const patch = (coll, id, fields) => (d) => ({ ...d, [coll]: d[coll].map((x) => (x.id === id ? { ...x, ...fields } : x)) });
const both = (a, b, now = T(23)) => {
  const ab = mergeData(a, b, now).data, ba = mergeData(b, a, now).data;
  expect(fingerprint(ab)).toBe(fingerprint(ba));
  return ab;
};

afterEach(() => setClockOffset(0));

describe("feldweises Zusammenführen", () => {
  const base = edit(withHw([]), (d) => ({ ...d, homework: [{ id: "h1", title: "Blatt 1", status: "ausgegeben" }] }), T(8));

  it("behält Änderungen an verschiedenen Feldern von beiden Geräten", () => {
    const a = edit(base, patch("homework", "h1", { title: "Blatt 1 (korrigiert)" }), T(9));
    const b = edit(base, patch("homework", "h1", { status: "abgegeben" }), T(10));
    const m = both(a, b);
    expect(m.homework[0]).toMatchObject({ title: "Blatt 1 (korrigiert)", status: "abgegeben" });
    expect(mergeData(m, a).data.homework[0]).toBe(m.homework[0]);
  });

  it("beim selben Feld gewinnt die jüngere Änderung", () => {
    const a = edit(base, patch("homework", "h1", { title: "A" }), T(9));
    const b = edit(base, patch("homework", "h1", { title: "B" }), T(10));
    expect(both(a, b).homework[0].title).toBe("B");
  });

  it("hält den Lernstand einer Karte zusammen und behält trotzdem eine Textänderung", () => {
    const c0 = edit(emptyData(), (d) => ({ ...d, cards: [{ id: "k1", front: "Frage", back: "Antwort", interval: 1, due: "2026-10-18", reps: 1 }] }), T(8));
    const a = edit(c0, patch("cards", "k1", { interval: 4, due: "2026-10-21", reps: 2 }), T(9));
    const b = edit(c0, patch("cards", "k1", { front: "Frage (besser)", interval: 0, due: "2026-10-17", reps: 0 }), T(8, 30));
    const k = both(a, b).cards[0];
    expect(k).toMatchObject({ front: "Frage (besser)", interval: 4, due: "2026-10-21", reps: 2 });
  });

  it("führt Einstellungen pro Schlüssel zusammen", () => {
    const s0 = emptyData();
    const a = edit(s0, (d) => ({ ...d, settings: { ...d.settings, name: "Waltuh" } }), T(9));
    const b = edit(s0, (d) => ({ ...d, settings: { ...d.settings, weekGoal: 12 } }), T(10));
    const m = both(a, b);
    expect(m.settings).toMatchObject({ name: "Waltuh", weekGoal: 12 });
  });

  it("verhält sich bei Einträgen einer älteren App-Version (nur updated) wie früher", () => {
    const a = edit(base, patch("homework", "h1", { title: "neu" }), T(9));
    /* älteres Gerät: übernimmt fu unverändert und setzt nur updated */
    const old = { ...base, homework: [{ ...a.homework[0], title: "Blatt 1", status: "abgegeben", updated: T(10) }] };
    expect(both(a, old).homework[0]).toMatchObject({ title: "Blatt 1", status: "abgegeben" });
  });
});

describe("hybride Uhr", () => {
  it("eine Änderung auf einem Gerät mit nachgehender Uhr gewinnt gegen den Stand, den es bearbeitet hat", () => {
    const a = edit(withHw([]), (d) => ({ ...d, homework: [{ id: "h1", title: "vom Handy" }] }), T(12));
    const b = edit(a, patch("homework", "h1", { title: "vom Laptop, später" }), T(11)); /* Laptop-Uhr geht eine Stunde nach */
    expect(b.homework[0].updated > a.homework[0].updated).toBe(true);
    expect(both(a, b).homework[0].title).toBe("vom Laptop, später");
  });

  it("eine Löschung auf einem Gerät mit nachgehender Uhr greift", () => {
    const a = edit(withHw([]), (d) => ({ ...d, homework: [{ id: "h1", title: "x" }] }), T(12));
    const b = edit(a, (d) => ({ ...d, homework: [] }), T(11));
    expect(both(a, b).homework).toHaveLength(0);
  });

  it("ein wiederhergestellter Eintrag ist jünger als seine Löschung", () => {
    const a = edit(withHw([]), (d) => ({ ...d, homework: [{ id: "h1", title: "x" }] }), T(12));
    const del = edit(a, (d) => ({ ...d, homework: [] }), T(12));
    const back = edit(del, (d) => ({ ...d, homework: [a.homework[0]] }), T(11));
    expect(both(del, back).homework).toHaveLength(1);
  });

  it("nutzt den Versatz zur Serverzeit, ignoriert aber kleine Abweichungen", () => {
    setClockOffset(600000);
    expect(Date.parse(nowIso()) - Date.now()).toBeGreaterThan(590000);
    setClockOffset(800);
    expect(Math.abs(Date.parse(nowIso()) - Date.now())).toBeLessThan(500);
  });
});

describe("Gleichstand", () => {
  it("gleicher Zeitstempel, anderer Inhalt: beide Geräte landen beim selben Ergebnis und erkennen den Unterschied", () => {
    const a = withHw([{ id: "h1", title: "A", updated: T(9) }]);
    const b = withHw([{ id: "h1", title: "B", updated: T(9) }]);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    expect(both(a, b).homework[0].title).toBe("B");
  });

  it("Einträge ohne Zeitstempel laufen nicht mehr dauerhaft auseinander", () => {
    const a = withHw([{ id: "h1", title: "A" }]), b = withHw([{ id: "h1", title: "B" }]);
    expect(both(a, b).homework[0].title).toBe(both(b, a).homework[0].title);
  });
});

describe("Konflikthinweis pro Feld", () => {
  const base = edit(emptyData(), (d) => ({ ...d, notes: [{ id: "n1", title: "Titel", text: "Text" }] }), T(8));
  const synced = stampMap(base);

  it("meldet nichts, wenn das andere Gerät ein anderes Feld geändert hat", () => {
    const local = edit(base, patch("notes", "n1", { title: "Mein Titel" }), T(9));
    const remote = edit(base, patch("notes", "n1", { text: "Neuer Text" }), T(10));
    const merged = mergeData(local, remote).data;
    expect(findConflicts(local, merged, synced)).toEqual([]);
  });

  it("meldet ein überschriebenes Feld und stellt nur dieses wieder her", () => {
    const local = edit(base, patch("notes", "n1", { title: "Mein Titel" }), T(9));
    const remote = edit(base, patch("notes", "n1", { title: "Fremder Titel", text: "Neuer Text" }), T(10));
    const merged = mergeData(local, remote).data;
    const list = findConflicts(local, merged, synced);
    expect(list.map((k) => [k.id, k.kind, k.fields])).toEqual([["n1", "overwritten", ["title"]]]);
    const restored = edit(merged, (d) => restoreConflicts(d, list), T(11));
    expect(restored.notes[0]).toMatchObject({ title: "Mein Titel", text: "Neuer Text" });
    expect(both(restored, remote).notes[0]).toMatchObject({ title: "Mein Titel", text: "Neuer Text" });
  });
});

describe("Stempeln", () => {
  it("setzt den Zeitstempel nicht zurück, wenn sich nur `updated` geändert hat", () => {
    const d = edit(withHw([]), (x) => ({ ...x, homework: [{ id: "h1", title: "x" }] }), T(12));
    const out = edit(d, patch("homework", "h1", { updated: "2026-10-17" }), T(13));
    expect(out.homework[0]).toBe(d.homework[0]);
  });
});
