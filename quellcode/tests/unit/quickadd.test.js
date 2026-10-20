import { describe, it, expect } from "vitest";
import { applySuggestion, dateSpan, moduleSuggestions, parseQuick, quickToEntity, quickMissing } from "../../src/lib/quickadd.js";

const T = "2026-10-21"; /* ein Mittwoch */
const M = [
  { id: "ana", name: "Analysis für Informatik", code: "MA0902" },
  { id: "ds", name: "Diskrete Strukturen" },
  { id: "eidi", name: "Einführung in die Informatik" },
  { id: "la", name: "Lineare Algebra (Beispiel)" },
];
const q = (s) => parseQuick(s, M, T);

describe("Schnelleingabe", () => {
  it("Hausaufgabe mit Modul und Wochentag", () => {
    expect(q("Blatt 4 Analysis Fr")).toMatchObject({ kind: "homework", kindGuessed: false, title: "Blatt 4", date: "2026-10-23" });
    expect(q("Blatt 4 Analysis Fr").module.id).toBe("ana");
  });
  it("gleicher Wochentag bedeutet nächste Woche, 'heute' bleibt heute", () => {
    expect(q("Abgabe DS mi").date).toBe("2026-10-28");
    expect(q("Abgabe DS heute").date).toBe(T);
    expect(q("Abgabe DS morgen").date).toBe("2026-10-22");
  });
  it("erkennt Initialen und Modulnummer", () => {
    expect(q("Blatt 2 DS 30.10.").module.id).toBe("ds");
    expect(q("Blatt 2 EIDI 30.10.").module.id).toBe("eidi");
    expect(q("Blatt 2 MA0902 30.10.").module.id).toBe("ana");
    expect(q("Blatt 2 lineare algebra 30.10.").module.id).toBe("la");
  });
  it("Datumsformate", () => {
    expect(q("Klausur DS 12.02.2027 10:30")).toMatchObject({ kind: "exam", date: "2027-02-12", start: "10:30" });
    expect(q("Abgabe DS 1.10.").date).toBe("2027-10-01"); // liegt dieses Jahr schon zurück
    expect(q("Blatt 2 DS 30.10.").date).toBe("2026-10-30");
    expect(q("Abgabe DS in 3 Tagen").date).toBe("2026-10-24");
    expect(q("Abgabe DS nächsten Montag").date).toBe("2026-11-02");
    expect(q("Abgabe DS 2026-11-05").date).toBe("2026-11-05");
  });
  it("Termin mit Zeitspanne und Art", () => {
    const r = q("Übung DS Do 14-16 MI HS 1");
    expect(r).toMatchObject({ kind: "session", sessionType: "Übung", date: "2026-10-22", start: "14:00", end: "16:00", title: "MI HS 1" });
    expect(q("ZÜ Analysis Fr um 9 Uhr")).toMatchObject({ kind: "session", sessionType: "Zentralübung", start: "09:00" });
  });
  it("Lerneinheit über Dauer", () => {
    expect(q("90 min Analysis Kapitel 3")).toMatchObject({ kind: "log", minutes: 90, title: "Kapitel 3" });
    expect(q("1,5h DS gelernt").minutes).toBe(90);
    expect(q("1h30 DS").minutes).toBe(90);
    expect(q("45 Minuten EIDI").minutes).toBe(45);
  });
  it("Notiz als Rückfall und mit Präfix", () => {
    expect(q("Frage an Tutor wegen Induktion")).toMatchObject({ kind: "note", kindGuessed: true });
    expect(q("Notiz: Blatt 4 bis Fr")).toMatchObject({ kind: "note", title: "Blatt 4 bis Fr" });
  });
  it("Datum allein ergibt eine Hausaufgabe, Datum plus Uhrzeit einen Termin", () => {
    expect(q("Praktikumsbericht DS Fr").kind).toBe("homework");
    expect(q("Treffen Lerngruppe DS Fr 18:00").kind).toBe("session");
  });
  it("fehlende Angaben werden gemeldet, Werte für Formulare gebaut", () => {
    expect(quickMissing(q("Blatt 4 Fr"))).toEqual(["Modul"]);
    expect(quickMissing(q("Blatt 4 Analysis"))).toEqual(["Datum"]);
    expect(quickToEntity(q("Blatt 4 Analysis Fr"), T)).toEqual({ kind: "homework", vals: { moduleId: "ana", title: "Blatt 4", issued: T, due: "2026-10-23", status: "ausgegeben" } });
    expect(quickToEntity(q("Übung DS Do 14:15"), T).vals).toMatchObject({ start: "14:15", end: "16:15", type: "Übung" });
  });
  it("leere Eingabe", () => {
    expect(q("   ").kind).toBe("");
  });
});

