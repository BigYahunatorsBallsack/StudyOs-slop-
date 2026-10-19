/* Bild-Karteikarten mit Verdecken: Rechtecke, Karten pro Rechteck, Lernstand beim Bearbeiten, Sync */
import { describe, expect, it } from "vitest";
import { emptyData } from "../../src/lib/data.js";
import { deckFrom } from "../../src/lib/share.js";
import { applyOcclusion, bigEnough, boxFrom, fitSize, isOcc, markUploaded, nudge, occGroup, occLabel, sortBoxes } from "../../src/lib/occlusion.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";

const img = { id: "img1", type: "image/png", size: 1000, w: 800, h: 600, cloud: false };
const box = (id, x, y, w = 0.1, h = 0.1) => ({ id, x, y, w, h });
let n = 0;
const makeId = () => `c${++n}`;
const base = { img, mode: "all", front: "OSI-Modell", tags: "netze", moduleId: "m1" };

describe("Rechtecke", () => {
  it("normalisiert Eckpunkte in jeder Richtung und begrenzt sie auf das Bild", () => {
    expect(boxFrom(0.5, 0.6, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 });
    expect(boxFrom(-0.2, 0.9, 0.3, 1.4)).toEqual({ x: 0, y: 0.9, w: 0.3, h: 0.1 });
  });
  it("winzige Rechtecke gelten als Antippen", () => {
    expect(bigEnough(boxFrom(0.1, 0.1, 0.105, 0.3))).toBe(false);
    expect(bigEnough(boxFrom(0.1, 0.1, 0.2, 0.3))).toBe(true);
  });
  it("verschieben und vergrößern bleiben im Bild", () => {
    expect(nudge(box("a", 0.85, 0.5), 0.2, 0)).toMatchObject({ x: 0.9 });
    expect(nudge(box("a", 0.05, 0.05), -0.2, -0.2)).toMatchObject({ x: 0, y: 0 });
    expect(nudge(box("a", 0.8, 0.8), 0.5, 0.5, true)).toMatchObject({ w: 0.2, h: 0.2 });
    expect(nudge(box("a", 0.5, 0.5), -0.5, -0.5, true)).toMatchObject({ w: 0.02, h: 0.02 });
  });
  it("nummeriert zeilenweise von oben links", () => {
    const s = sortBoxes([box("unten", 0.1, 0.7), box("rechts", 0.6, 0.12), box("links", 0.1, 0.1)]);
    expect(s.map((b) => b.id)).toEqual(["links", "rechts", "unten"]);
  });
  it("verkleinert große Bilder auf höchstens 2000 px", () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 2000, h: 1500 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});

describe("Karten aus einem Bild", () => {
  it("legt pro Rechteck eine fällige Karte an, alle mit demselben Bild", () => {
    const cards = applyOcclusion([{ id: "x", front: "andere" }], { ...base, boxes: [box("b", 0.5, 0.1), box("a", 0.1, 0.1)] }, "2026-10-19", makeId);
    const g = occGroup(cards, "img1");
    expect(cards).toHaveLength(3);
    expect(g.map((c) => c.occ.target)).toEqual(["a", "b"]);
    expect(g.every((c) => c.due === "2026-10-19" && c.reps === 0 && c.front === "OSI-Modell" && c.occ.boxes.length === 2)).toBe(true);
    expect(occLabel(g[1])).toBe("OSI-Modell · Bereich 2 von 2");
    expect(isOcc(cards[0])).toBe(false);
  });
  it("Bearbeiten behält Id und Lernstand der bleibenden Rechtecke, entfernt gelöschte, legt neue an", () => {
    let cards = applyOcclusion([], { ...base, boxes: [box("a", 0.1, 0.1), box("b", 0.5, 0.1)] }, "2026-10-01", makeId);
    const a = cards.find((c) => c.occ.target === "a");
    cards = cards.map((c) => (c.id === a.id ? { ...c, stability: 12, due: "2026-11-01", reps: 3 } : c));
    cards.push({ id: "danach", front: "Text" });
    const next = applyOcclusion(cards, { ...base, front: "Neu", mode: "one", boxes: [box("a", 0.12, 0.1), box("c", 0.1, 0.6)] }, "2026-10-19", makeId);
    const g = occGroup(next, "img1");
    expect(g).toHaveLength(2);
    const a2 = g.find((c) => c.occ.target === "a");
    expect(a2).toMatchObject({ id: a.id, stability: 12, due: "2026-11-01", reps: 3, front: "Neu" });
    expect(a2.occ).toMatchObject({ mode: "one", boxes: [{ id: "a", x: 0.12 }, { id: "c" }] });
    expect(g.find((c) => c.occ.target === "c")).toMatchObject({ due: "2026-10-19", reps: 0 });
    expect(g.some((c) => c.occ.target === "b")).toBe(false);
    expect(next[next.length - 1].id).toBe("danach");
  });
  it("leere Frage wird „Bild-Karte“", () => {
    const [c] = applyOcclusion([], { ...base, front: "  ", boxes: [box("a", 0, 0)] }, "2026-10-19", makeId);
    expect(c.front).toBe("Bild-Karte");
  });
  it("markUploaded setzt cloud an allen Karten des Bildes", () => {
    const cards = applyOcclusion([{ id: "x", front: "t" }], { ...base, boxes: [box("a", 0, 0), box("b", 0.5, 0)] }, "2026-10-19", makeId);
    const up = markUploaded(cards, "img1");
    expect(occGroup(up, "img1").every((c) => c.occ.img.cloud)).toBe(true);
    expect(up[0]).toBe(cards[0]);
  });
  it("geteilte Stapel enthalten keine Bild-Karten (das Bild ginge nicht mit)", () => {
    const cards = applyOcclusion([{ id: "x", front: "Frage", back: "Antwort" }], { ...base, boxes: [box("a", 0, 0)] }, "2026-10-19", makeId);
    expect(deckFrom(cards, "Netze").cards).toEqual([{ front: "Frage", back: "Antwort", tags: "" }]);
  });
});

describe("Sync", () => {
  it("Rechtecke auf Gerät A und Lernstand auf Gerät B werden beide übernommen", () => {
    const start = stampChanges(emptyData(), { ...emptyData(), cards: applyOcclusion([], { ...base, boxes: [box("a", 0.1, 0.1)] }, "2026-10-01", makeId) }, "2026-10-01T10:00:00.000Z");
    const id = start.cards[0].id;
    const onA = stampChanges(start, { ...start, cards: applyOcclusion(start.cards, { ...base, boxes: [box("a", 0.3, 0.3)] }, "2026-10-02", makeId) }, "2026-10-02T10:00:00.000Z");
    const onB = stampChanges(start, { ...start, cards: start.cards.map((c) => ({ ...c, stability: 5, reps: 1, due: "2026-10-07", lastReview: "2026-10-02" })) }, "2026-10-02T11:00:00.000Z");
    const merged = mergeData(onA, onB, "2026-10-02T12:00:00.000Z").data.cards.find((c) => c.id === id);
    expect(merged.occ.boxes[0].x).toBe(0.3);
    expect(merged).toMatchObject({ stability: 5, reps: 1, due: "2026-10-07" });
  });
});
