import { DONE_HW } from "./constants.js";
import { isActive } from "./data.js";
import { addDays, diffDays, iso, wdIdx, weekStart } from "./util.js";
import { uniDates } from "./tumdates.js";

/* ICS-Parser (z. B. Kalender-Export aus TUMonline) */
export function parseICS(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  /** @type {any[]} */ const events = []; /** @type {any} */ let cur = null;
  /* in einem Durchgang, sonst würde aus „\\n“ (Backslash, dann n) ein Leerzeichen */
  const unesc = (v) => v.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? " " : c)).trim();
  const parseDT = (v) => {
    const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?/.exec(v || ""); if (!m) return null;
    let d = m[4] ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : new Date(+m[1], +m[2] - 1, +m[3]);
    if (m[7] && m[4]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: iso(d), time: m[4] ? hm(d) : "", ...(m[7] && m[4] && { utc: d.getTime() }) };
  };
  const hm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  let alarm = false;
  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) { cur = /** @type {any} */ ({ exdates: [] }); alarm = false; continue; }
    if (line.startsWith("END:VEVENT")) { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    /* Erinnerungen (VALARM) haben eigene SUMMARY/DESCRIPTION, die nicht den Termin überschreiben dürfen */
    if (line.startsWith("BEGIN:VALARM")) { alarm = true; continue; }
    if (line.startsWith("END:VALARM")) { alarm = false; continue; }
    if (alarm) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).split(";")[0].toUpperCase(), val = line.slice(i + 1);
    if (key === "SUMMARY") cur.summary = unesc(val);
    else if (key === "LOCATION") cur.location = unesc(val);
    else if (key === "CATEGORIES") cur.categories = unesc(val);
    else if (key === "DESCRIPTION") cur.description = unesc(val);
    else if (key === "URL") cur.url = val.trim();
    else if (key === "DTSTART") cur.start = parseDT(val);
    else if (key === "DTEND") cur.end = parseDT(val);
    else if (key === "RRULE") cur.rrule = val;
    else if (key === "EXDATE") val.split(",").forEach((x) => { const p = parseDT(x); if (p) cur.exdates.push(p.date); });
    else if (key === "UID") cur.uid = val.trim();
    else if (key === "STATUS") cur.cancelled = /CANCELLED/i.test(val);
    else if (key === "RECURRENCE-ID") cur.recurrence = parseDT(val)?.date || null;
  }
  /* Geänderte Einzeltermine einer Serie (RECURRENCE-ID) ersetzen das jeweilige Serienvorkommen */
  const overridden = new Set(events.filter((e) => e.recurrence && e.uid).map((e) => `${e.uid}|${e.recurrence}`));
  const out = [];
  for (const e of events) {
    if (!e.start) continue;
    const uid = e.uid || `${e.summary || ""}|${e.start.date}|${e.start.time}`;
    const base = { uid, cancelled: !!e.cancelled, summary: e.summary || "Ohne Titel", room: e.location || "", start: e.start.time || "08:00", end: e.end?.time || e.start.time || "10:00", course: e.categories || "", allDay: !e.start.time, description: e.description || "", url: /^https?:\/\//i.test(e.url || "") ? e.url : "" };
    if (e.rrule && /FREQ=WEEKLY/i.test(e.rrule)) {
      const get = (k) => (new RegExp(k + "=([^;]+)", "i").exec(e.rrule) || [])[1];
      const until = get("UNTIL") ? parseDT(get("UNTIL"))?.date : null;
      const count = get("COUNT") ? +get("COUNT") : null;
      const step = (+get("INTERVAL") || 1) * 7;
      const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
      const byday = (get("BYDAY") || "").split(",").map((x) => DAYS.indexOf(x.replace(/[^A-Za-z]/g, "").slice(-2).toUpperCase())).filter((i) => i >= 0);
      const wdays = byday.length ? [...new Set(byday)].sort((a, b) => a - b) : [wdIdx(e.start.date)];
      const maxWeeks = until || count ? 120 : 20; /* ohne Ende: ein Semester vorausplanen */
      let weekMon = weekStart(e.start.date), n = 0, weeks = 0;
      outer: while (weeks < maxWeeks && (!until || weekMon <= until)) {
        for (const wd of wdays) {
          const d = addDays(weekMon, wd);
          if (d < e.start.date) continue;
          if ((until && d > until) || (count && n >= count)) break outer;
          n++;
          /* Serie mit UTC-Beginn (…Z): Jedes Vorkommen liegt zur selben UTC-Zeit (RFC 5545), über die Zeitumstellung
             hinweg also eine Stunde früher oder später nach Ortszeit. Mit Ortszeit/TZID bleibt die Uhrzeit gleich. */
          const shift = e.start.utc ? diffDays(e.start.date, d) * 86400000 : 0;
          const at = shift ? new Date(e.start.utc + shift) : null, end = at && e.end?.utc ? new Date(e.end.utc + shift) : null;
          const occ = at ? { ...base, date: iso(at), start: hm(at), ...(end && { end: hm(end) }) } : { ...base, date: d };
          if (!e.exdates.includes(occ.date) && !overridden.has(`${uid}|${occ.date}`)) out.push({ ...occ, occurrence: occ.date });
        }
        weekMon = addDays(weekMon, step); weeks++;
      }
    } else out.push({ ...base, date: e.start.date, occurrence: e.recurrence || e.start.date });
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/* Zeilen über 75 Byte (UTF-8) umbrechen, Folgezeilen mit einem Leerzeichen (RFC 5545, 3.1); Zeichen bleiben ganz */
const enc = new TextEncoder();
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export const guessType = (s) => /zentral/i.test(s) ? "Zentralübung" : /tutor/i.test(s) ? "Tutorium" : /übung|uebung|\bUE\b|exercise/i.test(s) ? "Übung" : /praktikum/i.test(s) ? "Praktikum" : "Vorlesung";

/* ICS-Export: Abgaben, Prüfungen und Termine für den Handy-Kalender (mit Erinnerungen) */
export function buildICS(data, { homework = true, hw = homework, exams = true, sessions = false, uni = true } = {}) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n|\r/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const d8 = (s) => s.replace(/-/g, "");
  const t6 = (s) => (s || "00:00").replace(":", "") + "00";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const names = new Map();
  for (const m of data.modules) if (!names.has(m.id)) names.set(m.id, m.name);
  const mod = (id) => names.get(id) || "Allgemein";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyOS//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:StudyOS"];
  const ev = (lines) => L.push("BEGIN:VEVENT", `DTSTAMP:${stamp}`, ...lines, "END:VEVENT");
  if (hw) data.homework.filter((h) => h.due && !DONE_HW.has(h.status)).forEach((h) => ev([
    `UID:hw-${h.id}@studyos`, `DTSTART;VALUE=DATE:${d8(h.due)}`, `DTEND;VALUE=DATE:${d8(addDays(h.due, 1))}`,
    `SUMMARY:${esc(`Abgabe: ${h.title} (${mod(h.moduleId)})`)}`, "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc("Abgabe morgen: " + h.title)}`, "TRIGGER:-PT15H", "END:VALARM",
  ]));
  /* Prüfungen ohne Datum ergäben ein ungültiges „DTSTART:T090000“; Ende zwei Stunden später, höchstens 23:59 */
  if (exams) data.exams.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date || "")).forEach((e) => { const start = /^\d{2}:\d{2}$/.test(e.time || "") ? e.time : "09:00"; const [hh, mm] = start.split(":").map(Number); const end = hh + 2 > 23 ? "235900" : `${String(hh + 2).padStart(2, "0")}${String(mm).padStart(2, "0")}00`; ev([
    `UID:exam-${e.id}@studyos`, `DTSTART:${d8(e.date)}T${t6(start)}`, `DTEND:${d8(e.date)}T${end}`,
    `SUMMARY:${esc("Prüfung: " + mod(e.moduleId))}`, ...(e.room ? [`LOCATION:${esc(e.room)}`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc("Prüfung morgen: " + mod(e.moduleId))}`, "TRIGGER:-P1D", "END:VALARM",
  ]); });
  if (sessions) data.sessions.filter((s) => isActive(s) && s.date >= iso()).forEach((s) => ev([
    `UID:ses-${s.id}@studyos`, `DTSTART:${d8(s.date)}T${t6(s.start)}`, `DTEND:${d8(s.date)}T${t6(s.end || s.start)}`,
    `SUMMARY:${esc(`${s.type}: ${mod(s.moduleId)}`)}`, ...(s.room ? [`LOCATION:${esc(s.room)}`] : []),
  ]));
  /* Feste Semestertermine der TUM (abgeleitet, nicht gespeichert); Erinnerung am Vortag bei Rückmeldung und Anmeldeschluss */
  if (uni) uniDates(data.settings || {}).filter((x) => x.date >= iso()).forEach((x) => ev([
    `UID:uni-${x.id}@studyos`, `DTSTART;VALUE=DATE:${d8(x.date)}`, `DTEND;VALUE=DATE:${d8(addDays(x.date, 1))}`,
    `SUMMARY:${esc(x.title)}`, "TRANSP:TRANSPARENT",
    ...(x.kind === "fee" || x.end ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc("Morgen: " + x.title)}`, "TRIGGER:-PT15H", "END:VALARM"] : []),
  ]));
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