describe("Schnelleingabe: Lernzeit nachtragen", () => {
  const M2 = [...M.filter((m) => m.id !== "la"), { id: "linalg", name: "Lineare Algebra für Informatik" }];
  const r = (s) => parseQuick(s, M2, T);
  it("Dauer, Modul und vergangenes Datum", () => {
    expect(r("1h DS gestern")).toMatchObject({ kind: "log", minutes: 60, date: "2026-10-20", title: "" });
    expect(r("1h DS gestern").module.id).toBe("ds");
    expect(quickToEntity(r("1h DS gestern"), T).vals).toMatchObject({ date: "2026-10-20", minutes: 60, moduleId: "ds", kind: "Nacharbeiten" });
  });
  it("Art aus dem Text, Karten wird nicht Teil des Titels", () => {
    const x = r("45 min Karten Analysis");
    expect(x).toMatchObject({ kind: "log", minutes: 45, logKind: "Karteikarten", title: "" });
    expect(x.module.id).toBe("ana");
    expect(quickToEntity(x, T).vals.kind).toBe("Karteikarten");
    expect(r("90 min Übung DS")).toMatchObject({ kind: "log", logKind: "Übung/Hausaufgabe" });
    expect(r("Karten sortieren").logKind).toBe("");
    expect(r("Karten sortieren").title).toBe("Karten sortieren");
  });
  it("Wochentag meint bei Lernzeit den letzten, ohne Jahr bleibt das Datum in diesem Jahr", () => {
    const x = r("90min Lernen LinAlg Mo");
    expect(x).toMatchObject({ kind: "log", minutes: 90, date: "2026-10-19" });
    expect(x.module.id).toBe("linalg");
    expect(r("1h DS mi").date).toBe(T);
    expect(r("1h DS 3.10.").date).toBe("2026-10-03");
    expect(r("Abgabe DS mi").date).toBe("2026-10-28");
  });
});

describe("Schnelleingabe: Vervollständigung und Vorlagen", () => {
  it("schlägt Module zum letzten Wort vor", () => {
    expect(moduleSuggestions("Blatt 4 Ana", M, T).map((m) => m.id)).toEqual(["ana"]);
    expect(moduleSuggestions("Blatt 4 Ana ", M, T)).toEqual([]);
    expect(moduleSuggestions("Blatt 4 Fr", M, T)).toEqual([]);
    expect(moduleSuggestions("Blatt", M, T)).toEqual([]);
    expect(moduleSuggestions("Blatt 4 Analysis für Informatik", M, T)).toEqual([]);
    expect(moduleSuggestions("Blatt ds", M, T).map((m) => m.id)).toEqual(["ds"]);
  });
  it("übernimmt den vollen Namen und erkennt ihn wieder", () => {
    expect(applySuggestion("Blatt 4 Ana", M[0])).toBe("Blatt 4 Analysis für Informatik ");
    expect(applySuggestion("Blatt 4 Diskrete Struk", M[1])).toBe("Blatt 4 Diskrete Strukturen ");
    expect(applySuggestion("Blatt lin", M[3])).toBe("Blatt Lineare Algebra ");
    const x = q("Blatt 4 Einführung in die Informatik Fr");
    expect(x.module.id).toBe("eidi");
    expect(x.title).toBe("Blatt 4");
  });
  it("findet die Datumsangabe zum Ersetzen", () => {
    expect(dateSpan("Blatt 4 Analysis Fr", T)).toEqual([17, 19]);
    expect(dateSpan("Abgabe DS in 3 Tagen", T)).toEqual([10, 20]);
    expect(dateSpan("Blatt 4 Analysis", T)).toBe(null);
  });
});
