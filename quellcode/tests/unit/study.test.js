import { describe, it, expect } from "vitest";
import { nextTitle, buildHomeworkSeries, bonusForecast, workload, withoutArchived } from "../../src/lib/study.js";
import { cardsFromNote } from "../../src/lib/cards.js";
import { emptyData } from "../../src/lib/data.js";

describe("Übungsblatt-Serie", () => {
  it("zählt Titel hoch", () => {
    expect(nextTitle("Blatt 4")).toBe("Blatt 5");
    expect(nextTitle("Übungsblatt 04", 7)).toBe("Übungsblatt 11");
    expect(nextTitle("Hausaufgabe", 2)).toBe("Hausaufgabe 3");
    expect(nextTitle("Blatt 2 (WS 2026)")).toBe("Blatt 3 (WS 2026)");
    expect(nextTitle("WS26 Sheet #7")).toBe("WS26 Sheet #8");
  });
  it("legt wöchentliche Blätter bis zum Enddatum an", () => {
    const s = buildHomeworkSeries({ moduleId: "ds", title: "Blatt 1", issued: "2026-10-21", due: "2026-10-28", status: "ausgegeben", maxPoints: 20 }, "2026-11-11");
    expect(s.map((h) => [h.title, h.issued, h.due])).toEqual([["Blatt 1", "2026-10-21", "2026-10-28"], ["Blatt 2", "2026-10-28", "2026-11-04"], ["Blatt 3", "2026-11-04", "2026-11-11"], ["Blatt 4", "2026-11-11", "2026-11-18"]]);
    expect(new Set(s.map((h) => h.seriesId)).size).toBe(1);
    expect(s.every((h) => h.maxPoints === 20)).toBe(true);
  });
});

describe("Notenbonus", () => {
  const data = (hw, bonusPct = 50) => ({ ...emptyData(), modules: [{ id: "m", bonusPct }], homework: hw.map((h, i) => ({ id: "h" + i, moduleId: "m", ...h })) });
  it("berechnet benötigte Punkte pro offenem Blatt", () => {
    const f = bonusForecast(data([{ status: "bewertet", points: 8, maxPoints: 20 }, { status: "bewertet", points: 12, maxPoints: 20 }, { status: "ausgegeben", maxPoints: 20 }, { status: "ausgegeben" }]), "m");
    expect(f).toMatchObject({ maxTotal: 80, pts: 20, need: 20, remaining: 2, perSheet: 10, currentPct: 0.5, needPct: 0.5, state: "ok" });
  });
  it("Zustände", () => {
    expect(bonusForecast(data([{ status: "bewertet", points: 20, maxPoints: 20 }, { status: "ausgegeben", maxPoints: 20 }]), "m").state).toBe("reached");
    expect(bonusForecast(data([{ status: "bewertet", points: 2, maxPoints: 20 }, { status: "ausgegeben", maxPoints: 20 }], 60), "m").state).toBe("impossible");
    expect(bonusForecast(data([{ status: "bewertet", points: 8, maxPoints: 20 }, { status: "ausgegeben", maxPoints: 20 }, { status: "ausgegeben", maxPoints: 20 }]), "m").state).toBe("tight");
    expect(bonusForecast(data([{ status: "ausgegeben" }]), "m").state).toBe("open");
    expect(bonusForecast(data([], 0), "m")).toBeNull();
  });
});

describe("Workload", () => {
  const d = (extra = {}) => ({ ...emptyData(), settings: { ...emptyData().settings, semesterWeeks: 15 },
    modules: [{ id: "m", ects: 5, status: "belegt" }],
    sessions: [{ id: "s1", moduleId: "m", date: "2026-10-12", start: "10:00", end: "12:00", attended: true }, { id: "s2", moduleId: "m", date: "2026-10-19", start: "10:00", end: "12:00" }],
    logs: [{ id: "l", moduleId: "m", date: "2026-10-15", minutes: 180 }], ...extra });
  it("Soll ab dem ersten Termin, Ist aus Lernzeit und besuchten Terminen", () => {
    const w = workload(d(), "m", "2026-10-25"); // 14 Tage = 2 Wochen
    expect(w.totalH).toBe(150);
    expect(w.sollH).toBeCloseTo(20, 5);
    expect(w.istH).toBeCloseTo(5, 5);
    expect(w.perWeekH).toBe(10);
    expect(w.state).toBe("low");
  });
  it("nur für belegte Module mit begonnenem Semester", () => {
    expect(workload(d(), "m", "2026-10-01")).toBeNull();
    expect(workload({ ...d(), modules: [{ id: "m", ects: 5, status: "bestanden" }] }, "m", "2026-10-25")).toBeNull();
  });
});

describe("Archiv", () => {
  it("blendet archivierte Module samt Einträgen aus", () => {
    const d = { ...emptyData(), modules: [{ id: "a", archived: true }, { id: "b" }], sessions: [{ id: "1", moduleId: "a" }, { id: "2", moduleId: "b" }], homework: [{ id: "h", moduleId: "a" }] };
    const r = withoutArchived(d);
    expect(r.modules.map((m) => m.id)).toEqual(["b"]);
    expect(r.sessions.map((s) => s.id)).toEqual(["2"]);
    expect(r.homework).toEqual([]);
    expect(withoutArchived(emptyData())).toEqual(emptyData());
  });
});

describe("Karten aus Notizen", () => {
  it("erkennt Frage :: Antwort und Lückentexte, überspringt Code und Duplikate", () => {
    const text = "# VL 4\n- Was ist ein Graph? :: G = (V, E)\n1. Grad eines Knotens :: Anzahl inzidenter Kanten\nNormale Zeile\nEin Baum ist ein {{c1::zusammenhängender}} kreisfreier Graph.\n```\na :: b\n```\nWas ist ein Graph? :: doppelt\n- Kaputt ::\n";
    expect(cardsFromNote(text, ["grad eines knotens"])).toEqual([
      { front: "Was ist ein Graph?", back: "G = (V, E)" },
      { front: "Ein Baum ist ein {{c1::zusammenhängender}} kreisfreier Graph.", back: "" },
    ]);
  });
});
