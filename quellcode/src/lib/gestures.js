/* Entscheidungen für Wischgesten am Handy (ohne DOM, damit sie sich testen lassen) */

/** Fenster nach unten gezogen und losgelassen: schließen, wenn weit genug (ein Viertel der Höhe, mind. 90 px)
    oder schnell nach unten geschnippt; sonst zurückschnappen. */
export function sheetDragCloses({ dy, ms, height }) {
  if (!(dy > 0)) return false;
  if (dy >= Math.max(90, (height || 0) * 0.25)) return true;
  return dy >= 40 && ms > 0 && dy / ms >= 0.6;
}

/** Seitlich wischen: ein kurzer, deutlich waagerechter Wisch (mind. 70 px, mehr als doppelt so weit wie hoch)? */
export function isSideSwipe({ dx, dy, ms }) {
  return ms < 700 && Math.abs(dx) >= 70 && Math.abs(dx) >= 2.2 * Math.abs(dy);
}

/** Nächster Reiter beim Wischen: nach links (dx < 0) der folgende, nach rechts der vorige; am Rand null (nichts tun) */
export function swipeStep(index, count, dx) {
  if (index < 0 || !dx) return null;
  const j = index + (dx < 0 ? 1 : -1);
  return j >= 0 && j < count ? j : null;
}
