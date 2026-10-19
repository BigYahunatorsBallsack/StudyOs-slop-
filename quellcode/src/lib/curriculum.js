/* Studienplan-Vorlagen: Pflichtmodule eines Studiengangs auf einen Klick anlegen, dazu die GOP-Regel des Studiengangs.
   gop.stages: bis Ende welchen Fachsemesters wie viele ECTS aus den GOP-Modulen bestanden sein müssen. */
import { PALETTE } from "./constants.js";
import { uid } from "./util.js";
import { baseName } from "./modules.js";

export const CURRICULA = [
  {
    id: "tum-bsc-informatik-2026",
    name: "TUM B.Sc. Informatik (Studienbeginn ab SoSe 2026)",
    program: "Informatik",
    source: "https://www.cit.tum.de/cit/studium/studiengaenge/bachelor-informatik/studienplan/",
    gop: { stages: [{ bySemester: 1, ects: 12 }], extraCodes: ["IN0001"], hint: "bis Ende des 1. Semesters bzw. in der Wiederholungsprüfung" },
    note: "Dazu kommen 18 ECTS Wahlmodule Informatik, 6 ECTS Überfachliche Grundlagen (Sem. 1–4) und 21 ECTS Anwendungsfach (Sem. 3–6). Grundlagenprüfung: mindestens 12 ECTS aus den Modulen des 1. Semesters bis zum Ende des 1. Semesters oder in der Wiederholung.",
    semesters: [
      [["CIT123001", "Einführung in die Informatik und das Programmieren", 12, true], ["IN0004", "Einführung in die Rechnerarchitektur", 8, true], ["IN0015", "Diskrete Strukturen", 8, true]],
      [["IN0006", "Einführung in die Softwaretechnik", 6], ["IN0007", "Grundlagen: Algorithmen und Datenstrukturen", 6], ["IN0003", "Funktionale Programmierung und Verifikation", 5], ["MA0901", "Lineare Algebra für Informatik", 8], ["IN0005", "Grundlagenpraktikum: Rechnerarchitektur", 5]],
      [["IN0008", "Grundlagen: Datenbanken", 6], ["IN0009", "Grundlagen: Betriebssysteme und Systemsoftware", 5], ["IN0042", "IT-Sicherheit", 5], ["MA0902", "Analysis für Informatik", 8]],
      [["IN0010", "Grundlagen: Rechnernetze und Verteilte Systeme", 6], ["IN0011", "Einführung in die Theoretische Informatik", 8], ["IN0018", "Diskrete Wahrscheinlichkeitstheorie", 6], ["IN0014", "Seminar", 5]],
      [["IN0019", "Numerisches Programmieren", 6], ["IN0012", "Bachelor-Praktikum", 10]],
      [["CIT000000", "Bachelorarbeit", 12]],
    ],
  },
  {
    id: "tum-bsc-pbt-2022",
    name: "TUM B.Sc. Pharmazeutische Bioprozesstechnik (FPSO ab WiSe 2022/23)",
    program: "Pharmazeutische Bioprozesstechnik",
    source: "https://ls.tum.de/fileadmin/w00bww/ls/download/studies/fpso/FPSO-BSC-17798-PBT-20221.PDF",
    /* FPSO § 38 Abs. 2: in den GOP-Modulen mindestens 10 Credits bis Ende 2., 26 Credits bis Ende 3. Fachsemester */
    gop: { stages: [{ bySemester: 2, ects: 10 }, { bySemester: 3, ects: 26 }], hint: "" },
    note: "Campus Freising-Weihenstephan. Dazu kommen Wahlmodule aus Profilbereich (mindestens 35 Credits) und freien Wahlmodulen (bis zu 10 Credits) sowie ein allgemeinbildendes Fach. Module über zwei Semester stehen im Semester, in dem sie beginnen.",
    semesters: [
      [["WZ5322", "Allgemeine und Anorganische Chemie", 6, true], ["PH9035", "Physik für Life-Science-Ingenieure 1", 7, true], ["MA9615", "Höhere Mathematik", 8, true], ["LS30040", "Einführung in die Bioprozesstechnik", 5, true], ["LS30037", "Zellbiologie", 5], ["LS30041", "Seminar zur guten wissenschaftlichen Praxis", 4]],
      [["PH9036", "Physik für Life-Science-Ingenieure 2", 5], ["WZ5426", "Organische und Biologische Chemie", 9], ["WZ5442", "Technische Mechanik", 8], ["LS30038", "Ökonomie für Life Science Engineering", 5]],
      [["WZ5299", "Statistik", 5], ["LS30001", "Grundlagen der Mikrobiologie", 5], ["LS30045", "Bioprozesstechnik", 5]],
      [["LS30047", "Biochemie 2 und Energiestoffwechsel", 5], ["WZ5013", "Strömungsmechanik", 5], ["LS30032", "Pharmazeutische Technologie", 5]],
      [["WZ5414", "Molekulare Biotechnologie", 5], ["LS30036", "Thermodynamik", 5], ["LS30030", "Arzneimittelproduktion", 5], ["LS30039", "Verpackungstechnik – Grundlagen", 5]],
      [["LS30035", "Hygienic Processing", 6], ["LS30044", "Bachelor's Thesis", 12]],
    ],
  },
];

