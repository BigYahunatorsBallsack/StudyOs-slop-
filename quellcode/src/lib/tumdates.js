/* Feste Semestertermine der TUM als Fristen: Vorlesungsbeginn und -ende, Rückmeldung (Semesterbeitrag) und Prüfungsanmeldung.
   Sie werden nicht gespeichert, sondern wie die Feiertage abgeleitet (abschaltbar mit `tumDates: false`).
   Quellen (Stand Oktober 2026):
   - tum.de „Termine und Fristen“ (Semester, Vorlesungszeit, Rückmeldung bis 15.02. bzw. 15.08.)
     https://www.tum.de/studium/im-studium/das-studium-organisieren/termine-und-fristen
   - Prüfungsanmeldung: Zeiträume der TUM School of Computation, Information and Technology (CIT); andere Schools
     können abweichen, die TUM veröffentlicht keine zentralen Zeiträume.
     https://www.cit.tum.de/cit/studium/studierende/pruefungsangelegenheiten-module/
   Für das Ende des Sommersemesters 2027 stand der Anmeldezeitraum noch nicht fest. */
import { isTum } from "./holidays.js";
import { addDays, iso } from "./util.js";

/* Semester der TUM (für die Semesterleiste) */
export const TUM_SEMESTERS = [
  { from: "2026-10-01", to: "2027-03-31", label: "WiSe 2026/27" },
  { from: "2027-04-01", to: "2027-09-30", label: "SoSe 2027" },
];

/* Einzelne Tage (`date`) oder Zeiträume (`date` bis `to`) */
export const TUM_DATES = [
  { id: "vl-ws26", date: "2026-10-12", kind: "lecture", title: "Vorlesungsbeginn WiSe 2026/27" },
  { id: "pa-ws26", date: "2026-11-16", to: "2027-01-15", kind: "exam", title: "Prüfungsanmeldung WiSe 2026/27" },
  { id: "ve-ws26", date: "2027-02-05", kind: "lecture", title: "Vorlesungsende WiSe 2026/27" },
  { id: "rm-ss27", date: "2027-02-15", kind: "fee", title: "Rückmeldung SoSe 2027 (Semesterbeitrag)" },
  { id: "pw-ss27", date: "2027-03-08", to: "2027-03-22", kind: "exam", title: "Prüfungsanmeldung Wiederholung" },
  { id: "vl-ss27", date: "2027-04-12", kind: "lecture", title: "Vorlesungsbeginn SoSe 2027" },
  { id: "ve-ss27", date: "2027-07-16", kind: "lecture", title: "Vorlesungsende SoSe 2027" },
  { id: "rm-ws27", date: "2027-08-15", kind: "fee", title: "Rückmeldung WiSe 2027/28 (Semesterbeitrag)" },
];

/** Gelten die TUM-Semestertermine für diese Einstellungen? */
export const tumDatesOn = (settings = {}) => isTum(settings) && settings.tumDates !== false;

/**
 * Termine als einzelne Tage: ein Zeitraum ergibt Beginn und Ende („… beginnt“, „… endet“).
 * @returns {Array<{ id: string, date: string, kind: string, title: string, short: string, end?: boolean }>}
 */
export function uniDates(settings = {}) {
  if (!tumDatesOn(settings)) return [];
  return TUM_DATES.flatMap((x) => (x.to
    ? [{ id: `${x.id}-a`, date: x.date, kind: x.kind, title: `${x.title} beginnt`, short: `${x.title.split(" ")[0]} ab` },
      { id: `${x.id}-b`, date: x.to, kind: x.kind, title: `${x.title} endet`, short: `${x.title.split(" ")[0]} bis`, end: true }]
    : [{ id: x.id, date: x.date, kind: x.kind, title: x.title, short: x.title.split(" ")[0] }]));
}

/** Termine an einem Tag */
export const uniDatesOn = (date, settings = {}) => uniDates(settings).filter((x) => x.date === date);

/**
 * Für „Heute“: Termine in den nächsten `days` Tagen und laufende Zeiträume (z. B. Prüfungsanmeldung bis 15.01.).
 * @returns {Array<{ id: string, date: string, kind: string, title: string, running?: boolean, to?: string }>}
 */
export function upcomingUniDates(settings = {}, today = iso(), days = 14) {
  if (!tumDatesOn(settings)) return [];
  const until = addDays(today, days);
  const soon = uniDates(settings).filter((x) => x.date >= today && x.date <= until);
  const running = TUM_DATES.filter((x) => x.to && x.date < today && x.to > until)
    .map((x) => ({ id: `${x.id}-r`, date: x.to, kind: x.kind, title: `${x.title} läuft`, running: true, to: x.to }));
  return [...running, ...soon].sort((a, b) => a.date.localeCompare(b.date));
}
