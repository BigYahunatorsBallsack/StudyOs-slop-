/* Timer auf mehreren Geräten (settings.liveTimer), Lernzeit-Kalender, Modulfarben und gemerkte Ansicht */
import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/lib/cloudsync.js";
import { emptyData } from "../../src/lib/data.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { focusLogId, fromLive, liveKey, remainingOf, toLive } from "../../src/lib/timer.js";
import { semesterCalendar, semesterOf } from "../../src/lib/stats.js";
import { pickColor } from "../../src/lib/colors.js";
import { readView, saveView } from "../../src/lib/view.js";
import { PALETTE } from "../../src/lib/constants.js";

const T = (h, m = 0) => `2026-10-17T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const base = { mode: "focus", length: 25, brk: 5, running: false, endAt: 0, remaining: 1500, moduleId: "", topicId: "" };
const setLive = (d, live, at) => stampChanges(d, { ...d, settings: { ...d.settings, liveTimer: live } }, at);

describe("Timer geräteübergreifend", () => {
  it("überträgt die Restzeit unabhängig von der Geräteuhr", () => {
    const server = Date.parse(T(10));
    /* PC geht richtig, das Handy 90 s vor: Versatz zur Serverzeit 0 bzw. −90 s */
    const pc = { ...base, running: true, endAt: server + 20 * 60000, runId: "r1", moduleId: "m1", kind: "Nacharbeiten" };
    const live = toLive(pc, 0);
    expect(live).toMatchObject({ id: "r1", running: true, endAt: server + 20 * 60000, moduleId: "m1" });
    const phone = fromLive(live, base, -90000, server + 90000);
    expect(phone).toMatchObject({ running: true, runId: "r1", moduleId: "m1", mode: "focus" });
    expect(remainingOf(phone, server + 90000)).toBe(remainingOf(pc, server));
  });

  it("übernimmt Pausen mit Restzeit und verwirft sehr alte laufende Stände", () => {
    const paused = toLive({ ...base, mode: "break", remaining: 123, runId: "r2" });
    expect(fromLive(paused, base)).toMatchObject({ running: false, mode: "break", remaining: 123, runId: "r2" });
    const stale = { id: "r3", running: true, endAt: Date.parse(T(0)), mode: "focus", length: 25 };
    expect(fromLive(stale, base, 0, Date.parse(T(0)) + 13 * 3600 * 1000)).toMatchObject({ running: false, remaining: 1500 });
  });

  it("ein übernommener Stand ergibt wieder denselben Eintrag (kein Hin und Her)", () => {
    const live = { id: "r4", running: true, endAt: 1_800_000_000_000, mode: "focus", length: 50, brk: 10, moduleId: "m2", note: "Blatt 3" };
    expect(liveKey(toLive(fromLive(live, base, 5000, 1_799_999_000_000), 5000))).toBe(liveKey(live));
  });

  it("die jüngere Änderung gewinnt, auch wenn das spätere Gerät eine nachgehende Uhr hat", () => {
    const start = emptyData();
    /* PC startet um 10:00 */
    const pc = setLive(start, { id: "r5", running: true, endAt: 1, mode: "focus" }, T(10));
    /* Handy holt den Stand und pausiert, seine Uhr steht aber noch auf 9:50 */
    const phoneBase = mergeData(start, pc, T(10)).data;
    const phone = setLive(phoneBase, { id: "r5", running: false, remaining: 600, mode: "focus" }, T(9, 50));
    for (const merged of [mergeData(pc, phone, T(10, 1)).data, mergeData(phone, pc, T(10, 1)).data]) {
      expect(merged.settings.liveTimer).toMatchObject({ running: false, remaining: 600 });
    }
    expect(fingerprint(mergeData(pc, phone).data)).toBe(fingerprint(mergeData(phone, pc).data));
  });

  it("trägt eine Fokusphase nur einmal ein, wenn beide Geräte sie beenden", () => {
    const id = focusLogId("r6");
    expect(id).toBe("fokusr6");
    expect(focusLogId("")).toBe("");
    const a = stampChanges(emptyData(), { ...emptyData(), logs: [{ id, date: "2026-10-17", minutes: 25, moduleId: "m1" }] }, T(10));
    const b = stampChanges(emptyData(), { ...emptyData(), logs: [{ id, date: "2026-10-17", minutes: 25, moduleId: "m1", at: "09:35" }] }, T(10, 0));
    const merged = mergeData(a, b, T(11)).data;
    expect(merged.logs).toHaveLength(1);
    expect(merged.logs[0]).toMatchObject({ id, minutes: 25 });
  });
});

describe("Lernzeit-Kalender", () => {
  it("findet Winter- und Sommersemester und blättert", () => {
    expect(semesterOf("2026-10-20")).toMatchObject({ from: "2026-10-01", to: "2027-03-31", short: "WiSe 2026/27" });
    expect(semesterOf("2027-02-10")).toMatchObject({ from: "2026-10-01" });
    expect(semesterOf("2026-05-03")).toMatchObject({ from: "2026-04-01", to: "2026-09-30", label: "Sommersemester 2026" });
    expect(semesterOf("2026-10-20", -1)).toMatchObject({ from: "2026-04-01" });
    expect(semesterOf("2026-05-03", -1)).toMatchObject({ from: "2025-10-01", short: "WiSe 2025/26" });
  });
  it("summiert je Tag und Modul, Spalten sind Wochen", () => {
    const sem = semesterOf("2026-10-20");
    const logs = [
      { date: "2026-10-14", minutes: 30, moduleId: "a" }, { date: "2026-10-14", minutes: 50, moduleId: "b" }, { date: "2026-10-14", minutes: 20, moduleId: "a" },
      { date: "2026-09-30", minutes: 99, moduleId: "a" },
    ];
    const g = semesterCalendar(logs, sem, "2026-10-20");
    expect(g[0][0].date).toBe("2026-09-28"); /* Montag vor Semesterbeginn */
    expect(g[0][2].outside).toBe(true);
    expect(g[0][3]).toMatchObject({ date: "2026-10-01", minutes: 0 });
    expect(g.every((col) => col.length === 7)).toBe(true);
    const day = g.flat().find((c) => c.date === "2026-10-14");
    expect(day).toMatchObject({ minutes: 100, level: 3, modules: [{ moduleId: "a", minutes: 50 }, { moduleId: "b", minutes: 50 }] });
    expect(g.flat().find((c) => c.date === "2026-10-21").future).toBe(true);
    expect(g[g.length - 1].some((c) => c.date === "2027-03-31")).toBe(true);
  });
});

describe("Modulfarben", () => {
  it("nimmt die Farbe, die sich am stärksten von den aktiven Modulen abhebt", () => {
    const mods = [{ color: "#38bdf8", status: "belegt" }, { color: "#60a5fa", status: "belegt" }, { color: "#2dd4bf", status: "belegt" }];
    const c = pickColor(mods);
    expect(["#38bdf8", "#60a5fa", "#2dd4bf", "#34d399"]).not.toContain(c);
    /* archivierte und abgeschlossene Module zählen nicht */
    const old = [{ color: PALETTE[0], status: "bestanden" }, { color: PALETTE[1], archived: true, status: "belegt" }];
    expect(pickColor([...old, { color: "#fb7185", status: "belegt" }])).not.toBe("#fb7185");
    expect(pickColor([])).toBe(PALETTE[0]);
    /* im selben Zug angelegte zählen mit */
    expect(pickColor([], [{ color: PALETTE[0], status: "bestanden" }])).not.toBe(PALETTE[0]);
  });
  it("verteilt nacheinander angelegte Module ohne Wiederholung", () => {
    const mods = [];
    for (let i = 0; i < PALETTE.length; i++) mods.push({ color: pickColor(mods), status: "belegt" });
    expect(new Set(mods.map((m) => m.color)).size).toBe(PALETTE.length);
  });
});

describe("Ansicht merken", () => {
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  it("merkt Bereich und Unterreiter und verwirft Unbekanntes", () => {
    const s = store();
    expect(readView(s)).toEqual({});
    saveView({ tab: "module", moduleId: "abc123", learn: "karten" }, s);
    saveView({ moduleSub: "themen" }, s);
    expect(readView(s)).toEqual({ tab: "module", moduleId: "abc123", learn: "karten", moduleSub: "themen" });
    saveView({ moduleId: null, tab: "kaputt" }, s);
    expect(readView(s)).toEqual({ learn: "karten", moduleSub: "themen" });
    const broken = { getItem: () => { throw new Error("gesperrt"); }, setItem: () => { throw new Error("gesperrt"); } };
    expect(readView(broken)).toEqual({});
    expect(() => saveView({ tab: "heute" }, broken)).not.toThrow();
  });
});
