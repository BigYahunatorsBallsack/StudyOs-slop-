import { describe, expect, it } from "vitest";
import { expandRange, newSubtasks, subProgress, toggleSubtask } from "../../src/lib/subtasks.js";
import { parseQuick, quickToEntity } from "../../src/lib/quickadd.js";

const T = "2026-10-21";
const M = [{ id: "ds", name: "Diskrete Strukturen" }, { id: "ana", name: "Analysis für Informatik" }];

describe("Teilaufgaben", () => {
  it("löst Bereiche auf", () => {
    expect(expandRange("a-d")).toEqual(["a", "b", "c", "d"]);
    expect(expandRange("A–C")).toEqual(["A", "B", "C"]);
    expect(expandRange("Aufgabe 1-3")).toEqual(["Aufgabe 1", "Aufgabe 2", "Aufgabe 3"]);
    expect(expandRange("2-4")).toEqual(["2", "3", "4"]);
    expect(expandRange("c-a")).toBeNull();
    expect(expandRange("A1-3")).toEqual(["A1", "A2", "A3"]);
    expect(expandRange("Beweis")).toBeNull();
  });

  it("legt eine oder mehrere an, höchstens 26", () => {
    const one = newSubtasks("Induktionsbeweis");
    expect(one.map((s) => s.title)).toEqual(["Induktionsbeweis"]);
    expect(newSubtasks("b-c", one).map((s) => [s.title, s.done])).toEqual([["Induktionsbeweis", false], ["b", false], ["c", false]]);
    expect(newSubtasks("a-z", one)).toHaveLength(26);
    expect(newSubtasks("  ", one)).toBe(one);
  });

  it("zählt den Fortschritt und passt den Status an", () => {
    const h = { status: "ausgegeben", doneAt: null, subtasks: [{ id: "a", title: "a", done: false }, { id: "b", title: "b", done: false }] };
    expect(subProgress(h)).toEqual({ done: 0, total: 2 });
    expect(subProgress({})).toEqual({ done: 0, total: 0 });
    const h1 = { ...h, ...toggleSubtask(h, "a", T) };
    expect(h1).toMatchObject({ status: "in Arbeit", doneAt: null });
    const h2 = { ...h1, ...toggleSubtask(h1, "b", T) };
    expect(h2).toMatchObject({ status: "bearbeitet", doneAt: T });
    expect({ ...h2, ...toggleSubtask(h2, "b", T) }).toMatchObject({ status: "in Arbeit", doneAt: null });
    const sent = { ...h2, status: "abgegeben" };
    expect(toggleSubtask(sent, "b", T).status).toBeUndefined();
  });

  it("Schnelleingabe erkennt Teilaufgaben", () => {
    const q = parseQuick("Blatt 5 DS Fr a-c", M, T);
    expect(q).toMatchObject({ kind: "homework", title: "Blatt 5", date: "2026-10-23", subtasks: ["a", "b", "c"] });
    expect(q.module.id).toBe("ds");
    expect(quickToEntity(q, T).vals.subtasks.map((s) => [s.title, s.done])).toEqual([["a", false], ["b", false], ["c", false]]);
    expect(parseQuick("Blatt 2 Analysis morgen Aufgaben 1-3", M, T)).toMatchObject({ title: "Blatt 2", start: "", subtasks: ["Aufgabe 1", "Aufgabe 2", "Aufgabe 3"] });
    expect(parseQuick("Übung DS Do 14-16", M, T)).toMatchObject({ kind: "session", start: "14:00", subtasks: [] });
    expect(quickToEntity(parseQuick("Blatt 5 DS Fr", M, T), T).vals.subtasks).toBeUndefined();
  });
});
