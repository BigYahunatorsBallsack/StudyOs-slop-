/* Schnelleingabe: Freitext wie „Blatt 4 Analysis Fr“ in einen Eintrag übersetzen.
   Erkennt Art (Hausaufgabe, Prüfung, Termin, Lerneinheit, Notiz), Modul, Datum, Uhrzeit und Dauer,
   bei Hausaufgaben auch Teilaufgaben („a-c“ oder „Aufgaben 1-4“).
   Alles Erkannte wird aus dem Titel entfernt; der Rest ist der Titel. */
import { expandRange } from "./subtasks.js";
import { addDays, iso, uid, wdIdx } from "./util.js";

const WEEKDAYS = [
  ["mo", "montag"], ["di", "dienstag"], ["mi", "mittwoch"], ["do", "donnerstag"], ["fr", "freitag"], ["sa", "samstag"], ["so", "sonntag"],
];
const KIND_WORDS = {
  homework: /^(blatt|übungsblatt|uebungsblatt|hausaufgabe|hausaufgaben|ha|hü|abgabe|aufgabe|aufgaben|sheet|assignment)$/i,
  exam: /^(prüfung|pruefung|klausur|exam|endterm|midterm|retake|wiederholungsklausur)$/i,
  session: /^(vl|vorlesung|übung|uebung|ü|ue|tutorium|tut|tutorübung|zü|zentralübung|praktikum|lecture)$/i,
  log: /^(gelernt|lernen|gelesen|nachgearbeitet|wiederholt)$/i,
};
const SESSION_TYPE = (w) => (/^(zü|zentralübung)$/i.test(w) ? "Zentralübung" : /^(tut|tutorium|tutorübung)$/i.test(w) ? "Tutorium" : /^(übung|uebung|ü|ue)$/i.test(w) ? "Übung" : /^praktikum$/i.test(w) ? "Praktikum" : "Vorlesung");

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
const pad = (n) => String(n).padStart(2, "0");

/* Modulsuche: Modulnummer, Wortanfang (ab 3 Zeichen) oder Initialen (z. B. „DS“, „EIDI“) */
function matchModule(token, modules) {
  const t = norm(token).replace(/[^a-z0-9]/g, "");
  if (t.length < 2) return null;
  let best = null, score = 0;
  for (const m of modules) {
    const name = norm(m.name || "").replace(/\(.*?\)/g, " ");
    const words = name.split(/[^a-z0-9]+/).filter(Boolean);
    const initials = words.map((w) => w[0]).join("");
    const capitals = (m.name || "").replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toLowerCase();
    let s = 0;
    if (m.code && norm(m.code).replace(/[^a-z0-9]/g, "") === t) s = 100;
    else if (name.replace(/[^a-z0-9]/g, "") === t) s = 90;
    else if (t.length >= 3 && words.some((w) => w === t)) s = 80;
    else if (t.length >= 3 && words.some((w) => w.startsWith(t))) s = 60 + Math.min(t.length, 10);
    else if (t.length >= 2 && (initials === t || capitals === t)) s = 70;
    if (s > score) { score = s; best = m; }
  }
  return best;
}

function nextWeekday(today, idx) {
  const diff = (idx - wdIdx(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

function parseDateToken(tokens, i, today) {
  const w = norm(tokens[i]).replace(/[.,]$/, "");
  if (w === "heute") return [today, 1];
  if (w === "morgen") return [addDays(today, 1), 1];
  if (w === "ubermorgen") return [addDays(today, 2), 1];
  if (/^(nachste|nachsten|nachster|naechste|naechsten)$/.test(w) && tokens[i + 1]) {
    const nx = norm(tokens[i + 1]).replace(/[.,]$/, "");
    if (/^woche$/.test(nx)) return [addDays(today, 7 - wdIdx(today)), 2];
    const wd = WEEKDAYS.findIndex(([a, b]) => nx === a || nx === b);
    if (wd >= 0) { let d = nextWeekday(today, wd); if (diffWeeks(today, d) === 0) d = addDays(d, 7); return [d, 2]; }
  }
  if (w === "in" && tokens[i + 2] && /^\d+$/.test(tokens[i + 1])) {
    const n = Number(tokens[i + 1]), unit = norm(tokens[i + 2]);
    if (/^tag(en)?$/.test(unit)) return [addDays(today, n), 3];
    if (/^woche(n)?$/.test(unit)) return [addDays(today, 7 * n), 3];
  }
  const wd = WEEKDAYS.findIndex(([a, b]) => w === a || w === b);
  if (wd >= 0) return [nextWeekday(today, wd), 1];
  let m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4})?)?$/.exec(w);
  if (m) {
    const day = Number(m[1]), mon = Number(m[2]);
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    let year = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(today.slice(0, 4));
    let d = `${year}-${pad(mon)}-${pad(day)}`;
    if (!m[3] && d < today) d = `${year + 1}-${pad(mon)}-${pad(day)}`;
    return [d, 1];
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (m) return [w, 1];
  return null;
}
const diffWeeks = (a, b) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (7 * 86400000));

