/* Daten & Einstellungen: Gruppen, Suchindex und Sprung zu einer Einstellung (auch aus Strg + K) */
import { norm } from "./quickadd.js";

/* Reihenfolge = Reihenfolge auf der Seite; Seltenes und Gefährliches unten. [id, Titel, Kurzinhalt] */
/** @type {Array<[string, string, string]>} */
export const SETTING_GROUPS = [
  ["darstellung", "Darstellung & Klang", "Farbpalette, Schrift, Animationen, Töne"],
  ["benachrichtigungen", "Benachrichtigungen", "Push-Erinnerungen, Timer-Signal, App-Symbol"],
  ["studium", "Studium", "Name, Studiengang, Ziele, Mensa, Ferien"],
  ["kalender", "Kalender & Abos", "Stundenplan-Abo, Moodle, Artemis, ICS"],
  ["weg", "Weg zur Uni", "Öffis, Auto, Campus"],
  ["cloud", "Cloud & Sync", "Anmelden, Abgleich, Cloud-Sicherung"],
  ["sicherheit", "Sicherheit", "App-Sperre mit Fingerabdruck oder Face ID"],
  ["sicherung", "Sicherung & Daten", "Export, Wiederherstellen, Import"],
  ["papierkorb", "Papierkorb & Aufräumen", "Gelöschtes zurückholen, Doppeltes finden"],
  ["zuruecksetzen", "Zurücksetzen", "Beispieldaten, alles löschen"],
];
export const groupTitle = (id) => SETTING_GROUPS.find((g) => g[0] === id)?.[1] || "";

/* Suchindex: [id, Gruppe, Bezeichnung, Stichwörter]. Die id steht auf der Seite als data-set="…" */
/** @type {Array<[string, string, string, string]>} */
export const SETTINGS = [
  ["palette", "darstellung", "Farbpalette", "farbe palette synthwave gameboy bernstein cga papier hell sonne draußen look theme"],
  ["size", "darstellung", "Schriftgröße", "schrift größe kompakt groß text"],
  ["motion", "darstellung", "Animationen", "animation bewegung pixel neon scan"],
  ["wide", "darstellung", "Heute und Woche nebeneinander", "breit bildschirm pc layout nebeneinander"],
  ["sfx", "darstellung", "8-Bit-Klickgeräusche", "ton geräusch klang sound münze fanfare"],
  ["vibrate", "darstellung", "Vibration beim Abhaken", "vibration vibrieren haptik"],
  ["push", "benachrichtigungen", "Push-Erinnerungen", "push erinnerung benachrichtigung abgabe prüfung anmeldeschluss testnachricht"],
  ["pushMorning", "benachrichtigungen", "Tagesüberblick am Morgen", "morgen push uhrzeit überblick"],
  ["pushReviews", "benachrichtigungen", "Abends ans Nachbereiten erinnern", "nachbereiten push abend"],
  ["pushAttended", "benachrichtigungen", "„Heute besucht?“ am Abend", "besucht push abend"],
  ["pushChanges", "benachrichtigungen", "Stundenplan-Änderungen melden", "raum uhrzeit änderung ausfall push abo"],
  ["pushBlocks", "benachrichtigungen", "Vor Lernblöcken erinnern", "lernblock push"],
  ["pushWeekly", "benachrichtigungen", "Wochenrückblick am Sonntag", "sonntag rückblick ausblick push"],
  ["pushCommute", "benachrichtigungen", "Verspätung auf dem Weg zur Uni", "verspätung ausfall mvg push weg"],
  ["pushLeave", "benachrichtigungen", "„Jetzt losgehen“", "losgehen abfahrt push weg"],
  ["sound", "benachrichtigungen", "Signalton bei Timer-Ende", "timer ton signal alarm vibration"],
  ["badge", "benachrichtigungen", "Zahl am App-Symbol", "badge symbol zahl icon"],
  ["name", "studium", "Dein Name", "name begrüßung"],
  ["uni", "studium", "Hochschule", "uni universität tum"],
  ["program", "studium", "Studiengang", "studiengang fach"],
  ["plan", "studium", "Studienplan", "studienplan curriculum gop vorlage"],
  ["mensa", "studium", "Mensa auf „Heute“", "mensa essen speiseplan"],
  ["ects", "studium", "ECTS-Ziel", "ects ziel punkte"],
  ["threshold", "studium", "Warnung unter Nachbereitung", "schwelle prozent warnung nachbereitung"],
  ["weekly", "studium", "Wochenziel Lernzeit", "wochenziel stunden lernzeit"],
  ["weeks", "studium", "Semesterwochen", "semester wochen prüfungsphase"],
  ["tumDates", "studium", "Semestertermine der TUM als Fristen", "uni fristen tum semester rückmeldung semesterbeitrag prüfungsanmeldung vorlesungsbeginn vorlesungsende"],
  ["breaks", "studium", "Feiertage und vorlesungsfreie Zeit", "ferien feiertag vorlesungsfrei semesterferien weihnachten"],
  ["feed", "kalender", "Stundenplan-Abo", "tumonline abo ical kalender stundenplan"],
  ["moodle", "kalender", "Moodle-Abgaben", "moodle abgaben abo"],
  ["artemis", "kalender", "Artemis-Abgaben", "artemis abgaben"],
  ["calfeed", "kalender", "Fristen im Handy-Kalender", "kalender abo google apple outlook link fristen"],
  ["icsImport", "kalender", "Kalender importieren (ICS)", "ics import datei kalender"],
  ["icsExport", "kalender", "Kalender exportieren", "ics export datei kalender"],
  ["commute", "weg", "Weg zur Uni", "öffis s6 bus auto campus garching weihenstephan abfahrt fußweg parken pendeln"],
  ["cloud", "cloud", "Cloud-Sync", "cloud sync anmelden passphrase konto synchronisieren abmelden geräte"],
  ["cloudBackup", "cloud", "Cloud-Sicherung", "cloud sicherung wöchentlich backup"],
  ["export", "sicherung", "Sicherung exportieren", "export backup datei json verschlüsseln passphrase"],
  ["snapshots", "sicherung", "Wiederherstellungspunkte", "wiederherstellung snapshot zwischenstand"],
  ["storage", "sicherung", "Speicher auf diesem Gerät", "speicher platz mb"],
  ["backupDays", "sicherung", "Erinnerung an Sicherung", "backup erinnerung tage sicherung"],
  ["import", "sicherung", "Sicherung wiederherstellen (Import)", "import backup einspielen zusammenführen ersetzen"],
  ["applock", "sicherheit", "App-Sperre", "sperre sperren fingerabdruck face id pin passkey schutz"],
  ["trash", "papierkorb", "Papierkorb", "papierkorb gelöscht wiederherstellen leeren"],
  ["cleanup", "papierkorb", "Aufräumen", "aufräumen doppelt duplikate leere notizen verwaist bereinigen"],
  ["demo", "zuruecksetzen", "Beispieldaten laden", "beispieldaten demo ausprobieren"],
  ["wipe", "zuruecksetzen", "Alle Daten löschen", "löschen zurücksetzen reset alles"],
];

