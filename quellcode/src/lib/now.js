/* „Was jetzt?“: die sinnvollste Aufgabe für die Zeit, die gerade frei ist */
import { DONE_HW, TOPIC_STATES } from "./constants.js";
import { addDays, diffDays, isHeld, iso } from "./util.js";
import { withoutArchived } from "./study.js";

/**
 * @param minutes verfügbare Zeit
 * @returns [{ id, title, why, minutes, kind, moduleId, action: "timer" | "cards", score }] bestes zuerst
 */
export function whatNow(all, minutes, now = new Date()) {
  const data = withoutArchived(all);
  const t = iso(now), out = [];
  const mod = (id) => data.modules.find((m) => m.id === id);
  const fit = (want) => Math.max(10, Math.min(minutes, want));

  /* Abgaben: je näher, desto dringender; braucht mindestens 25 Minuten */
  data.homework.filter((h) => !DONE_HW.has(h.status) && h.due && h.due >= addDays(t, -2)).forEach((h) => {
    const days = diffDays(t, h.due);
    if (days > 10) return;
    const score = (days <= 0 ? 100 : days === 1 ? 90 : days <= 3 ? 70 : 40 - days) - (minutes < 25 ? 50 : 0);
    out.push({ id: "hw-" + h.id, title: h.title, why: days < 0 ? "überfällig" : days === 0 ? "heute fällig" : days === 1 ? "morgen fällig" : `in ${days} Tagen fällig`, minutes: fit(50), kind: "Übung/Hausaufgabe", moduleId: h.moduleId, action: "timer", score });
  });
  /* Nachbereitung: frisch Gehörtes zuerst */
  data.sessions.filter((s) => !s.cancelled && !s.reviewed && isHeld(s) && s.date >= addDays(t, -10)).forEach((s) => {
    const age = diffDays(s.date, t);
    out.push({ id: "rv-" + s.id, title: `${s.type} nachbereiten`, why: age === 0 ? "von heute" : age === 1 ? "von gestern" : `seit ${age} Tagen offen`, minutes: fit(30), kind: "Nacharbeiten", moduleId: s.moduleId, action: "timer", sessionId: s.id, score: 75 - age * 4 });
  });
  /* Karteikarten: gut für kurze Lücken */
  const due = data.cards.filter((c) => c.due <= t).length;
  if (due >= 3) out.push({ id: "cards", title: `${due} Karteikarten wiederholen`, why: "fällig", minutes: fit(Math.min(30, Math.ceil(due / 2))), kind: "Karteikarten", moduleId: "", action: "cards", score: (minutes <= 20 ? 80 : 45) + Math.min(15, due / 4) });
  /* Prüfungsvorbereitung: schwächstes Thema, wenn die Prüfung naht */
  data.exams.filter((e) => e.date >= t && diffDays(t, e.date) <= 21 && e.result !== "bestanden").forEach((e) => {
    const topic = data.topics.filter((x) => x.moduleId === e.moduleId && x.state !== "sicher").sort((a, b) => TOPIC_STATES.indexOf(a.state) - TOPIC_STATES.indexOf(b.state))[0];
    const days = diffDays(t, e.date);
    out.push({ id: "ex-" + e.id, title: topic ? `Thema: ${topic.title}` : "Altklausur oder Übungsaufgaben", why: `Prüfung in ${days} ${days === 1 ? "Tag" : "Tagen"}`, minutes: fit(45), kind: "Klausurvorbereitung", moduleId: e.moduleId, topicId: topic?.id || "", action: "timer", score: 85 - days * 2 - (minutes < 20 ? 30 : 0) });
  });
  /* Vorbereitung auf morgen */
  data.sessions.filter((s) => !s.cancelled && !s.prepared && s.date === addDays(t, 1)).forEach((s) => {
    out.push({ id: "pr-" + s.id, title: `${s.type} vorbereiten`, why: `morgen um ${s.start}`, minutes: fit(20), kind: "Vorbereiten", moduleId: s.moduleId, action: "timer", score: 35 });
  });
  return out.sort((a, b) => b.score - a.score).map((x) => ({ ...x, module: mod(x.moduleId)?.name || "" }));
}