/** Studienplan zu den Einstellungen (settings.curriculum, „none“ = bewusst keiner), sonst der, aus dem die Module übernommen wurden */
export function curriculumOf(data) {
  const byId = (id) => CURRICULA.find((c) => c.id === id) || null;
  const chosen = data.settings?.curriculum;
  if (chosen) return chosen === "none" ? null : byId(chosen);
  const used = data.modules.map((m) => m.fromPlan).find((id) => id && byId(id));
  return used ? byId(used) : null;
}

/** Modulnummern, die im Studienplan zur GOP zählen */
export const gopCodes = (curriculum) => new Set(curriculum ? [...curriculum.semesters.flat().filter((r) => r[3]).map((r) => r[0]), ...(curriculum.gop.extraCodes || [])] : []);

/** Vorhandenes Modul zu einem Plan-Eintrag: gleiche Modulnummer oder gleicher Namenskern. */
const findExisting = (modules, code, name) => modules.find((m) => (m.code && m.code.toUpperCase() === code) || baseName(m.name) === baseName(name));

/** Vorschau: was beim Übernehmen eines Semesters neu angelegt bzw. ergänzt würde. */
export function previewSemester(data, curriculum, semNo) {
  return (curriculum.semesters[semNo - 1] || []).map(([code, name, ects, gop]) => {
    const ex = findExisting(data.modules, code, name);
    return { code, name, ects, gop: !!gop, existing: ex || null };
  });
}

/**
 * Legt die Module eines Plan-Semesters an. Vorhandene (z. B. aus dem Stundenplan-Abo) werden nur um
 * Modulnummer, ECTS und Semester ergänzt, nicht doppelt angelegt.
 * @param status Status neuer Module („belegt“ fürs laufende Semester, sonst „geplant“)
 */
export function applySemester(data, curriculum, semNo, status = "geplant") {
  let modules = [...data.modules], added = 0, updated = 0;
  for (const { code, name, ects, gop, existing } of previewSemester(data, curriculum, semNo)) {
    if (existing) {
      const patch = {};
      if (!existing.code) patch.code = code;
      if (!Number(existing.ects)) patch.ects = ects;
      if (!existing.semester) patch.semester = semNo;
      if (Object.keys(patch).length) { modules = modules.map((m) => (m.id === existing.id ? { ...m, ...patch } : m)); updated++; }
      continue;
    }
    modules.push({ id: uid(), name, code, ects, semester: semNo, status, color: PALETTE[modules.length % PALETTE.length], grade: "", bonusPct: "", gop: !!gop, fromPlan: curriculum.id });
    added++;
  }
  /* ohne gewählten Studienplan gilt ab jetzt dieser, auch für die GOP-Regel */
  const s = data.settings || {};
  const settings = s.curriculum && s.curriculum !== "none" ? s : { ...s, curriculum: curriculum.id, program: s.program || curriculum.program || "" };
  return { data: { ...data, modules, settings }, added, updated };
}
