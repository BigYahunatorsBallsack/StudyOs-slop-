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
    const exams = data.exams.filter((e) => e.moduleId === m.id).sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
    return { ...m, exam: exams[0] || null };
  });
  /* kleinste Kombinationen offener Module, die die fehlenden ECTS bringen */
  const combos = need > 0 ? minimalCombos(open, need) : [];
  return { modules, passed, stage, stages, need, reached: !!stage && need === 0, open, enough: sum(open, (m) => Number(m.ects) || 0) >= need, combos, curriculum };
}

/* Spätere Indizes zuerst vergleichen: dieselbe Reihenfolge wie beim Hochzählen einer Bitmaske */
const colex = (a, b) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/**
 * Die ersten `limit` minimalen Kombinationen (keine echte Teilmenge reicht schon), die mindestens `need` ECTS bringen,
 * kleinste zuerst. Statt alle 2^n Teilmengen zu prüfen, geht es Größe für Größe und hört auf, sobald genug gefunden sind;
 * Größen, bei denen selbst die größten Module nicht reichen, werden übersprungen.
 */
export function minimalCombos(open, need, limit = 4) {
  const ects = open.map((m) => Number(m.ects) || 0), n = open.length;
  const desc = [...ects].sort((a, b) => b - a);
  /** @type {number[][]} */ const found = [];
  let best = 0, budget = 200000;
  for (let k = 1; k <= n && found.length < limit && budget > 0; k++) {
    best += desc[k - 1];
    if (best < need) continue;
    /** @type {number[][]} */ const level = [], pick = [];
    const rec = (start, total) => {
      if (budget-- <= 0) return;
      if (pick.length === k) { if (total >= need && !found.some((c) => c.every((i) => pick.includes(i)))) level.push([...pick]); return; }
      for (let i = start; i <= n - (k - pick.length); i++) { pick.push(i); rec(i + 1, total + ects[i]); pick.pop(); }
    };
    rec(0, 0);
    found.push(...level.sort(colex));
  }
  return found.slice(0, limit).map((c) => c.map((i) => open[i]));
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

/* Wie weit die Aufzeichnung eines Termins in TUM-Live angeschaut ist. TUM-Live gibt das nicht heraus,
   deshalb trägt man die Stelle selbst ein: „47:12“, „1:05:30“ oder nur Minuten („47“). */
export function parseWatch(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{1,3}$/.test(s)) return Number(s) * 60;
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(s);
  if (!m || Number(m[3]) > 59 || (m[1] !== undefined && Number(m[2]) > 59)) return NaN;
  return (Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}

export function fmtWatch(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** Stand der Aufzeichnung: null ohne Eintrag, sonst { label, ratio } mit der Termindauer als Länge. */
export function watchProgress(s) {
  const sec = parseWatch(s?.watchedTo);
  if (sec === null || !Number.isFinite(sec)) return null;
  const mins = (t) => (/^\d{2}:\d{2}$/.test(t || "") ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
  const a = mins(s.start), b = mins(s.end), len = a !== null && b !== null && b > a ? (b - a) * 60 : null;
  return { label: fmtWatch(sec), ratio: len ? Math.min(1, sec / len) : null };
}