function parseTimeToken(tok) {
  const w = norm(tok).replace(/uhr$/, "");
  let m = /^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/.exec(w);
  if (m && Number(m[1]) < 24 && Number(m[3]) < 24) return { start: `${pad(m[1])}:${m[2] || "00"}`, end: `${pad(m[3])}:${m[4] || "00"}` };
  m = /^(\d{1,2}):(\d{2})$/.exec(w);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return { start: `${pad(m[1])}:${m[2]}` };
  return null;
}

function parseDuration(tokens, i) {
  const w = norm(tokens[i]);
  let m = /^(\d+(?:[.,]\d+)?)\s*(h|std|stunden?)$/.exec(w);
  if (m) return [Math.round(Number(m[1].replace(",", ".")) * 60), 1];
  m = /^(\d+)h(\d+)$/.exec(w);
  if (m) return [Number(m[1]) * 60 + Number(m[2]), 1];
  m = /^(\d+)\s*(min|minuten|m)$/.exec(w);
  if (m) return [Number(m[1]), 1];
  if (/^\d+(?:[.,]\d+)?$/.test(w) && tokens[i + 1]) {
    const u = norm(tokens[i + 1]);
    if (/^(min|minuten)$/.test(u)) return [Number(w), 2];
    if (/^(h|std|stunde|stunden)$/.test(u)) return [Math.round(Number(w.replace(",", ".")) * 60), 2];
  }
  return null;
}

/**
 * @returns {{ kind: string, kindGuessed: boolean, module: object|null, date: string, start: string, end: string,
 *             minutes: number|null, title: string, sessionType: string, subtasks: string[] }}
 */
