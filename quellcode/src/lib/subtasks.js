/* Teilaufgaben einer Abgabe (a, b, c …): einzeln abhaken, Fortschritt, Status passt sich an. */
import { DONE_HW } from "./constants.js";
import { iso, uid } from "./util.js";

export const MAX_SUBTASKS = 26;

/** Fortschritt einer Abgabe: { done, total } (total 0 = keine Teilaufgaben). */
export function subProgress(h) {
  const list = Array.isArray(h?.subtasks) ? h.subtasks : [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

/* Bereiche wie „a-d“, „a–d“ oder „1-4“ in einzelne Namen auflösen; sonst null. */
export function expandRange(text) {
  const t = String(text || "").trim();
  let m = /^([a-z])\s*[-–]\s*([a-z])$/i.exec(t);
  if (m) {
    const a = m[1].toLowerCase().charCodeAt(0), b = m[2].toLowerCase().charCodeAt(0);
    if (b <= a || b - a >= MAX_SUBTASKS) return null;
    const upper = m[1] === m[1].toUpperCase();
    return Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)).map((c) => (upper ? c.toUpperCase() : c));
  }
  m = /^(.*?)(\d+)\s*[-–]\s*(\d+)$/.exec(t);
  if (m && (!m[1] || /[\s.]$|^[a-z]+$/i.test(m[1]))) {
    const a = Number(m[2]), b = Number(m[3]);
    if (b <= a || b - a >= MAX_SUBTASKS) return null;
    return Array.from({ length: b - a + 1 }, (_, i) => `${m[1]}${a + i}`);
  }
  return null;
}

/** Neue Teilaufgaben aus einer Eingabe: ein Bereich ergibt mehrere, sonst eine. */
export function newSubtasks(text, existing = []) {
  const t = String(text || "").trim();
  if (!t) return existing;
  const names = expandRange(t) || [t];
  const room = Math.max(0, MAX_SUBTASKS - existing.length);
  return [...existing, ...names.slice(0, room).map((title) => ({ id: uid(), title, done: false }))];
}

/** Änderungen beim Abhaken: erste Teilaufgabe → „in Arbeit“, alle → „bearbeitet“, wieder offen → „in Arbeit“.
    Abgegebene und bewertete Blätter behalten ihren Status. */
export function toggleSubtask(h, id, today = iso()) {
  const subtasks = (h.subtasks || []).map((s) => (s.id === id ? { ...s, done: !s.done } : s));
  const p = subProgress({ subtasks });
  let status = h.status;
  if (status !== "abgegeben" && status !== "bewertet") {
    if (p.total && p.done === p.total) status = "bearbeitet";
    else if (p.done && status === "ausgegeben") status = "in Arbeit";
    else if (status === "bearbeitet") status = "in Arbeit";
  }
  const out = { subtasks };
  if (status !== h.status) Object.assign(out, { status, doneAt: DONE_HW.has(status) ? h.doneAt || today : null });
  return out;
}
