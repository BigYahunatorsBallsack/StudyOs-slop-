/* TUM-spezifische Helfer: Räume in NavigaTUM, Grundlagen- und Orientierungsprüfung (GOP) */
import { sum } from "./util.js";
import { curriculumOf, gopCodes } from "./curriculum.js";

/** Link zu NavigaTUM: mit Raumnummer aus TUMonline (z. B. „5602.EG.001“) direkt zum Raum, sonst Suche. */
export function roomUrl(room) {
  const r = String(room || "").trim();
  if (!r) return null;
  const id = /\b(\d{4}\.[A-Z0-9]{1,3}\.[A-Z0-9]{2,6})\b/i.exec(r);
  if (id) return `https://nav.tum.de/room/${id[1].toUpperCase()}`;
  const q = r.split(/[,(]/)[0].trim() || r;
  return `https://nav.tum.de/search?q=${encodeURIComponent(q)}`;
}

/* GOP-Module: Häkchen am Modul oder Modulnummer aus dem gewählten Studienplan */
export const isGop = (m, codes = new Set()) => !!m.gop || codes.has(String(m.code || "").toUpperCase());

/**
 * Stand der GOP nach der Regel des Studienplans (z. B. Informatik: 12 ECTS bis Ende 1. Semester;
 * Pharmazeutische Bioprozesstechnik: 10 ECTS bis Ende 2., 26 ECTS bis Ende 3. Semester).
 * Ohne Studienplan gibt es keine Regel (stage null), gezählt wird trotzdem.
 * @returns null ohne GOP-Module, sonst { modules, passed, stage, need, reached, open, enough, combos, curriculum }
 */
export function gopStatus(data) {
  const curriculum = curriculumOf(data), codes = gopCodes(curriculum);
  const modules = data.modules.filter((m) => isGop(m, codes));
  if (!modules.length) return null;
  const passedList = modules.filter((m) => m.status === "bestanden");
  const passed = sum(passedList, (m) => Number(m.ects) || 0);
  const stages = curriculum?.gop.stages || [];
  const stage = stages.find((s) => s.ects > passed) || stages[stages.length - 1] || null;
  const need = stage ? Math.max(0, stage.ects - passed) : 0;
  const open = modules.filter((m) => m.status !== "bestanden").map((m) => {
    const exams = data.exams.filter((e) => e.moduleId === m.id).sort((a, b) => a.date.localeCompare(b.date));
    return { ...m, exam: exams[0] || null };
  });
  /* kleinste Kombinationen offener Module, die die fehlenden ECTS bringen */
  const combos = [];
  if (need > 0) {
    const n = open.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const pick = open.filter((_, i) => mask & (1 << i));
      if (sum(pick, (m) => Number(m.ects) || 0) < need) continue;
      if (combos.some((c) => c.every((x) => pick.includes(x)))) continue;
      combos.push(pick);
    }
    combos.sort((a, b) => a.length - b.length);
  }
  return { modules, passed, stage, stages, need, reached: !!stage && need === 0, open, enough: sum(open, (m) => Number(m.ects) || 0) >= need, combos: combos.slice(0, 4), curriculum };
}

/**
 * Notenschnitt (ECTS-gewichtet) jetzt und als Prognose mit erwarteten Noten belegter/geplanter Module.
 */
export function gradeForecast(data) {
  const val = (g) => { const n = Number(String(g ?? "").replace(",", ".")); return n >= 1 && n <= 5 ? n : null; };
  const done = data.modules.filter((m) => m.status === "bestanden" && val(m.grade) !== null && Number(m.ects) > 0);
  const exp = data.modules.filter((m) => m.status !== "bestanden" && m.status !== "nicht bestanden" && val(m.expectedGrade) !== null && Number(m.ects) > 0);
  const avg = (list, f) => { const e = sum(list, (m) => Number(m.ects)); return e ? sum(list, (m) => f(m) * Number(m.ects)) / e : null; };
  return {
    current: avg(done, (m) => val(m.grade)), currentEcts: sum(done, (m) => Number(m.ects)),
    forecast: exp.length ? avg([...done, ...exp], (m) => val(m.grade) ?? val(m.expectedGrade)) : null, expectedEcts: sum(exp, (m) => Number(m.ects)), expectedCount: exp.length,
  };
}
