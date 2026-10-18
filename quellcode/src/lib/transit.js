/* Bus/Bahn zur Uni: welche Abfahrt reicht für die erste Lehrveranstaltung? */
import { addDays, iso } from "./util.js";

export const DEFAULT_COMMUTE = { station: { id: "de:09184:2140", name: "Haar" }, line: "230", towards: "Forschungszentrum", travel: 50, walk: 5, buffer: 10 };

/** Pendel-Einstellungen; ohne eigene Angaben (an der TUM) die 230 ab Haar */
export const commuteOf = (settings = {}) => (settings.commute === null ? null : { ...DEFAULT_COMMUTE, ...(settings.commute || {}) });

/** Passt eine Abfahrt zu Linie und Richtung? */
export const matches = (d, c) => (!c.line || d.line.toLowerCase() === String(c.line).toLowerCase()) && (!c.towards || d.destination.toLowerCase().includes(String(c.towards).toLowerCase()));

/** Erste nicht ausfallende Lehrveranstaltung heute (noch nicht begonnen) oder am nächsten Tag mit Terminen (bis 3 Tage voraus) */
export function nextFirstSession(sessions, now = new Date()) {
  const today = iso(now), hm = now.toTimeString().slice(0, 5);
  for (let i = 0; i <= 3; i++) {
    const day = addDays(today, i);
    const list = sessions.filter((s) => s.date === day && !s.cancelled).sort((a, b) => a.start.localeCompare(b.start));
    const first = list[0];
    if (!first) continue;
    if (i === 0 && first.start <= hm) continue; /* heute schon angefangen: dann ist der Weg erledigt */
    return first;
  }
  return null;
}

const at = (date, hm) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };

/** Zeitfenster der Abfrage: ab einer Stunde vor der spätesten passenden Abfahrt (Minuten ab jetzt) */
export function queryOffset(session, c, now = new Date()) {
  const latest = at(session.date, session.start) - (c.buffer + c.travel) * 60000;
  return Math.max(0, Math.round((latest - now.getTime()) / 60000) - 60);
}

/**
 * Empfehlung: späteste passende Abfahrt, mit der man (Fahrzeit + Puffer) rechtzeitig ankommt.
 * @returns null oder { dep, leaveAt, arriveAt, session, spare } (Zeiten in ms)
 */
export function recommend(departures, session, c) {
  if (!session) return null;
  const deadline = at(session.date, session.start) - c.buffer * 60000;
  const ok = departures.filter((d) => matches(d, c) && !d.cancelled && d.time + c.travel * 60000 <= deadline).sort((a, b) => b.time - a.time);
  const dep = ok[0];
  if (!dep) return null;
  return { dep, session, leaveAt: dep.time - c.walk * 60000, arriveAt: dep.time + c.travel * 60000, spare: Math.round((deadline - dep.time - c.travel * 60000) / 60000) };
}

export const hhmm = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
