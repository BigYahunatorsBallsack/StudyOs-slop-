/* Wöchentliche Cloud-Sicherung: ein verschlüsselter Schnappschuss pro Kalenderwoche im privaten Speicher
   (gleicher Bucket und Schlüssel wie die Anhänge). Die letzten KEEP_WEEKS Wochen bleiben erhalten. */
import { normalizeImport } from "./data.js";
import { isoYearWeek } from "./util.js";

export const KEEP_WEEKS = 8;
const PREFIX = "sicherung-";

export { isoYearWeek };

/** Dateiname der Sicherung für die Woche eines Datums, z. B. "sicherung-2026-43" */
export function backupName(dateStr) {
  const { year, week } = isoYearWeek(dateStr);
  return `${PREFIX}${year}-${String(week).padStart(2, "0")}`;
}

/** { year, week } aus dem Dateinamen oder null */
export function parseBackupName(name) {
  const m = new RegExp(`^${PREFIX}(\\d{4})-(\\d{2})$`).exec(String(name || ""));
  return m ? { year: Number(m[1]), week: Number(m[2]) } : null;
}

/** Ältere Sicherungen, die über die aufbewahrten Wochen hinausgehen */
export function backupsToPrune(names, keep = KEEP_WEEKS) {
  return names.filter(parseBackupName).sort().reverse().slice(keep);
}

export const encodeBackup = (data) => new TextEncoder().encode(JSON.stringify(data));
export const decodeBackup = (bytes) => normalizeImport(JSON.parse(new TextDecoder().decode(bytes)));
