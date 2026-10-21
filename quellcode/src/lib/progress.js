/* Motivation: Erfolge (Abzeichen), Wochenkarte am Sonntag, Lernziele pro Modul, Schwachstellen bei Karteikarten,
   Sonne und Mond über der Skyline. Alles wird aus den Daten berechnet, nichts davon wird gespeichert. */
import { DONE_HW } from "./constants.js";
import { addDays, iso, sum, wdIdx, weekStart } from "./util.js";

/** Längste Serie aufeinanderfolgender Lerntage (nicht nur die aktuelle). */
export function bestStreak(logs) {
  const days = [...new Set(logs.filter((l) => Number(l.minutes) > 0 && l.date).map((l) => l.date))].sort();
  let best = 0, run = 0, prev = null;
  days.forEach((d) => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; });
  return best;
}

/** Wie oft Karten insgesamt wiederholt wurden; ältere Karten ohne Zähler zählen mit ihren Wiederholungen. */
export const cardReviews = (cards) => sum(cards, (c) => Number(c.reviews) || Number(c.reps) || 0);

/** Wochen (ab Montag), in denen die Lernzeit das Wochenziel erreicht hat. */
function goalWeeks(logs, goalMin) {
  if (!goalMin) return 0;
  const byWeek = new Map();
  logs.forEach((l) => { if (l.date) byWeek.set(weekStart(l.date), (byWeek.get(weekStart(l.date)) || 0) + (Number(l.minutes) || 0)); });
  return [...byWeek.values()].filter((m) => m >= goalMin).length;
}

/* Abzeichen: Wert aus den Daten, Ziel, Pixel-Symbol (retro.css) */
const BADGES = [
  { id: "start", title: "Erster Schritt", desc: "Die erste Lerneinheit eingetragen", icon: "book", goal: 1, value: (d) => d.logs.filter((l) => Number(l.minutes) > 0).length },
  { id: "serie-3", title: "Warmgelaufen", desc: "3 Tage am Stück gelernt", icon: "flame", goal: 3, value: (d, x) => x.streak },
  { id: "serie-7", title: "Eine Woche Feuer", desc: "7 Tage am Stück gelernt", icon: "flame", goal: 7, value: (d, x) => x.streak },
  { id: "serie-30", title: "Nicht zu stoppen", desc: "30 Tage am Stück gelernt", icon: "flame", goal: 30, value: (d, x) => x.streak },
  { id: "zeit-10", title: "Zehn Stunden", desc: "10 Stunden Lernzeit insgesamt", icon: "hourglass", goal: 10, value: (d, x) => x.hours },
  { id: "zeit-50", title: "Fünfzig Stunden", desc: "50 Stunden Lernzeit insgesamt", icon: "hourglass", goal: 50, value: (d, x) => x.hours },
  { id: "zeit-150", title: "Ein ganzes Modul", desc: "150 Stunden Lernzeit, so viel wie 5 ECTS", icon: "hourglass", goal: 150, value: (d, x) => x.hours },
  { id: "karten-100", title: "Kartenstapler", desc: "100 Karteikarten wiederholt", icon: "card", goal: 100, value: (d, x) => x.reviews },
  { id: "karten-1000", title: "Gedächtnispalast", desc: "1000 Karteikarten wiederholt", icon: "card", goal: 1000, value: (d, x) => x.reviews },
  { id: "frueh-5", title: "Früher Vogel", desc: "5 Abgaben mindestens einen Tag vor der Frist erledigt", icon: "coin", goal: 5, value: (d) => d.homework.filter((h) => DONE_HW.has(h.status) && h.doneAt && h.due && h.doneAt < h.due).length },
  { id: "nach-25", title: "Am Ball", desc: "25 Termine nachbereitet", icon: "check", goal: 25, value: (d) => d.sessions.filter((s) => s.reviewed).length },
  { id: "ziel", title: "Ziel getroffen", desc: "Eine Woche lang das Wochenziel an Lernzeit erreicht", icon: "star", goal: 1, value: (d) => goalWeeks(d.logs, (Number(d.settings?.weeklyGoal) || 0) * 60) },
  { id: "bestanden", title: "Bestanden!", desc: "Die erste Prüfung bestanden", icon: "trophy", goal: 1, value: (d) => d.exams.filter((e) => e.result === "bestanden").length + d.modules.filter((m) => m.status === "bestanden").length },
];

/** Alle Abzeichen mit Fortschritt: { id, title, desc, icon, goal, value, done } */
export function achievements(data) {
  const x = { streak: bestStreak(data.logs), hours: sum(data.logs, (l) => l.minutes) / 60, reviews: cardReviews(data.cards) };
  return BADGES.map(({ value, ...b }) => { const v = Math.floor(value(data, x) * 10) / 10; return { ...b, value: Math.min(v, b.goal), done: v >= b.goal }; });
}

