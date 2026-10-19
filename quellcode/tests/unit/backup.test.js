import { describe, it, expect } from "vitest";
import { backupName, backupsToPrune, decodeBackup, encodeBackup, isoYearWeek, parseBackupName } from "../../src/lib/backup.js";
import { emptyData } from "../../src/lib/data.js";

describe("Cloud-Sicherung", () => {
  it("benennt nach ISO-Kalenderwoche, auch am Jahreswechsel", () => {
    expect(backupName("2026-10-19")).toBe("sicherung-2026-43");
    expect(isoYearWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(backupName("2025-12-29")).toBe("sicherung-2026-01");
    expect(parseBackupName("sicherung-2026-43")).toEqual({ year: 2026, week: 43 });
    expect(parseBackupName("anhang-abc")).toBeNull();
  });
  it("behält die neuesten 8 Wochen, fremde Dateien bleiben unberührt", () => {
    const names = Array.from({ length: 11 }, (_, i) => `sicherung-2026-${String(30 + i).padStart(2, "0")}`).concat(["f-1234567890"]);
    expect(backupsToPrune(names)).toEqual(["sicherung-2026-32", "sicherung-2026-31", "sicherung-2026-30"]);
    expect(backupsToPrune(["sicherung-2026-01"])).toEqual([]);
  });
  it("kodiert und dekodiert einen Datenstand", () => {
    const d = { ...emptyData(), notes: [{ id: "n1", title: "Ä Notiz" }] };
    expect(decodeBackup(encodeBackup(d)).notes).toEqual([{ id: "n1", title: "Ä Notiz" }]);
  });
});
