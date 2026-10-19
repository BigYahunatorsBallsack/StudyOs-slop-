import { describe, it, expect } from "vitest";
import { parseQuick, quickToEntity, quickMissing } from "../../src/lib/quickadd.js";

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
