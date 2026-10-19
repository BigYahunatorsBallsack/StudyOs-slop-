

export const DATA_VERSION = 3;
export const EXAM_RESULTS = ["offen", "bestanden", "nicht bestanden"];

/* ---------------- Konstanten ---------------- */
export const PALETTE = ["#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#2dd4bf", "#fb923c", "#a3e635", "#f472b6", "#60a5fa"];

export const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export const WD_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const MODULE_STATUS = ["geplant", "belegt", "bestanden", "nicht bestanden"];

export const SESSION_TYPES = ["Vorlesung", "Übung", "Tutorium", "Zentralübung", "Praktikum", "Sonstiges"];

export const HW_STATUS = ["ausgegeben", "in Arbeit", "bearbeitet", "abgegeben", "bewertet"];

export const DONE_HW = new Set(["bearbeitet", "abgegeben", "bewertet"]);

export const TOPIC_STATES = ["nicht begonnen", "gelernt", "geübt", "sicher"];

export const LOG_KINDS = ["Nacharbeiten", "Vorbereiten", "Übung/Hausaufgabe", "Klausurvorbereitung", "Karteikarten", "Sonstiges"];

export const COLLS = ["modules", "sessions", "homework", "topics", "logs", "notes", "cards", "exams", "blocks"];

export const COLL = { module: "modules", session: "sessions", homework: "homework", topic: "topics", log: "logs", note: "notes", card: "cards", exam: "exams", block: "blocks" };

export const RING_COLORS = { review: "#38bdf8", hw: "#34d399", topics: "#fbbf24" };

/* defaultsRev 2: Studiengang, Studienplan, Mensa und Weg zur Uni starten leer (vorher persönliche Vorgaben, siehe upgradeSettings) */
export const DEFAULT_SETTINGS = { targetEcts: 180, threshold: 70, weeklyGoal: 0, sound: true, backupDays: 7, name: "", university: "TUM", program: "", curriculum: "", mensa: "", commute: null, theme: "dark", retroMotion: "pixel", defaultsRev: 2 };

export const TIMER_KEY = "studyos-timer-v1";