/** Kennzahlen eines Zeitraums (beide Enden eingeschlossen). */
export function periodStats(data, from, to) {
  const inR = (x) => !!x && x >= from && x <= to;
  const held = data.sessions.filter((s) => inR(s.date) && s.date <= iso() && !s.cancelled);
  const days = new Map();
  data.logs.forEach((l) => { if (inR(l.date)) days.set(l.date, (days.get(l.date) || 0) + (Number(l.minutes) || 0)); });
  const best = [...days].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    minutes: sum([...days.values()], (m) => m),
    days: [...days.values()].filter((m) => m > 0).length,
    bestDay: best && best[1] > 0 ? { date: best[0], minutes: best[1] } : null,
    reviewed: data.sessions.filter((s) => inR(s.reviewedAt)).length,
    hwDone: data.homework.filter((h) => inR(h.doneAt)).length,
    held: held.length, heldReviewed: held.filter((s) => s.reviewed).length,
    cards: data.cards.filter((c) => inR(c.lastReview)).length,
  };
}

/**
 * Wochenkarte auf „Heute“: am Sonntag die laufende Woche, am Montag die vergangene. Sonst null.
 * Mit Vergleich zur Woche davor; null, wenn in der Woche nichts passiert ist.
 */
export function weekCard(data, today = iso()) {
  const wd = wdIdx(today);
  if (wd !== 6 && wd !== 0) return null;
  const from = wd === 6 ? weekStart(today) : addDays(weekStart(today), -7);
  const to = addDays(from, 6);
  const cur = periodStats(data, from, to), prev = periodStats(data, addDays(from, -7), addDays(from, -1));
  if (!cur.minutes && !cur.reviewed && !cur.hwDone && !cur.cards) return null;
  return { from, to, current: wd === 6, ...cur, prevMinutes: prev.minutes };
}

/** Lernziele pro Modul (Stunden pro Woche, Feld weeklyGoal am Modul): Lernzeit der laufenden Woche dagegen. */
export function moduleGoals(data, today = iso()) {
  const from = weekStart(today);
  return data.modules.filter((m) => Number(m.weeklyGoal) > 0 && !m.archived).map((m) => {
    const minutes = sum(data.logs.filter((l) => l.moduleId === m.id && l.date >= from && l.date <= today), (l) => l.minutes);
    const goalMin = Math.round(Number(m.weeklyGoal) * 60);
    return { m, minutes, goalMin, done: minutes >= goalMin };
  });
}

/**
 * Schwachstellen: Karten, die oft vergessen werden (mindestens zweimal „Nochmal“ nach dem Lernen)
 * oder laut FSRS sehr schwer sind. Schlimmste zuerst.
 */
export function weakCards(cards) {
  const score = (c) => (Number(c.lapses) || 0) * 2 + Math.max(0, (Number(c.difficulty) || 0) - 6);
  return cards.filter((c) => (Number(c.lapses) || 0) >= 2 || (Number(c.difficulty) || 0) >= 8)
    .sort((a, b) => score(b) - score(a) || (b.lapses || 0) - (a.lapses || 0));
}

/** Schwachstellen nach Tag gruppiert (Karten ohne Tag unter ""), größte Gruppe zuerst. */
export function weakByTag(cards, tagsOf) {
  const acc = new Map();
  cards.forEach((c) => { const tags = tagsOf(c); (tags.length ? tags : [""]).forEach((t) => acc.set(t, (acc.get(t) || 0) + 1)); });
  return [...acc].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* Sonnenauf- und -untergang in München, grob je Monat (Ortszeit, Stunden) */
const SUN = [[8.0, 16.6], [7.5, 17.4], [6.6, 18.2], [6.5, 20.0], [5.6, 20.7], [5.2, 21.2], [5.4, 21.1], [6.1, 20.4], [6.9, 19.4], [7.6, 18.3], [7.4, 16.8], [8.0, 16.3]];

/**
 * Wo Sonne bzw. Mond über der Skyline steht: kind "sun" oder "moon", x 0–1 von links nach rechts,
 * y 0–1 Höhe über dem Horizont (Bogen, 0 beim Auf- und Untergang).
 */
export function skyPos(now = new Date()) {
  const [rise, set] = SUN[now.getMonth()];
  const h = now.getHours() + now.getMinutes() / 60;
  let kind, p;
  if (h >= rise && h < set) { kind = "sun"; p = (h - rise) / (set - rise); }
  else { kind = "moon"; const night = 24 - set + rise; p = ((h >= set ? h - set : h + 24 - set)) / night; }
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return { kind, x: r3(p), y: r3(Math.sin(Math.PI * p)) };
}