export function parseQuick(text, modules = [], today = iso()) {
  const raw = String(text || "").trim();
  const out = { kind: "", kindGuessed: true, module: null, date: "", start: "", end: "", minutes: null, title: "", sessionType: "Vorlesung", subtasks: [] };
  if (!raw) return out;
  if (/^notiz\s*:/i.test(raw)) return { ...out, kind: "note", kindGuessed: false, title: raw.replace(/^notiz\s*:\s*/i, "") };
  const tokens = raw.replace(/\s+([-–])\s+/g, "$1").split(/\s+/);
  const used = new Array(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const tok = tokens[i];
    /* Teilaufgaben: „a-c“ immer, Zahlenbereiche nur nach „Aufgabe(n)“, sonst wären sie eine Uhrzeit */
    if (!out.subtasks.length && /^[a-z][-–][a-z]$/i.test(tok)) {
      const names = expandRange(tok);
      if (names) { out.subtasks = names; used[i] = true; if (!out.kind || out.kind === "log") { out.kind = "homework"; out.kindGuessed = false; } continue; }
    }
    if (!out.subtasks.length && i > 0 && /^(aufgabe|aufgaben|aufg\.?|nr\.?)$/i.test(tokens[i - 1]) && /^\d+[-–]\d+$/.test(tok)) {
      const names = expandRange("Aufgabe " + tok);
      if (names) { out.subtasks = names; used[i] = used[i - 1] = true; if (!out.kind || out.kind === "log") { out.kind = "homework"; out.kindGuessed = false; } continue; }
    }
    const d = !out.date && parseDateToken(tokens, i, today);
    if (d) { out.date = d[0]; for (let j = 0; j < d[1]; j++) used[i + j] = true; continue; }
    if (/^(um|ab|bis|von)$/i.test(tok) && tokens[i + 1] && /^\d{1,2}(:\d{2})?$/.test(tokens[i + 1])) {
      const t = parseTimeToken(tokens[i + 1].includes(":") ? tokens[i + 1] : tokens[i + 1] + ":00");
      if (t && !out.start) { out.start = t.start; used[i] = used[i + 1] = true; if (tokens[i + 2] && /^uhr$/i.test(tokens[i + 2])) used[i + 2] = true; continue; }
    }
    if (/^\d{1,2}$/.test(tok) && tokens[i + 1] && /^uhr$/i.test(tokens[i + 1]) && !out.start) { out.start = `${pad(tok)}:00`; used[i] = used[i + 1] = true; continue; }
    const t = parseTimeToken(tok);
    if (t && !out.start) { Object.assign(out, t); used[i] = true; if (tokens[i + 1] && /^uhr$/i.test(tokens[i + 1])) used[i + 1] = true; continue; }
    const dur = out.minutes === null && parseDuration(tokens, i);
    if (dur) { out.minutes = dur[0]; for (let j = 0; j < dur[1]; j++) used[i + j] = true; continue; }
    for (const [kind, re] of Object.entries(KIND_WORDS)) {
      if (re.test(norm(tok)) || re.test(tok)) {
        if (!out.kind || (out.kind === "log" && kind !== "log")) { out.kind = kind; out.kindGuessed = false; }
        if (kind === "session") { out.sessionType = SESSION_TYPE(tok); used[i] = true; }
        if (kind === "log" || kind === "exam") used[i] = true;
        break;
      }
    }
  }
  /* Modul: längste passende Wortfolge (bis 3 Wörter) aus den noch nicht verwendeten Wörtern */
  for (let len = 3; len >= 1 && !out.module; len--) {
    for (let i = 0; i + len <= tokens.length && !out.module; i++) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const phrase = tokens.slice(i, i + len).join(" ");
      if (/^\d+$/.test(phrase)) continue;
      const m = len === 1 ? matchModule(phrase, modules) : modules.find((x) => norm(x.name || "").startsWith(norm(phrase)));
      if (m) { out.module = m; for (let j = i; j < i + len; j++) used[j] = true; }
    }
  }
  if (!out.kind) out.kind = out.minutes !== null ? "log" : out.start && out.date ? "session" : out.date ? "homework" : "note";
  out.title = tokens.filter((_, i) => !used[i]).join(" ").replace(/\s+([,.;:])/g, "$1").replace(/^[,;:\-–\s]+|[,;:\-–\s]+$/g, "").trim();
  return out;
}

/** Werte für das jeweilige Formular bzw. zum direkten Speichern. */
export function quickToEntity(q, today = iso()) {
  const moduleId = q.module?.id || "";
  switch (q.kind) {
    case "homework": return { kind: "homework", vals: { moduleId, title: q.title || "Hausaufgabe", issued: today, due: q.date || "", status: "ausgegeben",
      ...(q.subtasks?.length && { subtasks: q.subtasks.map((title) => ({ id: uid(), title, done: false })) }) } };
    case "exam": return { kind: "exam", vals: { moduleId, date: q.date || "", time: q.start || "09:00", room: "", dailyMinutes: 90, attempt: 1, result: "offen", freeWeekdays: [] } };
    case "session": return { kind: "session", vals: { moduleId, type: q.sessionType, date: q.date || today, start: q.start || "10:00", end: q.end || addHours(q.start || "10:00", 2), room: q.title || "" } };
    case "log": return { kind: "log", vals: { date: q.date || today, minutes: q.minutes || 45, moduleId, topicId: "", kind: "Nacharbeiten", note: q.title } };
    default: return { kind: "note", vals: { moduleId, sessionId: "", title: q.title || "Notiz", text: "" } };
  }
}
const addHours = (hm, h) => { const [a, b] = hm.split(":").map(Number); return `${pad(Math.min(23, a + h))}:${pad(b)}`; };

/** Fehlende Pflichtangaben für direktes Speichern (sonst Formular öffnen). */
export function quickMissing(q) {
  const miss = [];
  if (["homework", "exam", "session"].includes(q.kind) && !q.module) miss.push("Modul");
  if (["homework", "exam"].includes(q.kind) && !q.date) miss.push("Datum");
  return miss;
}
