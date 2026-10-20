import { afterEach, describe, expect, it, vi } from "vitest";
import { RECENT_MAX, pushRecent, recentResults } from "../../src/lib/recent.js";
import { hmOf, syncDotState } from "../../src/lib/syncdot.js";
import { PULL_THRESHOLD, pullIntent, pullOffset } from "../../src/lib/pull.js";
import { hourRange, slotAt } from "../../src/lib/gridmove.js";
import { buzz, playSfx } from "../../src/ui/sfx.js";

describe("Zuletzt geöffnet (Strg + K)", () => {
  it("neuester vorne, keine Doppelten, höchstens RECENT_MAX", () => {
    let l = [];
    for (let i = 0; i < 9; i++) l = pushRecent(l, "note", "n" + i);
    l = pushRecent(l, "note", "n5");
    expect(l.length).toBe(RECENT_MAX);
    expect(l[0]).toEqual({ kind: "note", id: "n5" });
    expect(l.filter((x) => x.id === "n5").length).toBe(1);
    expect(pushRecent(l, "module", "n5")[1]).toEqual({ kind: "note", id: "n5" });
  });
  it("kaputte Liste wird ignoriert", () => {
    expect(pushRecent(null, "module", "m1")).toEqual([{ kind: "module", id: "m1" }]);
  });
  it("Treffer in gemerkter Reihenfolge, gelöschte fallen weg", () => {
    const data = { modules: [{ id: "m1", name: "Analysis" }], notes: [{ id: "n1", title: "Integrale", moduleId: "m1" }, { id: "n2", title: "", moduleId: "" }] };
    const r = recentResults(data, [{ kind: "note", id: "weg" }, { kind: "module", id: "m1" }, { kind: "note", id: "n1" }, { kind: "note", id: "n2" }, { kind: "module", id: "alt" }, null]);
    expect(r.map((x) => [x.kind, x.title, x.sub])).toEqual([["module", "Analysis", "Modul"], ["note", "Integrale", "Analysis"], ["note", "Notiz", "Allgemein"]]);
    expect(new Set(r.map((x) => x.key)).size).toBe(3);
  });
});

describe("Sync-Punkt", () => {
  const base = { available: true, phase: "ready", status: "idle", lastSync: new Date(2026, 9, 20, 9, 5).toISOString() };
  it("nur mit eingerichtetem Cloud-Sync", () => {
    expect(syncDotState(null)).toBe(null);
    expect(syncDotState({ ...base, phase: "signed-out" })).toBe(null);
    expect(syncDotState({ ...base, available: false })).toBe(null);
  });
  it("Farbe nach Zustand, Uhrzeit im Text", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 20, 12, 0));
    expect(syncDotState(base)).toEqual({ tone: "ok", label: "Abgeglichen. Zuletzt abgeglichen 09:05" });
    expect(syncDotState({ ...base, status: "syncing" }).tone).toBe("busy");
    expect(syncDotState({ ...base, status: "error" }).tone).toBe("error");
    expect(syncDotState({ ...base, status: "offline" }).tone).toBe("offline");
    expect(syncDotState({ ...base, lastSync: null }).label).toBe("Abgeglichen. Noch nicht abgeglichen");
    /* von gestern: mit Datum */
    expect(syncDotState({ ...base, lastSync: new Date(2026, 9, 19, 23, 30).toISOString() }).label).toContain("19.10.2026 23:30");
    vi.useRealTimers();
  });
  it("hmOf ohne gültige Zeit leer", () => {
    expect(hmOf("")).toBe("");
    expect(hmOf("Quatsch")).toBe("");
  });
});

describe("Nach unten ziehen", () => {
  it("Richtung erst nach ein paar Pixeln, seitlich ist kein Ziehen", () => {
    expect(pullIntent(2, 5)).toBe(null);
    expect(pullIntent(3, 30)).toBe("pull");
    expect(pullIntent(40, 12)).toBe("none"); /* Wischen zwischen den Bereichen */
    expect(pullIntent(0, -20)).toBe("none");
  });
  it("gedämpft und begrenzt; Schwelle braucht einen deutlichen Zug", () => {
    expect(pullOffset(-10)).toBe(0);
    expect(pullOffset(50)).toBeLessThan(PULL_THRESHOLD);
    expect(pullOffset(130)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
    expect(pullOffset(1000)).toBe(110);
  });
});

describe("Wochenraster: Uhrzeiten", () => {
  it("leere Woche 8–18", () => {
    expect(hourRange([])).toEqual({ startH: 8, endH: 18 });
  });
  it("eine Stunde vor dem frühesten Beginn bis zum spätesten Ende", () => {
    expect(hourRange([{ start: "08:15", end: "09:45" }, { start: "14:00", end: "17:30" }])).toEqual({ startH: 7, endH: 18 });
    expect(hourRange([{ start: "06:00", end: "07:00" }, { start: "18:00", end: "21:00" }])).toEqual({ startH: 5, endH: 21 });
  });
  it("mindestens 8 Stunden, nicht über Mitternacht hinaus", () => {
    expect(hourRange([{ start: "10:00", end: "12:00" }])).toEqual({ startH: 9, endH: 17 });
    expect(hourRange([{ start: "21:00", end: "23:59" }])).toEqual({ startH: 16, endH: 24 });
    expect(hourRange([{ start: "00:30", end: "01:00" }])).toEqual({ startH: 0, endH: 8 });
  });
  it("Tipp auf eine freie Stelle passt zum verschobenen Beginn", () => {
    const { startH } = hourRange([{ start: "10:00", end: "12:00" }]);
    /* 46 px je Stunde: 1,5 Stunden unter dem oberen Rand */
    expect(slotAt(startH * 60 + ((69) / 46) * 60)).toBe(10 * 60 + 30);
  });
});

describe("Vibration beim Abhaken", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const stub = (stored) => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("localStorage", { getItem: () => stored, setItem: () => {} });
    return vibrate;
  };
  it("Voreinstellung an: kurz vibrieren, auch beim Münzklang", () => {
    const v = stub(null);
    buzz();
    playSfx("coin");
    expect(v).toHaveBeenCalledTimes(2);
    expect(v).toHaveBeenCalledWith(15);
  });
  it("ausgeschaltet oder ohne vibrate: nichts", () => {
    const v = stub("aus");
    buzz(); playSfx("coin");
    expect(v).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", {});
    expect(() => buzz()).not.toThrow();
  });
  it("Fanfare und Vorschau vibrieren nicht", () => {
    const v = stub(null);
    playSfx("fanfare"); playSfx("coin", true);
    expect(v).not.toHaveBeenCalled();
  });
});
