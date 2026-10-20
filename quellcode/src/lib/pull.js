/* Nach unten ziehen zum Aktualisieren (Heute, Woche): Rechnung zur Geste, die Anzeige steht in ui/pull.jsx */

/** Ab dieser Zugweite (px, gedämpft) wird beim Loslassen aktualisiert */
export const PULL_THRESHOLD = 70;
const PULL_MAX = 110;

/** Sichtbare Zugweite: folgt dem Finger gedämpft, höchstens PULL_MAX */
export const pullOffset = (dy) => (dy > 0 ? Math.min(PULL_MAX, Math.round(dy * 0.6)) : 0);

/**
 * Richtung der Geste nach den ersten Pixeln: „pull“ (deutlich nach unten), „none“ (seitlich oder nach oben,
 * z. B. Wischen zwischen den Bereichen) oder null (noch zu kurz, um es zu sagen).
 */
export function pullIntent(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return null;
  return dy > 0 && dy > 1.5 * Math.abs(dx) ? "pull" : "none";
}
