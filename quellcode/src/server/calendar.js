/* Kalender-Abo der Fristen (iCal), erzeugt aus den Fristen, die die App für Erinnerungen hochlädt. */
import { zonedInstant } from "./reminders.js";

const LABEL = { homework: "Abgabe", exam: "Prüfung", register: "Anmeldeschluss", retake: "Wiederholungsprüfung" };
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (date) => date.replace(/-/g, "");
const nextDay = (date) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/* Zeilen über 75 Zeichen falten (RFC 5545) */
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };

export function buildDeadlineIcs(deadlines, tz = "Europe/Berlin", now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyOS//Fristen//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:StudyOS Fristen", "X-PUBLISHED-TTL:PT3H", "REFRESH-INTERVAL;VALUE=DURATION:PT3H"];
  for (const x of deadlines || []) {
    const label = LABEL[x.kind];
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) continue;
    const what = x.kind === "homework" ? `${label}: ${x.title}${x.module ? ` (${x.module})` : ""}` : `${label}: ${x.module || x.title}`;
    lines.push("BEGIN:VEVENT", `UID:${esc(`${x.kind}-${x.id}`)}@studyos`, `DTSTAMP:${utc(now)}`, `SUMMARY:${esc(what)}`);
    if (/^\d{2}:\d{2}$/.test(x.time || "")) {
      const start = zonedInstant(x.date, x.time, tz);
      const end = new Date(start.getTime() + (x.kind === "exam" ? 120 : 30) * 60000);
      lines.push(`DTSTART:${utc(x.kind === "homework" ? new Date(start.getTime() - 30 * 60000) : start)}`, `DTEND:${utc(x.kind === "homework" ? start : end)}`);
    } else lines.push(`DTSTART;VALUE=DATE:${day(x.date)}`, `DTEND;VALUE=DATE:${day(nextDay(x.date))}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
