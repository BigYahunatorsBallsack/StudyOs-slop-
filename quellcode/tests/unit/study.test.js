import { describe, it, expect } from "vitest";
import { nextTitle, buildHomeworkSeries, bonusForecast, workload, workloadOverview, studyDiary, watchLog, toggleAttended, sessionCoverage, withoutArchived } from "../../src/lib/study.js";
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
  it("Rückstand, Bedarf pro Woche bis Semesterende und Vorschlag fürs Wochenziel", () => {
    const w = workload(d(), "m", "2026-10-25");
    expect(w.gapH).toBeCloseTo(15, 5);
    expect(w.leftWeeks).toBeCloseTo(13, 5);
    expect(w.needPerWeekH).toBeCloseTo(145 / 13, 5);
    expect(w.goalSuggestH).toBe(10); // 11,15 h minus 1 h Termine pro Woche, auf halbe Stunden
    const end = workload(d(), "m", "2027-03-01");
    expect(end.needPerWeekH).toBeNull();
    expect(end.goalSuggestH).toBeNull();
  });
  it("Vergleich aller Module: am weitesten zurück zuerst, ohne Archiv und ohne ECTS", () => {
    const data = d({ modules: [{ id: "m", name: "A", ects: 5, status: "belegt" }, { id: "n", name: "B", ects: 5, status: "belegt", semesterStart: "2026-10-12" }, { id: "x", ects: 5, status: "belegt", archived: true, semesterStart: "2026-10-12" }, { id: "y", status: "belegt", semesterStart: "2026-10-12" }] });
    expect(workloadOverview(data, "2026-10-25").map((x) => x.m.id)).toEqual(["n", "m"]);
  });
  it("nur für belegte Module mit begonnenem Semester", () => {
    expect(workload(d(), "m", "2026-10-01")).toBeNull();
    expect(workload({ ...d(), modules: [{ id: "m", ects: 5, status: "bestanden" }] }, "m", "2026-10-25")).toBeNull();
  });
});

describe("Lerntagebuch", () => {
  it("gruppiert die Einheiten eines Moduls nach Tag, neueste zuerst", () => {
    const logs = [
      { id: "a", moduleId: "m", date: "2026-10-12", minutes: 25, at: "09:00", note: "Blatt 1" },
      { id: "b", moduleId: "m", date: "2026-10-14", minutes: 25, at: "09:00" },
      { id: "c", moduleId: "m", date: "2026-10-14", minutes: 50, at: "14:30", note: "Kapitel 2" },
      { id: "d", moduleId: "z", date: "2026-10-14", minutes: 90 },
    ];
    const days = studyDiary(logs, "m");
    expect(days.map((x) => [x.date, x.minutes, x.logs.map((l) => l.id)])).toEqual([["2026-10-14", 75, ["c", "b"]], ["2026-10-12", 25, ["a"]]]);
  });
});

describe("Aufzeichnung als Lernzeit", () => {
  const s = { id: "s", moduleId: "m", type: "Vorlesung", date: "2026-10-13", watchedTo: "47:12" };
  it("zählt nur neu angeschaute Minuten, nie doppelt", () => {
    const first = watchLog([], s, "2026-10-14");
    expect(first).toMatchObject({ moduleId: "m", sessionId: "s", kind: "Aufzeichnung", minutes: 47, date: "2026-10-14" });
    expect(first.note).toContain("bis 47:12");
    expect(watchLog([first], s)).toBeNull();
    expect(watchLog([first], { ...s, watchedTo: "30" })).toBeNull();
    expect(watchLog([first], { ...s, watchedTo: "1:20:00" }).minutes).toBe(33);
  });
  it("ohne Stand oder Modul nichts", () => {
    expect(watchLog([], { ...s, watchedTo: "" })).toBeNull();
    expect(watchLog([], { ...s, moduleId: "" })).toBeNull();
    expect(watchLog([], { ...s, watchedTo: "abc" })).toBeNull();
  });
});

describe("Besucht als Lernzeit", () => {
  const base = () => ({ ...emptyData(), modules: [{ id: "m", ects: 5, status: "belegt" }], sessions: [{ id: "s", moduleId: "m", type: "Vorlesung", date: "2026-10-13", start: "10:15", end: "11:45", attended: false }] });
  it("legt beim Abhaken eine Einheit am Termintag an und entfernt sie beim Zurücknehmen", () => {
    const on = toggleAttended(base(), "s");
    expect(on.sessions[0].attended).toBe(true);
    expect(on.logs).toMatchObject([{ moduleId: "m", sessionId: "s", kind: "Besucht", date: "2026-10-13", minutes: 90, at: "10:15" }]);
    const off = toggleAttended(on, "s");
    expect(off.sessions[0].attended).toBe(false);
    expect(off.logs).toEqual([]);
  });
  it("zählt im ECTS-Soll nicht doppelt", () => {
    const w = workload(toggleAttended(base(), "s"), "m", "2026-10-20");
    expect(w.istH).toBeCloseTo(1.5, 5);
    expect(w.selfH).toBe(0);
  });
  it("Anteil: besucht 100 %, sonst angeschaut", () => {
    const s = base().sessions[0];
    expect(sessionCoverage({ ...s, attended: true })).toEqual({ ratio: 1, label: "besucht" });
    expect(sessionCoverage({ ...s, watchedTo: "45" })).toEqual({ ratio: 0.5, label: "50 % angeschaut" });
    expect(sessionCoverage(s)).toBeNull();
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
