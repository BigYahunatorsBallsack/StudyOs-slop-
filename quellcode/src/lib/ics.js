import { DONE_HW } from "./constants.js";
import { isActive } from "./data.js";
import { addDays, iso, wdIdx, weekStart } from "./util.js";
import { uniDates } from "./tumdates.js";

/* ICS-Parser (z. B. Kalender-Export aus TUMonline) */
export function parseICS(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  /** @type {any[]} */ const events = []; /** @type {any} */ let cur = null;
  const unesc = (v) => v.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
  const parseDT = (v) => {
    const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?/.exec(v || ""); if (!m) return null;
    let d = m[4] ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : new Date(+m[1], +m[2] - 1, +m[3]);
    if (m[7] && m[4]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: iso(d), time: m[4] ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : "" };
  };
  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) { cur = /** @type {any} */ ({ exdates: [] }); continue; }
    if (line.startsWith("END:VEVENT")) { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
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
          if (!e.exdates.includes(d) && !overridden.has(`${uid}|${d}`)) out.push({ ...base, date: d, occurrence: d });
        }
        weekMon = addDays(weekMon, step); weeks++;
      }
    } else out.push({ ...base, date: e.start.date, occurrence: e.recurrence || e.start.date });
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export const guessType = (s) => /zentral/i.test(s) ? "Zentralübung" : /tutor/i.test(s) ? "Tutorium" : /übung|uebung|\bUE\b|exercise/i.test(s) ? "Übung" : /praktikum/i.test(s) ? "Praktikum" : "Vorlesung";

/* ICS-Export: Abgaben, Prüfungen und Termine für den Handy-Kalender (mit Erinnerungen) */
export function buildICS(data, { homework = true, hw = homework, exams = true, sessions = false, uni = true } = {}) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const d8 = (s) => s.replace(/-/g, "");
  const t6 = (s) => (s || "00:00").replace(":", "") + "00";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const mod = (id) => data.modules.find((m) => m.id === id)?.name || "Allgemein";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyOS//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:StudyOS"];
  const ev = (lines) => L.push("BEGIN:VEVENT", `DTSTAMP:${stamp}`, ...lines, "END:VEVENT");
  if (hw) data.homework.filter((h) => h.due && !DONE_HW.has(h.status)).forEach((h) => ev([
    `UID:hw-${h.id}@studyos`, `DTSTART;VALUE=DATE:${d8(h.due)}`, `DTEND;VALUE=DATE:${d8(addDays(h.due, 1))}`,
    `SUMMARY:${esc(`Abgabe: ${h.title} (${mod(h.moduleId)})`)}`, "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc("Abgabe morgen: " + h.title)}`, "TRIGGER:-PT15H", "END:VALARM",
  ]));
  if (exams) data.exams.forEach((e) => { const start = e.time || "09:00"; const [hh, mm] = start.split(":").map(Number); const endH = String(Math.min(23, hh + 2)).padStart(2, "0"); ev([
    `UID:exam-${e.id}@studyos`, `DTSTART:${d8(e.date)}T${t6(start)}`, `DTEND:${d8(e.date)}T${endH}${String(mm).padStart(2, "0")}00`,
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
  return L.join("\r\n") + "\r\n";
}
