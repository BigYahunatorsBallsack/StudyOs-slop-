/* Befehle für die Suche (Strg + K): „neue Abgabe“, „Timer DS“, „Einstellungen“ … */
import { matchModule, norm } from "./quickadd.js";
import { matchSettings } from "./settings.js";

/* [Titel, Suchwörter, Aktion] */
/** @type {Array<[string, string, { type: string, kind?: string, sub?: string, tab?: string, moduleId?: string, group?: string, item?: string }]>} */
const BASE = [
  ["Neue Hausaufgabe", "abgabe blatt hausaufgabe anlegen neu", { type: "form", kind: "homework" }],
  ["Neuer Termin", "termin vorlesung übung anlegen neu", { type: "form", kind: "session" }],
  ["Neue Notiz", "notiz anlegen neu", { type: "form", kind: "note" }],
  ["Lernzeit eintragen", "lerneinheit lernzeit eintragen neu", { type: "form", kind: "log" }],
  ["Neue Prüfung", "prüfung klausur anlegen neu", { type: "form", kind: "exam" }],
  ["Neue Karteikarte", "karte karteikarte anlegen neu", { type: "form", kind: "card" }],
  ["Neues Modul", "modul anlegen neu", { type: "form", kind: "module" }],
  ["Schnelleingabe", "schnelleingabe plus eingabe", { type: "quick" }],
  ["Timer starten", "timer fokus pomodoro starten lernen", { type: "timer" }],
  ["Was jetzt?", "was jetzt vorschlag", { type: "whatNow" }],
  ["Karten lernen", "karten karteikarten lernen wiederholen", { type: "learn", sub: "karten" }],
  ["Prüfungen und Lernplan", "prüfungen lernplan klausur", { type: "learn", sub: "pruefungen" }],
  ["Lerneinheiten", "lerneinheiten lernzeit liste", { type: "learn", sub: "einheiten" }],
  ["Heute", "heute start", { type: "tab", tab: "heute" }],
  ["Module", "module", { type: "tab", tab: "module" }],
  ["Woche", "woche kalender stundenplan", { type: "tab", tab: "woche" }],
  ["Wochenrückblick", "rückblick statistik woche", { type: "more", sub: "rueckblick" }],
  ["Erfolge", "erfolge abzeichen", { type: "more", sub: "erfolge" }],
  ["Alle Hausaufgaben", "hausaufgaben abgaben liste alle", { type: "more", sub: "hausaufgaben" }],
  ["Studienfortschritt", "studium fortschritt ects noten gop", { type: "more", sub: "studium" }],
  ["Einstellungen", "einstellungen daten sicherung sync export", { type: "more", sub: "daten" }],
  ["Papierkorb", "papierkorb gelöscht wiederherstellen löschen", { type: "more", sub: "daten", group: "papierkorb", item: "trash" }],
  ["Was ist neu", "was ist neu neuigkeiten update version änderungen", { type: "more", sub: "neu" }],
  ["Tastenkürzel", "tastenkürzel hilfe shortcuts", { type: "help" }],
];

/** Passende Befehle zu einer Eingabe. Leer: die häufigsten. „timer ds“ startet den Timer für das Modul. */
export function matchCommands(q, modules = [], max = 5) {
  const words = norm(String(q || "")).split(/\s+/).filter(Boolean);
  if (!words.length) return BASE.filter(([, , a]) => ["homework", "note", "log"].includes(a.kind) || a.type === "timer" || a.type === "quick").map(toCmd);
  /* Timer mit Modul: „timer analysis“, „fokus DS“ */
  if (/^(timer|fokus|lernen)$/.test(words[0]) && words.length > 1) {
    const m = matchModule(words.slice(1).join(""), modules) || matchModule(words[1], modules);
    if (m) return [{ id: "timer-" + m.id, title: `Timer: ${m.name}`, sub: "Fokusphase starten", act: { type: "timer", moduleId: m.id } }];
  }
  const out = BASE.filter(([title, extra]) => { const hay = norm(`${title} ${extra}`); return words.every((w) => hay.split(/\s+/).some((x) => x.startsWith(w))); }).map(toCmd);
  /* einzelne Einstellungen: springt in die Gruppe unter Daten & Einstellungen */
  const sets = matchSettings(q, max).filter((h) => !out.some((c) => c.title === h.label))
    .map((h) => ({ id: "einstellung-" + h.id, title: h.label, sub: `Einstellung · ${h.groupTitle}`, act: { type: "more", sub: "daten", group: h.group, item: h.id } }));
  return [...out.slice(0, max), ...sets].slice(0, max);
}

const toCmd = ([title, , act]) => ({ id: title, title, sub: "Aktion", act });
