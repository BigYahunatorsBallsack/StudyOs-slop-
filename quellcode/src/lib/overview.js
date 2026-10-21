/* Überblick: Wochensumme im Wochenkopf und „als Nächstes fällig“ je Modul für die Modulliste */
import { DONE_HW, WD, WD_LONG } from "./constants.js";
import { isActive } from "./data.js";
import { diffDays, iso, wdIdx } from "./util.js";

const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const length = (s) => (s.start ? Math.max(0, toMin(s.end || s.start) - toMin(s.start)) : 0);

/**
 * Summen für die angezeigten Tage: Minuten Termine (ohne ausgefallene), Minuten gelernt (Lerneinheiten)
 * und fällige Abgaben, gesamt und je Tag.
 * @returns {{ sessionMin: number, learnMin: number, due: number, days: Record<string, { sessionMin: number, learnMin: number, due: number }> }}
 */
export function weekSummary(data, days) {
  const out = { sessionMin: 0, learnMin: 0, due: 0, days: {} };
  for (const d of days) out.days[d] = { sessionMin: 0, learnMin: 0, due: 0 };
  const at = (d) => out.days[d];
  for (const s of data.sessions || []) if (at(s.date) && isActive(s)) at(s.date).sessionMin += length(s);
  for (const l of data.logs || []) if (at(l.date)) at(l.date).learnMin += Number(l.minutes) || 0;
  for (const h of data.homework || []) if (at(h.due)) at(h.due).due += 1;
  for (const d of days) { out.sessionMin += at(d).sessionMin; out.learnMin += at(d).learnMin; out.due += at(d).due; }
  return out;
}

/** Stunden knapp: „14 h“, „6,5 h“, „45 min“ (auf halbe Stunden gerundet) */
export function hoursText(min) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.round(min / 30) / 2;
  return `${String(h).replace(".", ",")} h`;
}

/** Ganz kurz für den Tageskopf im Raster: „3h“, „1,5h“, „45′“; leer ohne Termine */
export function hoursShort(min) {
  if (!min) return "";
  if (min < 60) return `${Math.round(min)}′`;
  return `${String(Math.round(min / 30) / 2).replace(".", ",")}h`;
}

/** Die Zeile im Wochenkopf, z. B. „14 h Termine · 6 h gelernt · 4 Abgaben“; leer, wenn nichts ansteht */
export function weekSummaryText(sum) {
  return [
    sum.sessionMin ? `${hoursText(sum.sessionMin)} Termine` : "",
    sum.learnMin ? `${hoursText(sum.learnMin)} gelernt` : "",
    sum.due ? `${sum.due} ${sum.due === 1 ? "Abgabe" : "Abgaben"}` : "",
  ].filter(Boolean);
}

/**
 * Was steht bei einem Modul als Nächstes an? Die früheste offene Abgabe oder Prüfung (auch Wiederholung),
 * ohne beides der nächste Termin.
 * @returns {{ kind: "homework" | "exam" | "session", date: string, time: string, text: string, label: string, urgent: boolean, key: string } | null}
 */
export function nextUp(data, moduleId, now = new Date()) {
  const t = iso(now), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const cands = [];
  for (const h of data.homework || []) {
    if (h.moduleId !== moduleId || !h.due || DONE_HW.has(h.status)) continue;
    cands.push({ kind: "homework", date: h.due, time: h.dueTime || "23:59", item: h });
  }
  for (const e of data.exams || []) {
    if (e.moduleId !== moduleId || e.result === "bestanden") continue;
    if (e.date && e.date >= t && e.result !== "nicht bestanden") cands.push({ kind: "exam", date: e.date, time: e.time || "", item: e });
    else if (e.result === "nicht bestanden" && e.retakeDate && e.retakeDate >= t) cands.push({ kind: "exam", date: e.retakeDate, time: "", item: e, retake: true });
  }
  const order = (a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00"));
  let x = cands.sort(order)[0];
  if (!x) {
    const s = (data.sessions || []).filter((s) => s.moduleId === moduleId && isActive(s) && s.date && (s.date > t || (s.date === t && (s.start || "23:59") > hm)))
      .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))[0];
    if (!s) return null;
    x = { kind: "session", date: s.date, time: s.start || "", item: s };
  }
  const n = diffDays(t, x.date);
  const day = n === 0 ? "heute" : n === 1 ? "morgen" : n <= 6 ? WD[wdIdx(x.date)] : `${x.date.slice(8)}.${x.date.slice(5, 7)}.`;
  let text, label;
  if (x.kind === "homework") {
    const late = n < 0 || (n === 0 && x.time < hm);
    text = late ? "Abgabe überfällig" : `Abgabe ${day}`;
    label = late ? `Abgabe „${x.item.title}“ überfällig` : `Abgabe „${x.item.title}“ ${n >= 2 ? `am ${n <= 6 ? dayLong(x.date) : day}` : day}`;
  } else if (x.kind === "exam") {
    const what = x.retake ? "Wiederholung" : "Prüfung";
    text = n === 0 ? `${what} heute` : n === 1 ? `${what} morgen` : `${what} in ${n} Tagen`;
    label = text;
  } else {
    text = `${x.item.type || "Termin"} ${day}${x.time ? ` ${x.time}` : ""}`;
    label = `Nächster Termin: ${text}`;
  }
  return { kind: x.kind, date: x.date, time: x.time, text, label, urgent: x.kind !== "session" && n <= 1, key: x.date + (x.time || "00:00") };
}
const dayLong = (d) => WD_LONG[wdIdx(d)];

export const MODULE_SORTS = [["semester", "Semester"], ["dringlichkeit", "Dringlichkeit"]];
const SORT_KEY = "studyos-module-sortierung";
export const readModuleSort = () => { try { const v = localStorage.getItem(SORT_KEY); return MODULE_SORTS.some((s) => s[0] === v) ? v : "semester"; } catch { return "semester"; } };
export const saveModuleSort = (v) => { try { localStorage.setItem(SORT_KEY, v); } catch { /* egal */ } };

/** Module sortieren: nach Semester (dann Name) oder nach Dringlichkeit (nächstes Fälliges zuerst, ohne Fälliges ans Ende) */
export function sortModules(list, mode, nextOf) {
  const bySem = (a, b) => (a.semester || 0) - (b.semester || 0) || a.name.localeCompare(b.name);
  if (mode !== "dringlichkeit") return [...list].sort(bySem);
  const key = new Map(list.map((m) => [m.id, nextOf(m)?.key || ""]));
  const cmp = (x, y) => (x === y ? 0 : !x ? 1 : !y ? -1 : x < y ? -1 : 1); /* ohne Fälliges ans Ende */
  return [...list].sort((a, b) => cmp(key.get(a.id), key.get(b.id)) || bySem(a, b));
}
