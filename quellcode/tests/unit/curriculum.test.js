import { describe, it, expect } from "vitest";
import { CURRICULA, applySemester, previewSemester } from "../../src/lib/curriculum.js";
import { emptyData } from "../../src/lib/data.js";

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
