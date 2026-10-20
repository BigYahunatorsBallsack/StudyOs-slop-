import { describe, expect, it } from "vitest";
import { dayStrip, fmtSpan, gapText, liveSession, nextGap, quietDay, resolveFocus, tomorrowPreview } from "../../src/lib/dayview.js";

const base = (x = {}) => ({ sessions: [], blocks: [], exams: [], homework: [], ...x });
const ses = (id, date, start, end, more = {}) => ({ id, moduleId: "ds", type: "Vorlesung", date, start, end, ...more });
const T = "2026-10-20"; // Dienstag

describe("Zeitstrahl", () => {
  it("Termine und Blöcke, Bereich mindestens 8 bis 18 Uhr, laufend und vorbei", () => {
    const d = base({ sessions: [ses("a", T, "10:00", "12:00"), ses("x", T, "13:00", "14:00", { cancelled: true })], blocks: [{ id: "b", date: T, start: "18:00", end: "19:30", title: "Lernen" }] });
    const s = dayStrip(d, T, "11:00");
    expect(s.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect([s.from, s.to]).toEqual([8 * 60, 20 * 60]);
    expect(s.items[0].live).toBe(true);
    expect(s.now).toBe(660);
    expect(dayStrip(base(), T, "11:00")).toBeNull();
  });
  it("nächste freie Lücke", () => {
    const d = base({ sessions: [ses("a", T, "10:00", "12:00"), ses("b", T, "12:15", "13:00"), ses("c", T, "14:30", "16:00")] });
    expect(nextGap(d, T, "08:30")).toMatchObject({ from: "08:30", to: "10:00", minutes: 90, now: true });
    expect(gapText(nextGap(d, T, "08:30"))).toBe("1,5 h frei bis 10:00");
    // während des Termins: die kurze Lücke um 12 zählt nicht, danach 13:00 bis 14:30
    expect(gapText(nextGap(d, T, "11:00"))).toBe("Ab 13:00 1,5 h frei bis 14:30");
    expect(gapText(nextGap(d, T, "15:00"))).toBe("Ab 16:00 frei");
    expect(gapText(nextGap(d, T, "17:00"))).toBe("Heute nichts mehr geplant");
    expect(nextGap(d, T, "22:30")).toBeNull();
  });
  it("Dauer lesbar", () => {
    expect([fmtSpan(45), fmtSpan(60), fmtSpan(90), fmtSpan(80)]).toEqual(["45 min", "1 h", "1,5 h", "1 h 20 min"]);
  });
});

describe("Morgen-Vorschau", () => {
  const d = base({
    sessions: [ses("s2", "2026-10-21", "12:00", "14:00"), ses("s1", "2026-10-21", "08:00", "10:00", { room: "MI HS 1" }), ses("s0", "2026-10-21", "07:00", "08:00", { cancelled: true })],
    homework: [{ id: "h", title: "Blatt 3", due: "2026-10-21", status: "offen" }, { id: "h2", title: "Fertig", due: "2026-10-21", status: "abgegeben" }],
    exams: [{ id: "e", moduleId: "ds", date: "2026-10-21", time: "09:00" }],
  });
  it("erst ab 18 Uhr, erster Termin, offene Abgaben, Prüfungen", () => {
    expect(tomorrowPreview(d, T, "17:59")).toBeNull();
    const p = tomorrowPreview(d, T, "18:00");
    expect(p.first.id).toBe("s1");
    expect(p.homework.map((h) => h.id)).toEqual(["h"]);
    expect(p.exams.map((x) => x.e.id)).toEqual(["e"]);
  });
  it("nichts morgen, keine Vorschau", () => {
    expect(tomorrowPreview(base(), T, "20:00")).toBeNull();
  });
});

describe("ruhige Tage", () => {
  it("Wochenende und Feiertag ohne Termin ruhig, mit Termin nicht; Werktag nie", () => {
    expect(quietDay("2026-10-24", {}, [])).toBe(true); // Samstag
    expect(quietDay("2026-10-24", {}, [ses("a", "2026-10-24", "10:00", "12:00")])).toBe(false);
    expect(quietDay("2026-10-24", {}, [ses("a", "2026-10-24", "10:00", "12:00", { cancelled: true })])).toBe(true);
    expect(quietDay("2026-12-25", {}, [])).toBe(true); // Weihnachten (Freitag)
    expect(quietDay("2027-02-10", { breaks: [{ from: "2027-02-08", to: "2027-04-10" }] }, [])).toBe(true); // vorlesungsfrei, Mittwoch
    expect(quietDay(T, {}, [])).toBe(false);
  });
});

describe("Restzeit und Fokus", () => {
  it("laufender Termin mit Restminuten", () => {
    const list = [ses("a", T, "10:00", "11:30")];
    expect(liveSession(list, T, "10:55")).toMatchObject({ left: 35 });
    expect(liveSession(list, T, "11:30")).toBeNull();
  });
  it("Fokus auflösen und erledigt erkennen", () => {
    const d = base({ homework: [{ id: "h", status: "offen" }], sessions: [ses("s", T, "08:00", "10:00", { reviewed: true })], blocks: [{ id: "b", done: false }] });
    expect(resolveFocus(d, { kind: "homework", id: "h" })).toMatchObject({ kind: "homework", done: false });
    expect(resolveFocus(d, { kind: "session", id: "s" }).done).toBe(true);
    expect(resolveFocus(d, { kind: "block", id: "b" }).done).toBe(false);
    expect(resolveFocus(d, { kind: "block", id: "weg" })).toBeNull();
    expect(resolveFocus(d, null)).toBeNull();
  });
});
