import { describe, expect, it } from "vitest";
import { TODAY_BLOCKS, isDefaultLayout, moveBlock, todayLayout } from "../../src/lib/todayLayout.js";

const ids = (l) => l.map((b) => b.id);

describe("Heute anpassen", () => {
  it("ohne Einstellung: Standardreihenfolge, nichts ausgeblendet", () => {
    const l = todayLayout({});
    expect(ids(l)).toEqual(TODAY_BLOCKS.map(([id]) => id));
    expect(l.some((b) => b.hidden)).toBe(false);
    expect(isDefaultLayout({})).toBe(true);
  });
  it("gespeicherte Reihenfolge, Ausgeblendete markiert", () => {
    const l = todayLayout({ todayOrder: ["mensa", "next"], todayHidden: ["week"] });
    expect(ids(l).slice(0, 2)).toEqual(["mensa", "next"]);
    expect(l.find((b) => b.id === "week").hidden).toBe(true);
    expect(isDefaultLayout({ todayHidden: ["week"] })).toBe(false);
  });
  it("unbekannte und doppelte fallen weg, fehlende kommen an ihre Standardstelle", () => {
    const l = todayLayout({ todayOrder: ["todo", "alt", "todo", "next", "plan"] });
    const o = ids(l);
    expect(o).not.toContain("alt");
    expect(o.filter((x) => x === "todo")).toHaveLength(1);
    expect(o).toHaveLength(TODAY_BLOCKS.length);
    expect(o.indexOf("changes")).toBe(o.indexOf("next") + 1); // hinter dem Vorgänger aus der Standardreihenfolge
  });
  it("verschieben", () => {
    const l = todayLayout({});
    expect(moveBlock(l, l.length - 1, 0).slice(0, 2)).toEqual(["mensa", "next"]);
    expect(moveBlock(l, 0, 1).slice(0, 2)).toEqual(["changes", "next"]);
    expect(moveBlock(l, 0, 99)).toEqual(ids(l));
  });
});
