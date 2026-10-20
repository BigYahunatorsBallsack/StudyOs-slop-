/* „Zu erledigen“ auf Heute: Abgaben, Nachbereitungen, Anmeldefristen und fällige Karten in einer Liste,
   sortiert nach Dringlichkeit (Tage bis zur Frist; Nachbereitung sollte innerhalb von 2 Tagen passieren). */
import { DONE_HW } from "./constants.js";
import { isActive } from "./data.js";
import { addDays, diffDays, isHeld, iso } from "./util.js";

export const REVIEW_WITHIN_DAYS = 2;

export function todoItems(data, today = iso()) {
  const out = [];
  data.homework.forEach((h) => {
    if (DONE_HW.has(h.status) || h.missed || !h.due || h.due > addDays(today, 7)) return;
    out.push({ kind: "homework", id: h.id, item: h, moduleId: h.moduleId, due: h.due, score: diffDays(today, h.due) });
  });
  data.sessions.forEach((s) => {
    if (!isActive(s) || s.reviewed || !isHeld(s) || s.date === today) return; /* heutige stehen im Tagesplan */
    out.push({ kind: "review", id: s.id, item: s, moduleId: s.moduleId, due: addDays(s.date, REVIEW_WITHIN_DAYS), score: diffDays(today, addDays(s.date, REVIEW_WITHIN_DAYS)) });
  });
  data.exams.forEach((e) => {
    if (!e.registerBy || e.registered || e.registerBy < today || e.registerBy > addDays(today, 14)) return;
    out.push({ kind: "register", id: e.id, item: e, moduleId: e.moduleId, due: e.registerBy, score: diffDays(today, e.registerBy) });
  });
  const cards = data.cards.filter((c) => c.due <= today).length;
  if (cards) out.push({ kind: "cards", id: "cards", count: cards, due: today, score: 0.5 });
  const rank = { register: 0, homework: 1, review: 2, cards: 3 };
  return out.sort((a, b) => a.score - b.score || rank[a.kind] - rank[b.kind] || String(a.due).localeCompare(String(b.due)));
}

/** Zahl am App-Symbol: was heute noch offen ist (fällige und überfällige Abgaben, Nachbereitungen, Anmeldeschluss heute, fällige Karten als eins) */
export function openTodayCount(data, today = iso()) {
  return todoItems(data, today).filter((x) => x.kind === "cards" || x.kind === "review" || x.due <= today).length;
}

/** Überfällige Abgaben, bei denen StudyOS „Abgegeben?“ fragt */
export const isLate = (x, today = iso()) => x.kind === "homework" && x.due < today;

/** Kurztext zur Frist: „überfällig“, „heute“, „morgen“, „Fr“, „in 5 Tagen“ */
export function dueLabel(due, today = iso()) {
  const n = diffDays(today, due);
  if (n < 0) return n === -1 ? "seit gestern" : `seit ${-n} Tagen`;
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  return `in ${n} Tagen`;
}
