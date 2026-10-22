/* Lernplan bis zur Prüfung: schwächste Themen zuerst, nach Aufwand gewichtet, freie Wochentage
   ausgelassen, letzter Tag = Gesamtwiederholung */
import { TOPIC_STATES } from "./constants.js";
import { addDays, byOrder, diffDays, iso, wdIdx } from "./util.js";

/** Aufwand eines Themas: 1 = klein, 2 = mittel (Standard), 3 = groß */
export const effortOf = (x) => Math.min(3, Math.max(1, Number(x.effort) || 2));

export function buildPlan(data, exam, today = iso()) {
  const daysLeft = diffDays(today, exam.date);
  if (!(daysLeft > 0)) return []; /* auch ohne (gültiges) Prüfungsdatum: NaN */
  const rank = (x) => TOPIC_STATES.indexOf(x.state) * 10 + (Number(x.rating) || 0);
  const topics = data.topics
    .filter((x) => x.moduleId === exam.moduleId && x.state !== "sicher")
    .sort((a, b) => rank(a) - rank(b) || byOrder(a, b));
  const lastStudy = daysLeft >= 2 ? daysLeft - 2 : 0; /* der Tag vor der Prüfung ist die Gesamtwiederholung */
  const free = new Set((exam.freeWeekdays || []).map(Number));
  const all = Array.from({ length: lastStudy + 1 }, (_, i) => addDays(today, i));
  let studyDates = all.filter((d) => !free.has(wdIdx(d)));
  if (!studyDates.length) studyDates = all; /* alle Tage frei → ignorieren, sonst bliebe der Plan leer */
  const studySet = new Set(studyDates);
  /** @type {any[]} */
  const days = all.map((date) => ({ date, topics: [], note: "", free: !studySet.has(date) }));
  const byDate = new Map(days.map((d) => [d.date, d]));

  /* Themen nach kumuliertem Aufwand auf die Lerntage verteilen: große Themen bekommen mehr Platz */
  const total = topics.reduce((s, x) => s + effortOf(x), 0);
  const n = studyDates.length, weightOfDay = new Map();
  let cum = 0;
  topics.forEach((x) => {
    const w = effortOf(x);
    const idx = Math.min(n - 1, Math.floor(((cum + w / 2) / total) * n));
    cum += w;
    const d = byDate.get(studyDates[idx]);
    d.topics.push(x);
    weightOfDay.set(d.date, (weightOfDay.get(d.date) || 0) + w);
  });

  /* Tagesbudget anteilig auf die Themen des Tages verteilen (auf 5 Minuten gerundet) */
  const budget = Number(exam.dailyMinutes) || 0;
  days.forEach((d) => {
    if (budget && d.topics.length) {
      const w = weightOfDay.get(d.date);
      d.topics = d.topics.map((x) => ({ ...x, minutes: Math.max(5, Math.round((budget * effortOf(x)) / w / 5) * 5) }));
    }
    if (d.free) d.note = "Freier Tag";
    else if (!d.topics.length) d.note = topics.length ? "Wiederholung der schwächsten Themen, Karteikarten, Übungsaufgaben" : "Übungsaufgaben und Altklausuren, Karteikarten";
  });
  /* Noch offene Altklausuren auf die letzten Lerntage legen, eine pro Tag in der eingetragenen Reihenfolge */
  const open = (exam.oldExams || []).filter((o) => o.status !== "korrigiert" && o.status !== "gerechnet");
  const studyDays = days.filter((d) => !d.free);
  const slots = open.length ? studyDays.slice(-Math.min(open.length, studyDays.length)) : [];
  slots.forEach((d, i) => { d.oldExam = open[i]; if (!d.topics.length) d.note = ""; });
  if (daysLeft >= 2) days.push({ date: addDays(exam.date, -1), topics: [], note: "Gesamtwiederholung und Probeklausur unter Zeitdruck", final: true, free: false });
  return days;
}
