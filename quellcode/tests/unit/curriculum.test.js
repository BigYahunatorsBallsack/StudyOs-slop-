import { describe, it, expect } from "vitest";
import { CURRICULA, applySemester, curriculumOf, gopCodes, previewSemester, setupFromPlan } from "../../src/lib/curriculum.js";
import { emptyData, migrate } from "../../src/lib/data.js";
import { gopStatus } from "../../src/lib/tum.js";
import { LEGACY_COMMUTE, commuteOf } from "../../src/lib/transit.js";
import { mensaOf } from "../../src/lib/mensa.js";

const plan = CURRICULA[0];
describe("Studienplan-Vorlage", () => {
  it("Semester 1 hat 28 ECTS und drei GOP-Module", () => {
    const rows = previewSemester(emptyData(), plan, 1);
    expect(rows.reduce((s, r) => s + r.ects, 0)).toBe(28);
    expect(rows.every((r) => r.gop)).toBe(true);
  });
  it("legt neue Module an und ergänzt vorhandene aus dem Abo statt sie zu verdoppeln", () => {
    const d = { ...emptyData(), modules: [{ id: "m1", name: "Diskrete Strukturen (IN0015)", ects: 0, semester: 1, status: "belegt" }, { id: "m2", name: "Tutorübungen zu Einführung in die Rechnerarchitektur", ects: 0, status: "belegt" }] };
    const r = applySemester(d, plan, 1, "belegt");
    expect(r.added).toBe(1);
    expect(r.updated).toBe(2);
    expect(r.data.modules.find((m) => m.id === "m1")).toMatchObject({ code: "IN0015", ects: 8 });
    expect(r.data.modules.find((m) => m.code === "CIT123001")).toMatchObject({ status: "belegt", semester: 1, gop: true });
    expect(applySemester(r.data, plan, 1).added).toBe(0);
  });
});

const pbt = CURRICULA.find((c) => c.id === "tum-bsc-pbt-2022");
describe("Pharmazeutische Bioprozesstechnik", () => {
  it("GOP-Module laut FPSO Anlage 1: 26 Credits im 1. Semester", () => {
    const rows = previewSemester(emptyData(), pbt, 1).filter((r) => r.gop);
    expect(rows.map((r) => r.code).sort()).toEqual(["LS30040", "MA9615", "PH9035", "WZ5322"]);
    expect(rows.reduce((s, r) => s + r.ects, 0)).toBe(26);
    expect(gopCodes(pbt).has("IN0004")).toBe(false);
  });
  it("Plan übernehmen wählt ihn als Studiengang, die GOP rechnet in zwei Stufen (10 bis 2., 26 bis 3. Semester)", () => {
    let d = applySemester(emptyData(), pbt, 1, "belegt").data;
    expect(d.settings).toMatchObject({ curriculum: "tum-bsc-pbt-2022", program: "Pharmazeutische Bioprozesstechnik" });
    expect(curriculumOf(d)).toBe(pbt);
    const pass = (code) => { d = { ...d, modules: d.modules.map((m) => (m.code === code ? { ...m, status: "bestanden" } : m)) }; };
    expect(gopStatus(d)).toMatchObject({ passed: 0, need: 10, stage: { bySemester: 2 }, reached: false });
    pass("MA9615"); pass("LS30040");
    expect(gopStatus(d)).toMatchObject({ passed: 13, need: 13, stage: { bySemester: 3 }, reached: false, enough: true });
    pass("WZ5322"); pass("PH9035");
    expect(gopStatus(d)).toMatchObject({ passed: 26, need: 0, reached: true });
  });
  it("ohne Studienplan zählt die GOP-Karte nur und nennt keine Frist", () => {
    const d = { ...emptyData(), modules: [{ id: "a", name: "A", ects: 5, gop: true, status: "bestanden" }] };
    expect(gopStatus(d)).toMatchObject({ passed: 5, stage: null, need: 0, reached: false });
    expect(curriculumOf({ ...d, settings: { ...d.settings, curriculum: "none" }, modules: [{ id: "b", fromPlan: pbt.id }] })).toBe(null);
  });
});

describe("Voreinstellungen", () => {
  it("neue Daten starten ohne Route, Mensa und Studiengang", () => {
    const s = migrate(JSON.parse(JSON.stringify(emptyData()))).settings;
    expect([s.program, s.curriculum, mensaOf(s), commuteOf(s)]).toEqual(["", "", "", null]);
  });
  it("ältere Daten behalten die bisherigen Vorgaben, auch teilweise geänderte Route", () => {
    const old = { modules: [], settings: { university: "TUM", program: "Informatik", theme: "retro" } };
    const s = migrate(old).settings;
    expect(s).toMatchObject({ mensa: "mensa-garching", curriculum: "tum-bsc-informatik-2026", defaultsRev: 2, theme: "retro" });
    expect(commuteOf(s)).toEqual(LEGACY_COMMUTE);
    const own = migrate({ modules: [], settings: { mensa: "", commute: { line: "U6", feeder: null } } }).settings;
    expect(own.mensa).toBe("");
    expect(commuteOf(own)).toMatchObject({ line: "U6", feeder: null, station: { name: "Haar" }, car: { from: "Zorneding" } });
    expect(migrate({ modules: [], settings: { commute: null } }).settings.commute).toBe(null);
    expect(migrate(migrate(old)).settings).toEqual(s);
  });
});

describe("Einrichtung beim ersten Start", () => {
  const empty = { modules: [], settings: {} };
  const plan = CURRICULA[0];
  it("legt nur das laufende Semester als belegt an", () => {
    const { data, added } = setupFromPlan(empty, plan, 2);
    expect(added).toBe(plan.semesters[1].length);
    expect(data.modules.every((m) => m.semester === 2 && m.status === "belegt")).toBe(true);
    expect(data.settings).toMatchObject({ curriculum: plan.id, program: plan.program });
  });
  it("auf Wunsch auch frühere Semester als bestanden", () => {
    const { data, added } = setupFromPlan(empty, plan, 2, true);
    expect(added).toBe(plan.semesters[0].length + plan.semesters[1].length);
    expect(data.modules.filter((m) => m.semester === 1).every((m) => m.status === "bestanden")).toBe(true);
  });
});
