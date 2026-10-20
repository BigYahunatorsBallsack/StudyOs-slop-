/* Notizen und Karten: Karte aus Markierung, Checklisten, angeheftete Notizen, schwere Karten im Sync */
import { describe, expect, it } from "vitest";
import { cardFromSelection, cardsFromNote, syncNoteCards } from "../../src/lib/cards.js";
import { sortNotes, toggleTask } from "../../src/lib/notes.js";
import { duplicateEntry } from "../../src/lib/entries.js";
import { emptyData } from "../../src/lib/data.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";

describe("Karte aus markiertem Text", () => {
  it("nimmt den Text als Rückseite", () => {
    expect(cardFromSelection("  Ein Graph ist zusammenhängend, wenn …\n")).toEqual({ front: "", back: "Ein Graph ist zusammenhängend, wenn …" });
    expect(cardFromSelection("Zeile 1\nA :: B")).toEqual({ front: "", back: "Zeile 1\nA :: B" });
  });
  it("teilt „Frage :: Antwort“ in Vorder- und Rückseite, auch mit Listenzeichen oder Kästchen", () => {
    expect(cardFromSelection("Was ist O(n log n)? :: Mergesort")).toEqual({ front: "Was ist O(n log n)?", back: "Mergesort" });
    expect(cardFromSelection("- [ ] Hauptsatz :: Integral = Stammfunktion")).toEqual({ front: "Hauptsatz", back: "Integral = Stammfunktion" });
    expect(cardFromSelection("{{c1::Rekursion}} :: x").front).toBe("");
  });
});

describe("Checklisten in Notizen", () => {
  const text = "# Vorbereitung\n- [ ] Blatt 3\n- [x] Skript lesen\n  * [ ] Kapitel [[Graphen]]\n- [[Link]] ohne Kästchen\n1. [ ] nummeriert";
  it("schaltet genau das eine Kästchen um", () => {
    expect(toggleTask(text, 1).split("\n")[1]).toBe("- [x] Blatt 3");
    expect(toggleTask(text, 2).split("\n")[2]).toBe("- [ ] Skript lesen");
    expect(toggleTask(text, 3).split("\n")[3]).toBe("  * [x] Kapitel [[Graphen]]");
    expect(toggleTask(text, 5).split("\n")[5]).toBe("1. [x] nummeriert");
    expect(toggleTask(toggleTask(text, 1), 1)).toBe(text);
  });
  it("lässt Zeilen ohne Kästchen und Links in Ruhe", () => {
    expect(toggleTask(text, 0)).toBe(text);
    expect(toggleTask(text, 4)).toBe(text);
    expect(toggleTask(text, 99)).toBe(text);
  });
  it("Abhaken ändert keine Karte aus der Notiz", () => {
    const note = { id: "n1", moduleId: "m1", text: "- [ ] Was ist ein Baum? :: Ein kreisfreier Graph\n- [ ] Blatt 3" };
    expect(cardsFromNote(note.text)).toEqual([{ front: "Was ist ein Baum?", back: "Ein kreisfreier Graph" }]);
    let n = 0;
    const first = syncNoteCards([], note, "2026-10-20", () => "k" + ++n);
    expect(first.added).toBe(1);
    const again = syncNoteCards(first.cards, { ...note, text: toggleTask(note.text, 0) }, "2026-10-21", () => "x");
    expect(again.cards).toBe(first.cards);
  });
});

describe("angeheftete Notizen", () => {
  it("stehen oben, sonst gilt die letzte Änderung", () => {
    const notes = [{ id: "a", updated: "2026-10-01" }, { id: "b", updated: "2026-10-05", pinned: true }, { id: "c", updated: "2026-10-09" }, { id: "d", updated: "2026-09-01", pinned: true }];
    expect(sortNotes(notes).map((x) => x.id)).toEqual(["b", "d", "c", "a"]);
  });
  it("eine Kopie ist nicht angeheftet", () => {
    expect(duplicateEntry("note", { id: "a", title: "X", pinned: true }, "2026-10-20", () => "z").pinned).toBeUndefined();
  });
});

describe("Sync von schwer und angeheftet", () => {
  const T = (h) => `2026-10-20T${String(h).padStart(2, "0")}:00:00.000Z`;
  const edit = (d, fn, at) => stampChanges(d, fn(d), at);
  const base = edit(emptyData(), (d) => ({ ...d, cards: [{ id: "k1", front: "F", back: "B", interval: 1, due: "2026-10-20", reps: 1 }], notes: [{ id: "n1", title: "N", text: "" }] }), T(8));
  it("Markierung auf einem Gerät und Abfrage auf dem anderen bleiben beide erhalten", () => {
    const a = edit(base, (d) => ({ ...d, cards: d.cards.map((c) => ({ ...c, hard: true })), notes: d.notes.map((x) => ({ ...x, pinned: true })) }), T(9));
    const b = edit(base, (d) => ({ ...d, cards: d.cards.map((c) => ({ ...c, interval: 3, due: "2026-10-23", reps: 2 })), notes: d.notes.map((x) => ({ ...x, text: "neu" })) }), T(10));
    for (const m of [mergeData(a, b, T(11)).data, mergeData(b, a, T(11)).data]) {
      expect(m.cards[0]).toMatchObject({ hard: true, interval: 3, due: "2026-10-23" });
      expect(m.notes[0]).toMatchObject({ pinned: true, text: "neu" });
    }
  });
});
