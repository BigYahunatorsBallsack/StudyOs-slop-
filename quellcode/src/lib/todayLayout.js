/* „Heute“ anpassen: Reihenfolge und Sichtbarkeit der Bereiche. Gespeichert in den Einstellungen
   (todayOrder: Liste der Bereiche, todayHidden: ausgeblendete), damit es auf allen Geräten gleich aussieht. */

export const TODAY_BLOCKS = [
  ["timeline", "Zeitstrahl"],
  ["next", "Als Nächstes"],
  ["changes", "Stundenplan-Änderungen"],
  ["morgen", "Morgen (ab 18 Uhr)"],
  ["quick", "Schnelleingabe und „Was jetzt?“"],
  ["minis", "Lernzeit und Serie"],
  ["week", "Wochenkarte (Sonntag und Montag)"],
  ["ziele", "Wochenziele"],
  ["plan", "Tagesplan"],
  ["todo", "Zu erledigen"],
  ["erledigt", "Erledigt heute"],
  ["exams", "Prüfungen"],
  ["fristen", "Uni-Fristen (TUM)"],
  ["commute", "Weg zur Uni"],
  ["mensa", "Mensa"],
];
const IDS = TODAY_BLOCKS.map(([id]) => id);

/** Bereiche in der gewählten Reihenfolge: [{ id, label, hidden }]. Unbekannte fallen weg, neue Bereiche hängen an ihrer Standardstelle. */
export function todayLayout(settings = {}) {
  const saved = Array.isArray(settings.todayOrder) ? settings.todayOrder.filter((id, i, a) => IDS.includes(id) && a.indexOf(id) === i) : [];
  const order = [...saved];
  IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    /* hinter den Bereich einsortieren, der in der Standardreihenfolge davor steht */
    const before = IDS.slice(0, i).reverse().find((b) => order.includes(b));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const hidden = new Set(Array.isArray(settings.todayHidden) ? settings.todayHidden : []);
  return order.map((id) => ({ id, label: TODAY_BLOCKS.find(([k]) => k === id)[1], hidden: hidden.has(id) }));
}

/** Bereich von Position from nach to verschieben; gibt die neue Reihenfolge (ids) zurück. */
export function moveBlock(layout, from, to) {
  const ids = layout.map((b) => b.id);
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const [x] = ids.splice(from, 1);
  ids.splice(to, 0, x);
  return ids;
}

export const isDefaultLayout = (settings = {}) => todayLayout(settings).every((b, i) => b.id === IDS[i] && !b.hidden);
