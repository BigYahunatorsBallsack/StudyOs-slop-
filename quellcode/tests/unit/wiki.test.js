import { describe, expect, it } from "vitest";
import { backlinks, findNote, linkNames } from "../../src/lib/wiki.js";

const notes = [
  { id: "1", title: "Rekursion", moduleId: "eidi", text: "Siehe [[Induktion]] und [[induktion|Beweis]], dazu [[Fehlt]]." },
  { id: "2", title: "Induktion", moduleId: "ds", text: "" },
  { id: "3", title: "Induktion", moduleId: "eidi", text: "Zurück zu [[Rekursion]]" },
];

describe("Verlinkte Notizen", () => {
  it("findet Links ohne Doppelte und löst sie bevorzugt im selben Modul auf", () => {
    expect(linkNames(notes[0].text)).toEqual(["Induktion", "Fehlt"]);
    expect(findNote(notes, "induktion", "eidi").id).toBe("3");
    expect(findNote(notes, "Induktion", "ds").id).toBe("2");
    expect(findNote(notes, "Fehlt")).toBeNull();
  });
  it("zeigt, wer auf eine Notiz verweist", () => {
    expect(backlinks(notes, notes[2]).map((n) => n.id)).toEqual(["1"]);
    expect(backlinks(notes, notes[1])).toEqual([]);
    expect(backlinks(notes, notes[0]).map((n) => n.id)).toEqual(["3"]);
  });
});
