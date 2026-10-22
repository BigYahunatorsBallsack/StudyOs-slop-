import { describe, it, expect, vi } from "vitest";
import { commuteOf, recommend, typesFor } from "../../src/lib/transit.js";
import { loadTransit } from "../../src/lib/wegcache.js";

describe("Weg zur Uni: nur die nötigen Verkehrsmittel abfragen", () => {
  it("Bus 230 nur Busse, S6 nur S-Bahn, sonst alles", () => {
    expect(typesFor("230")).toBe("BUS,REGIONAL_BUS");
    expect(typesFor("S6")).toBe("SBAHN");
    expect(typesFor("U6")).toBe("UBAHN");
    expect(typesFor("")).toBe("BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM,BAHN");
  });

  it("die Abfrage zur Vorlesung reicht bis zum spätesten passenden Bus (vorher: 60 Abfahrten aller Linien in Haar = gut eine halbe Stunde)", async () => {
    const c = commuteOf({ commute: { mode: "transit" } });
    const now = new Date(2026, 9, 22, 18, 45);
    const day = "2026-10-23";
    const session = { id: "s", date: day, start: "10:00" };
    const asked = [];
    const t = (h, m) => new Date(2026, 9, 23, h, m).getTime();
    const cloud = {
      mvgMany: async (list) => list.map((b) => {
        asked.push(b);
        /* Bus 230 alle 20 Minuten ab 8:04 */
        if (b.station === c.station.id) return [4, 24, 44, 64, 84].map((m) => ({ line: "230", destination: "Garching, Forschungszentrum", type: "REGIONAL_BUS", time: t(8, m), planned: t(8, m), delay: 0, cancelled: false }));
        return [2, 22, 42, 62].map((m) => ({ line: "S6", destination: "Leuchtenbergring", type: "SBAHN", time: t(8, m), planned: t(8, m), delay: 0, cancelled: false }));
      }),
    };
    vi.useFakeTimers({ now });
    try {
      const raw = await loadTransit(cloud, c, session);
      expect(asked.filter((b) => b.station === c.station.id).every((b) => b.types === "BUS,REGIONAL_BUS")).toBe(true);
      expect(asked.filter((b) => b.station === c.feeder.station.id).every((b) => b.types === "SBAHN")).toBe(true);
      /* 10:00 − 10 Puffer − 50 Fahrt: Bus spätestens 9:00 → der um 8:44 (an 9:34), S6 um 8:22 */
      const p = recommend(raw.mainLater, session, c, raw.feederLater);
      expect(new Date(p.dep.time).getMinutes()).toBe(44);
      expect(new Date(p.feederDep.time).getMinutes()).toBe(22);
    } finally { vi.useRealTimers(); }
  });
});
