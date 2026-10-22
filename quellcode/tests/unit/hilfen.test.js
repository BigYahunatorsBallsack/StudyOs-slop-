import { describe, expect, it } from "vitest";
import { clockOf, localMs, nowHM, pad2 } from "../../src/lib/util.js";
import { toHM, toMin } from "../../src/lib/blocks.js";

/* Zusammengeführte Hilfen (vorher je Datei eigene Kopien in ics, push, syncdot, overview, transit, weather, quickadd, sheet, files, tum) */
describe("gemeinsame Zeit-Hilfen", () => {
  it("pad2 und clockOf", () => {
    expect(pad2(7)).toBe("07");
    expect(pad2("12")).toBe("12");
    expect(clockOf(new Date(2026, 9, 25, 2, 5))).toBe("02:05");
    expect(nowHM()).toMatch(/^\d{2}:\d{2}$/);
  });
  it("localMs rechnet in Ortszeit, auch am Tag der Zeitumstellung", () => {
    expect(localMs("2026-10-25", "08:30")).toBe(new Date(2026, 9, 25, 8, 30).getTime());
    /* 25.10.: 25-Stunden-Tag, 00:00 bis 08:30 sind 9,5 Stunden */
    expect(localMs("2026-10-25", "08:30") - localMs("2026-10-25", "00:00")).toBe(9.5 * 3600000);
  });
  it("toMin ist robust gegen fehlende oder kaputte Uhrzeiten", () => {
    expect(toMin("08:15")).toBe(495);
    expect(toMin("")).toBe(0);
    expect(toMin(undefined)).toBe(0);
    expect(toMin("x:30")).toBe(30);
    expect(toHM(toMin("23:59"))).toBe("23:59");
  });
});
