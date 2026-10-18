/* Änderungen an einem Termin auf die folgenden gleichen Termine übertragen.
   „Gleich“: gleiche Serie (selbst angelegt) oder gleiches Modul, gleiche Art, gleicher Wochentag
   und gleiche Anfangszeit (z. B. wöchentliche Termine aus dem Stundenplan-Abo). */
import { wdIdx } from "./util.js";

export const SERIES_FIELDS = ["type", "start", "end", "room"];

/** Folgende Termine, die zu `s` gehören (nach dem Datum von `s`, nicht ausgefallen). */
export function followingSimilar(sessions, s) {
  if (!s || !s.id || !s.date) return [];
  const wd = wdIdx(s.date);
  return sessions.filter((x) => x.id !== s.id && x.date > s.date && !x.cancelled && (
    (s.seriesId && x.seriesId === s.seriesId) ||
    (x.moduleId === s.moduleId && x.type === s.type && x.start === s.start && wdIdx(x.date) === wd)
  ));
}

/* Felder, die vom Nutzer geändert wurden, merken: Das Stundenplan-Abo überschreibt sie nicht mehr. */
const lock = (x, fields) => (x.feedKey && fields.length ? { ...x, locked: [...new Set([...(x.locked || []), ...fields])] } : x);

/**
 * Speichert die Änderungen an einem Termin; mit `applyToFollowing` werden die geänderten Felder
 * (Art, Beginn, Ende, Raum) auch in die folgenden gleichen Termine übernommen.
 * @returns {{ sessions, count }} count = Anzahl der zusätzlich geänderten Termine
 */
export function saveSessionEdit(sessions, edited, applyToFollowing) {
  const orig = sessions.find((x) => x.id === edited.id);
  if (!orig) return { sessions, count: 0 };
  const changed = SERIES_FIELDS.filter((k) => (orig[k] ?? "") !== (edited[k] ?? ""));
  const targets = applyToFollowing && changed.length ? new Set(followingSimilar(sessions, orig).map((x) => x.id)) : new Set();
  const patch = Object.fromEntries(changed.map((k) => [k, edited[k]]));
  return {
    sessions: sessions.map((x) => (x.id === edited.id ? lock(edited, changed) : targets.has(x.id) ? lock({ ...x, ...patch }, changed) : x)),
    count: targets.size,
  };
}