/** Passende Einstellungen: jedes Wort muss einen Wortanfang in Bezeichnung, Stichwörtern oder Gruppentitel treffen. */
export function matchSettings(q, max = 8) {
  const words = norm(String(q || "")).split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const [id, group, label, extra] of SETTINGS) {
    const label0 = norm(label).replace(/[„“"()]/g, "");
    const hay = `${label0} ${norm(extra)} ${norm(groupTitle(group))}`.split(/[\s\-&]+/).filter(Boolean);
    if (!words.every((w) => hay.some((x) => x.startsWith(w)))) continue;
    /* Treffer in der Bezeichnung zuerst, ganze Wörter vor Wortanfängen */
    const lw = label0.split(/[\s\-]+/);
    const score = words.reduce((n, w) => n + (lw.includes(w) ? 2 : lw.some((x) => x.startsWith(w)) ? 1 : 0), 0);
    hits.push({ id, group, label, groupTitle: groupTitle(group), score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, max);
}

/* Zuletzt geöffneter Bereich, nur auf diesem Gerät */
const KEY = "studyos-einstellungen-bereich";
export const readGroup = () => { try { const v = localStorage.getItem(KEY) || ""; return SETTING_GROUPS.some((g) => g[0] === v) ? v : ""; } catch { return ""; } };
export const rememberGroup = (id) => { try { localStorage.setItem(KEY, id || ""); } catch { /* egal */ } };

/* Sprung zu einer Einstellung: wird beim nächsten Öffnen der Seite abgeholt bzw. sofort, wenn sie schon offen ist */
let pending = null;
export const EVENT = "studyos-einstellung";
export function requestSettings(group, item = "") {
  pending = { group, item };
  rememberGroup(group);
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: pending })); } catch { /* ohne Fenster (Tests) */ }
}
export const takeRequest = () => { const p = pending; pending = null; return p; };
