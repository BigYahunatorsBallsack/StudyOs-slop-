/* Probeklausur aus Karteikarten: zufällige Auswahl, Auswertung nach Thema bzw. Tag */
import { parseTags } from "./cards.js";

/** Auswahl mischen; höchstens n Karten, schwierige (hohe Schwierigkeit / Fehler) bevorzugt in der Mischung */
export function pickCards(cards, n, rand = Math.random) {
  const weighted = cards.map((c) => ({ c, k: rand() * (1 + (Number(c.difficulty) || 5) / 10 + (Number(c.lapses) || 0) * 0.3) }));
  return weighted.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.c);
}

/**
 * Auswertung: answers = { cardId: 0 | 0.5 | 1 } (nicht gewusst, teilweise, gewusst)
 * @returns { score, total, pct, groups: [{ label, score, total, pct }] schwächste zuerst, wrong: [card] }
 */
export function evaluate(cards, answers, topicName = () => "") {
  const groups = new Map();
  let score = 0, total = 0;
  const wrong = [];
  for (const c of cards) {
    if (!(c.id in answers)) continue;
    const v = answers[c.id];
    score += v; total += 1;
    if (v < 1) wrong.push(c);
    const label = topicName(c.topicId) || parseTags(c.tags)[0] || "Ohne Thema";
    const g = groups.get(label) || { label, score: 0, total: 0 };
    g.score += v; g.total += 1;
    groups.set(label, g);
  }
  const list = [...groups.values()].map((g) => ({ ...g, pct: g.score / g.total })).sort((a, b) => a.pct - b.pct || b.total - a.total);
  return { score, total, pct: total ? score / total : 0, groups: list, wrong };
}

/** Grobe Note aus Prozent (übliches Schema: 50 % = 4,0, 90 % = 1,0) */
export function gradeOf(pct) {
  const steps = [[0.9, 1.0], [0.85, 1.3], [0.8, 1.7], [0.75, 2.0], [0.7, 2.3], [0.65, 2.7], [0.6, 3.0], [0.55, 3.3], [0.5, 4.0]];
  for (const [p, g] of steps) if (pct >= p) return g;
  return 5.0;
}
