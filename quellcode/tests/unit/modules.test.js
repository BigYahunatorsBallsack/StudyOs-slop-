import { describe, it, expect } from "vitest";
import { baseName, mergeSuggestions, mergeModules, moduleContents, pickTarget } from "../../src/lib/modules.js";
import { guessMapping, resolveNewModules, NEW } from "../../src/lib/feed.js";
import { emptyData } from "../../src/lib/data.js";

describe("Namenskern", () => {
  it("entfernt die Art der Veranstaltung", () => {
    const names = ["Diskrete Strukturen", "Übungen zu Diskrete Strukturen", "Tutorübungen zu Diskrete Strukturen", "Zentralübung zu Diskrete Strukturen",
      "Diskrete Strukturen (Übung)", "Diskrete Strukturen VO", "Diskrete Strukturen - Tutorium", "Tutorübung: Diskrete Strukturen", "Diskrete Strukturen (Beispiel)", "Diskrete Strukturen, Gruppe 12"];
    expect(new Set(names.map(baseName))).toEqual(new Set(["diskrete strukturen"]));
  });
  it("lässt echte Namensteile stehen", () => {
    expect(baseName("Einführung in die Informatik")).toBe("einführung in die informatik");
    expect(baseName("Grundlagen: Datenbanken")).toBe("grundlagen: datenbanken");
    expect(baseName("Praktikum: Grundlagen der Programmierung")).toBe("grundlagen der programmierung");
    expect(baseName("Analysis für Informatik")).not.toBe(baseName("Lineare Algebra für Informatik"));
  });
});

describe("Zusammenführen", () => {
  const d = () => ({
    ...emptyData(),
    modules: [
      { id: "ue", name: "Übungen zu Diskrete Strukturen", ects: 6 },
      { id: "ds", name: "Diskrete Strukturen", ects: 8, code: "" },
      { id: "tu", name: "Tutorübungen zu Diskrete Strukturen", ects: 6, code: "IN0015" },
      { id: "la", name: "Lineare Algebra" },
    ],
    sessions: [{ id: "s1", moduleId: "ue" }, { id: "s2", moduleId: "ds" }, { id: "s3", moduleId: "tu" }, { id: "s4", moduleId: "la" }],
    homework: [{ id: "h", moduleId: "tu" }], notes: [{ id: "n", moduleId: "ue", sessionId: "s1" }], exams: [{ id: "e", moduleId: "ds" }],
    settings: { ...emptyData().settings, icsFeed: { url: "x", map: { "Übungen zu Diskrete Strukturen": "ue", "Tutorübungen zu Diskrete Strukturen": "tu", "Lineare Algebra VO": "la" } } },
    meta: { lastModule: "tu" },
  });

  it("schlägt Gruppen vor und wählt den reinen Namen als Obermodul", () => {
    const s = mergeSuggestions(d().modules);
    expect(s).toHaveLength(1);
    expect(s[0].modules.map((m) => m.id).sort()).toEqual(["ds", "tu", "ue"]);
    expect(s[0].target.id).toBe("ds");
    expect(mergeSuggestions(d().modules, [s[0].key])).toEqual([]);
    expect(pickTarget([{ id: "a", name: "Übungen zu X" }, { id: "b", name: "Tutorübung X", code: "IN1" }]).id).toBe("b");
  });

  it("verschiebt alles ins Obermodul und merkt es sich fürs Abo", () => {
    const out = mergeModules(d(), "ds", ["ue", "tu"]);
    expect(out.modules.map((m) => m.id)).toEqual(["ds", "la"]);
    expect(out.modules[0]).toMatchObject({ name: "Diskrete Strukturen", ects: 8, code: "IN0015" });
    expect(out.sessions.map((x) => x.moduleId)).toEqual(["ds", "ds", "ds", "la"]);
    expect(out.homework[0].moduleId).toBe("ds");
    expect(out.notes[0]).toMatchObject({ moduleId: "ds", sessionId: "s1" });
    expect(Object.values(out.settings.icsFeed.map)).toEqual(["ds", "ds", "la"]);
    expect(out.meta.lastModule).toBe("ds");
    expect(moduleContents(d(), ["ue", "tu"])).toMatchObject({ sessions: 2, homework: 1, notes: 1, exams: 0 });
  });

  it("ignoriert ungültige Aufrufe", () => {
    const base = d();
    expect(mergeModules(base, "ds", ["ds"])).toBe(base);
    expect(mergeModules(base, "gibtsnicht", ["ue"])).toBe(base);
  });

  it("neue Abos legen zusammengehörige Veranstaltungen als ein Modul an", () => {
    const sums = ["Diskrete Strukturen", "Übungen zu Diskrete Strukturen", "Tutorübungen zu Diskrete Strukturen", "Lineare Algebra für Informatik VO"];
    const map = guessMapping(sums, []);
    expect(Object.values(map).every((v) => v === NEW)).toBe(true);
    const r = resolveNewModules(emptyData(), map);
    expect(r.modules.map((m) => m.name)).toEqual(["Diskrete Strukturen", "Lineare Algebra für Informatik"]);
    expect(new Set(sums.slice(0, 3).map((s) => r.map[s])).size).toBe(1);
    // vorhandenes Modul wird wiedererkannt
    expect(guessMapping(["Zentralübung zu Diskrete Strukturen"], r.modules)["Zentralübung zu Diskrete Strukturen"]).toBe(r.modules[0].id);
  });
});
