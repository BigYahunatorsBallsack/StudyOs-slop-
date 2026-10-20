/* Verschieben von Abgaben und Lernblöcken (nach links wischen, Schnellmenü, „Abgegeben?“ mit Nein) */
import { addDays, iso } from "./util.js";

/** Vorschläge: morgen und eine Woche später (ab der alten Frist, wenn sie noch nicht vorbei ist) */
export function postponeTargets(current, today = iso()) {
  const base = current && current > today ? current : today;
  return [
    { label: "Morgen", date: addDays(today, 1) },
    { label: "Eine Woche später", date: addDays(base, 7) },
  ];
}

/** Änderung für eine Abgabe mit neuer Frist. Abo-Abgaben merken sich die Frist als von Hand geändert. */
export function postponeHomework(h, date) {
  const p = { due: date, missed: false };
  if (h.feedKey) p.locked = [...new Set([...(h.locked || []), "due"])];
  return p;
}
