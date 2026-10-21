import { describe, it, expect } from "vitest";
import { duplicateCards, duplicateSessions, emptyNotes, findCleanup, orphanFiles, referencedFiles, removeDuplicateCards, removeDuplicateSessions, removeEmptyNotes } from "../../src/lib/cleanup.js";
import { emptyData } from "../../src/lib/data.js";
import { addTrash, restoreTrash, trashEntry } from "../../src/lib/trash.js";
import { fromB64u, lockConfig, lockDue, saveLockConfig, toB64u } from "../../src/lib/applock.js";

const ses = (id, extra = {}) => ({ id, moduleId: "m1", date: "2026-10-20", start: "10:00", end: "12:00", type: "Vorlesung", ...extra });
const data = () => ({ ...emptyData(),
  modules: [{ id: "m1", name: "DS" }],
  sessions: [ses("s1"), ses("s2", { attended: true }), ses("s3"), ses("s4", { type: "Übung" }), ses("s5", { moduleId: "m2" }), ses("s6", { start: "12:00" })],
  notes: [
    { id: "n1", moduleId: "m1", sessionId: "s3", title: "Mitschrift", text: "a" },
    { id: "n2", moduleId: "m1", sessionId: "", title: " ", text: "" },
    { id: "n3", moduleId: "", sessionId: "", title: "", text: "", files: [{ id: "f1", name: "a.pdf", type: "application/pdf", size: 3 }] },
    { id: "n4", moduleId: "", sessionId: "", title: "", text: "Bild ![x](att:f2)" },
  ],
  logs: [{ id: "l1", moduleId: "m1", sessionId: "s1", kind: "Besucht", date: "2026-10-20", minutes: 90 }],
  cards: [
    { id: "c1", moduleId: "m1", front: "Was ist ein Baum?", back: "Graph", reps: 0 },
    { id: "c2", moduleId: "m1", front: " Was ist  ein Baum? ", back: "Graph", reps: 3 },
    { id: "c3", moduleId: "m2", front: "Was ist ein Baum?", back: "Graph" },
    { id: "c4", moduleId: "m1", front: "Was ist ein Baum?", back: "Wald" },
    { id: "c5", moduleId: "m1", front: "Bild", back: "", occ: { img: { id: "f3" }, boxes: [], target: "b1" } },
    { id: "c6", moduleId: "m1", front: "Bild", back: "", occ: { img: { id: "f3" }, boxes: [], target: "b2" } },
  ],
});

describe("Aufräumen", () => {
  it("findet doppelte Termine (Modul, Datum, Beginn, Art) und behält den bearbeiteten", () => {
    const g = duplicateSessions(data());
    expect(g).toHaveLength(1);
    expect(g[0].keep.id).toBe("s2");
    expect(g[0].remove.map((x) => x.id)).toEqual(["s1", "s3"]);
  });

  it("entfernt Doppel und hängt Notizen und Lerneinheiten an den behaltenen Termin", () => {
    const d = data();
    const out = removeDuplicateSessions(d);
    expect(out.sessions.map((s) => s.id)).toEqual(["s2", "s4", "s5", "s6"]);
    expect(out.notes.find((n) => n.id === "n1").sessionId).toBe("s2");
    expect(out.logs[0].sessionId).toBe("s2");
    // über den Papierkorb: Wiederherstellen bringt Termine und alte Verknüpfungen zurück
    const t = addTrash(out, trashEntry(d, out));
    const back = restoreTrash(t, t.meta.trash[0].id);
    expect(back.sessions.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(back.notes.find((n) => n.id === "n1").sessionId).toBe("s3");
    expect(back.logs[0].sessionId).toBe("s1");
  });

  it("findet doppelte Karteikarten im selben Modul, Bildkarten nicht", () => {
    const g = duplicateCards(data());
    expect(g.map((x) => [x.keep.id, x.remove.map((y) => y.id)])).toEqual([["c2", ["c1"]]]);
    expect(removeDuplicateCards(data()).cards.map((c) => c.id)).toEqual(["c2", "c3", "c4", "c5", "c6"]);
  });

  it("leere Notizen: ohne Titel, Text und Anhänge", () => {
    expect(emptyNotes(data()).map((n) => n.id)).toEqual(["n2"]);
    expect(removeEmptyNotes(data()).notes.map((n) => n.id)).toEqual(["n1", "n3", "n4"]);
    expect(findCleanup(data())).toMatchObject({ sessions: { count: 2 }, cards: { count: 1 }, notes: { count: 1 } });
  });

  it("verwaiste Anhänge: nur lokale Dateien ohne Eintrag; Papierkorb, Bildkarten und eingebettete Bilder zählen", () => {
    const d = data();
    expect([...referencedFiles(d)].sort()).toEqual(["f1", "f2", "f3"]);
    expect(orphanFiles(d, ["f1", "f2", "f3", "f4", "f4"])).toEqual(["f4"]);
    const gone = { ...d, notes: d.notes.filter((n) => n.id !== "n3") };
    const trashed = addTrash(gone, trashEntry(d, gone));
    expect(orphanFiles(trashed, ["f1", "f4"])).toEqual(["f4"]);
    expect(orphanFiles({ ...gone, meta: {} }, ["f1", "f4"])).toEqual(["f1", "f4"]);
  });

  it("nichts gefunden: Daten bleiben dieselben Objekte", () => {
    const d = emptyData();
    expect(removeDuplicateSessions(d)).toBe(d);
    expect(removeDuplicateCards(d)).toBe(d);
    expect(removeEmptyNotes(d)).toBe(d);
  });
});

describe("App-Sperre", () => {
  it("Credential-ID als base64url hin und zurück", () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 251, 1, 2]);
    const s = toB64u(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...fromB64u(s)]).toEqual([...bytes]);
  });

  it("sperrt erst nach der Hintergrundzeit", () => {
    expect(lockDue(null, 1000)).toBe(false);
    expect(lockDue(0, 5 * 60000 - 1)).toBe(false);
    expect(lockDue(0, 5 * 60000)).toBe(true);
  });

  it("merkt sich die Sperre pro Gerät, kaputter Speicher heißt aus", () => {
    const m = new Map();
    const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    expect(lockConfig(st)).toBe(null);
    expect(saveLockConfig({ id: "abc", created: "2026-10-20" }, st)).toBe(true);
    expect(lockConfig(st)).toEqual({ id: "abc", created: "2026-10-20" });
    m.set("studyos-lock-v1", "{kaputt");
    expect(lockConfig(st)).toBe(null);
    saveLockConfig(null, st);
    expect(lockConfig(st)).toBe(null);
    expect(lockConfig({ getItem: () => { throw new Error("gesperrt"); } })).toBe(null);
  });
});
