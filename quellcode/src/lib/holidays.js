/* Feiertage (Bayern) und vorlesungsfreie Zeit. Termine an solchen Tagen fallen aus, wöchentliche Serien überspringen sie.
   Feiertage werden für jedes Jahr berechnet (Ostern nach Gauß), die vorlesungsfreie Zeit kommt aus den Einstellungen
   (`breaks`) und, an der TUM, aus den bekannten Semesterterminen. */
import { addDays, iso } from "./util.js";

/** Ostersonntag eines Jahres (gregorianisch, Algorithmus von Meeus/Jones/Butcher) als ISO-Datum. */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cache = new Map();
/** Gesetzliche Feiertage in Bayern (Mariä Himmelfahrt gilt in den meisten Gemeinden, auch München und Freising): Datum → Name */
export function holidaysOf(y) {
  if (cache.has(y)) return cache.get(y);
  const e = easter(y), fix = (md) => `${y}-${md}`;
  const map = new Map([
    [fix("01-01"), "Neujahr"], [fix("01-06"), "Heilige Drei Könige"],
    [addDays(e, -2), "Karfreitag"], [addDays(e, 1), "Ostermontag"], [fix("05-01"), "Tag der Arbeit"],
    [addDays(e, 39), "Christi Himmelfahrt"], [addDays(e, 50), "Pfingstmontag"], [addDays(e, 60), "Fronleichnam"],
    [fix("08-15"), "Mariä Himmelfahrt"], [fix("10-03"), "Tag der Deutschen Einheit"], [fix("11-01"), "Allerheiligen"],
    [fix("12-25"), "1. Weihnachtstag"], [fix("12-26"), "2. Weihnachtstag"],
  ]);
  cache.set(y, map);
  return map;
}

/* Nur für echte Daten „JJJJ-…“: aus kaputten Werten älterer Datenstände würde sonst ein ungültiges Datum (RangeError) */
export const holidayOf = (date) => (/^\d{4}-/.test(String(date || "")) ? holidaysOf(Number(date.slice(0, 4))).get(date) || null : null);

/* Vorlesungsfreie Zeit an der TUM laut tum.de („Termine und Fristen“); Weihnachten jedes Jahr vom 24.12. bis 6.1. */
export const TUM_BREAKS = [
  { from: "2027-02-06", to: "2027-04-11", label: "Semesterferien" },
  { from: "2027-07-17", to: "2027-09-30", label: "Semesterferien" },
];
export const isTum = (settings) => /\bTUM\b|Technische Universität München/i.test(settings.university || "");

/** Alle vorlesungsfreien Zeiträume: eigene aus den Einstellungen, an der TUM zusätzlich die bekannten (abschaltbar). */
export function breaksOf(settings = {}) {
  const own = (Array.isArray(settings.breaks) ? settings.breaks : []).filter((b) => b && /^\d{4}-\d{2}-\d{2}$/.test(b.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(b.to || "") && b.from <= b.to);
  return isTum(settings) && settings.tumBreaks !== false ? [...own, ...TUM_BREAKS] : own;
}

function christmas(date) {
  const md = date.slice(5);
  return md >= "12-24" || md <= "01-06";
}

/**
 * Vorlesungsfreier Zeitraum, in dem `date` liegt (Weihnachtspause, Semesterferien, eigene), oder null.
 * @returns {{ kind: "break", label: string } | null}
 */
export function breakOf(date, settings = {}) {
  if (!date) return null;
  if (settings.christmasBreak !== false && isTum(settings) && christmas(date)) return { kind: /** @type {const} */ ("break"), label: "Weihnachtspause" };
  const b = breaksOf(settings).find((x) => x.from <= date && date <= x.to);
  return b ? { kind: /** @type {const} */ ("break"), label: String(b.label || "vorlesungsfrei") } : null;
}

/**
 * Warum an diesem Tag keine Lehrveranstaltungen sind, oder null. Ein Feiertag geht vor.
 * @returns {{ kind: "holiday" | "break", label: string } | null}
 */
export function offDay(date, settings = {}) {
  const h = holidayOf(date);
  return h ? { kind: /** @type {const} */ ("holiday"), label: h } : breakOf(date, settings);
}

/** Nur ganze vorlesungsfreie Zeiträume (keine einzelnen Feiertage): darin gibt es keine Übungsblätter. */
export const inBreak = (date, settings = {}) => !!breakOf(date, settings);

/**
 * Selbst angelegte, künftige Termine an Feiertagen oder in der vorlesungsfreien Zeit als „fällt aus“ markieren.
 * Termine aus dem Stundenplan-Abo bleiben, wie TUMonline sie liefert. Jeder Termin wird nur einmal geprüft (`offChecked`),
 * damit ein von Hand wieder eingeschalteter Termin nicht erneut ausfällt.
 * @returns {{ sessions: any[], count: number }}
 */
export function cancelOffDays(sessions, settings = {}, today = iso()) {
  let count = 0;
  const out = sessions.map((s) => {
    if (s.offChecked || s.feedKey || s.cancelled || !s.date || s.date < today || s.type === "Sonstiges") return s;
    const off = offDay(s.date, settings);
    if (!off) return s;
    count++;
    return { ...s, cancelled: true, offChecked: true, offReason: off.label };
  });
  return { sessions: count ? out : sessions, count };
}
