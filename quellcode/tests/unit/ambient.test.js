import { describe, it, expect } from "vitest";
import { ambientOf, ambientVolumeOf, chipStep, freq, LOOP_BARS, STEPS_PER_BAR } from "../../src/lib/ambient.js";
import { ringBlocks } from "../../src/lib/timer.js";

describe("Musik in der Fokusphase", () => {
  it("Einstellung mit sicheren Vorgaben", () => {
    expect(ambientOf({})).toBe("off");
    expect(ambientOf({ ambient: "chip" })).toBe("chip");
    expect(ambientOf({ ambient: "disco" })).toBe("off");
    expect(ambientVolumeOf({})).toBe(0.5);
    expect(ambientVolumeOf({ ambientVolume: 0 })).toBe(0);
    expect(ambientVolumeOf({ ambientVolume: 3 })).toBe(0.5);
  });
  it("8-Bit-Schleife: a-Moll, Bass auf 1 und 5, Hi-Hat auf den Offbeats, wiederholt sich", () => {
    expect(freq(69)).toBe(440);
    expect(chipStep(0)).toEqual({ lead: 69, bass: 45, hat: false });
    expect(chipStep(1).hat).toBe(true);
    expect(chipStep(4).bass).toBe(45);
    expect(chipStep(2).bass).toBe(null);
    expect(chipStep(8).bass).toBe(41); // zweiter Takt: F
    const loop = STEPS_PER_BAR * LOOP_BARS;
    for (let s = 0; s < loop; s++) expect(chipStep(s + loop)).toEqual(chipStep(s));
    const leads = Array.from({ length: loop }, (_, s) => chipStep(s).lead).filter(Boolean);
    expect(Math.min(...leads)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...leads)).toBeLessThanOrEqual(88);
  });
});

describe("Pixel-Ring", () => {
  it("Blöcke im Uhrzeigersinn ab 12 Uhr, auf gerade Pixel gerundet", () => {
    const b = ringBlocks(40, 84, 100);
    expect(b).toHaveLength(40);
    expect(b[0]).toEqual({ x: 100, y: 16 });
    expect(b[10]).toEqual({ x: 184, y: 100 });
    expect(b[20]).toEqual({ x: 100, y: 184 });
    expect(b.every((p) => p.x % 2 === 0 && p.y % 2 === 0)).toBe(true);
  });
});
