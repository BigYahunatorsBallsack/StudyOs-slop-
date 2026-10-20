/* Geteiltes Übungsblatt (PDF) → Abgabe: Modul, Blattnummer, Frist und Aufgaben aus Dateiname und Text erkennen.
   Der Text kommt aus pdfText(); beides ist eine Schätzung, die Abgabe öffnet sich danach zum Prüfen. */
import { matchModule, norm } from "./quickadd.js";
import { addDays, iso, uid } from "./util.js";
import { withNumber } from "./study.js";

const MONTHS = ["januar", "februar", "marz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n) => String(n).padStart(2, "0");

const SHEET_RE = /(?:übungs|uebungs|hausaufgaben|aufgaben)?blatt\s*(?:nr\.?\s*)?0*(\d{1,2})\b|(?:exercise|problem|homework|assignment|tutorial)\s*sheet\s*(?:no\.?\s*)?0*(\d{1,2})\b|\bsheet\s*0*(\d{1,2})\b|\b(?:hausaufgabe|assignment|homework)\s*0*(\d{1,2})\b/i;
const FILE_RE = /(?:blatt|sheet|uebung|ubung|übung|ueb|ub|ex|hw|ha|assignment|homework|tut)[\s_\-.]*0*(\d{1,2})(?!\d)/i;

/** Datum aus „14.11.2026“, „14.11.“, „2026-11-14“, „14. November 2026“, „November 14, 2026“ (ohne Jahr: nächstes passendes) */
export function findDate(s, today = iso()) {
  const year = (d, m, y) => {
    if (y) return `${y.length === 2 ? "20" + y : y}-${pad(m)}-${pad(d)}`;
    const ty = Number(today.slice(0, 4)), cand = `${ty}-${pad(m)}-${pad(d)}`;
    return cand < addDays(today, -60) ? `${ty + 1}-${pad(m)}-${pad(d)}` : cand;
  };
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2})\b)?/.exec(s);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return year(Number(m[1]), Number(m[2]), m[3]);
  const t = norm(s);
  m = /\b(\d{1,2})\.?\s+([a-z]+)\s*(\d{4})?/.exec(t);
  if (m) { const i = Math.max(MONTHS.indexOf(m[2]), MONTHS_EN.indexOf(m[2])); if (i >= 0) return year(Number(m[1]), i + 1, m[3]); }
  m = /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/.exec(t);
  if (m) { const i = MONTHS_EN.indexOf(m[1]); if (i >= 0) return year(Number(m[2]), i + 1, m[3]); }
  return "";
}

/**
 * @param {{ name?: string, text?: string, title?: string }} src Dateiname, PDF-Text, geteilter Titel
 * @returns {null | { title: string, moduleId: string, due: string, dueTime: string, subtasks: Array<{ id: string, title: string, done: boolean }>, guessedDue: boolean }}
 *   null, wenn es nicht nach einem Übungsblatt aussieht
 */
export function sheetFromShare(src, data, today = iso()) {
  const name = String(src.name || "").replace(/\.pdf$/i, ""), text = String(src.text || "").slice(0, 20000), title = String(src.title || "");
  const head = text.slice(0, 2500);
  const n = SHEET_RE.exec(head) || SHEET_RE.exec(title) || SHEET_RE.exec(name.replace(/[_-]+/g, " "));
  const num = n ? Number(n[1] || n[2] || n[3] || n[4]) : (FILE_RE.exec(name) ? Number(FILE_RE.exec(name)[1]) : null);
  if (num === null) return null;

  /* Modul: Nummer oder Name im Kopf des Blatts, sonst ein Wort aus dem Dateinamen */
  const modules = data.modules.filter((m) => !m.archived);
  const hay = norm(`${name} ${title} ${head}`);
  let mod = modules.find((m) => m.code && hay.includes(norm(m.code))) || modules.filter((m) => m.name && hay.includes(norm(m.name).replace(/\(.*?\)/g, "").trim())).sort((a, b) => b.name.length - a.name.length)[0];
  if (!mod) for (const w of `${name} ${title}`.split(/[\s_\-.]+/)) { if (/^\d+$/.test(w)) continue; mod = matchModule(w, modules); if (mod) break; }

  /* Frist: Datum nach „Abgabe“, „Due“, „Deadline“, „bis“ … */
  let due = "", dueTime = "", guessedDue = false;
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length && !due; i++) {
    if (!/abgabe|abzugeben|einreich|deadline|due|submission|submit|bis zum|spätestens|spaetestens/i.test(lines[i])) continue;
    const near = lines.slice(i, i + 2).join(" ");
    due = findDate(near, today);
    const tm = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uhr|h\b)?/i.exec(near.replace(/\b\d{1,2}\.\d{1,2}\.(\d{2,4})?/g, " "));
    if (due && tm) dueTime = `${pad(tm[1])}:${tm[2]}`;
  }
  /* sonst eine Woche nach dem letzten Blatt des Moduls bzw. in einer Woche */
  const prev = mod ? data.homework.filter((h) => h.moduleId === mod.id && h.due).sort((a, b) => b.due.localeCompare(a.due))[0] : null;
  if (!due) { guessedDue = true; due = prev && prev.due >= addDays(today, -6) ? addDays(prev.due, 7) : addDays(today, 7); if (prev?.dueTime) dueTime = prev.dueTime; }

  /* Titel wie bei den bisherigen Blättern des Moduls („Übungsblatt 4“ → „Übungsblatt 5“) */
  const sheetTitle = (prev && withNumber(prev.title, num)) || `Blatt ${num}`;

  /* Aufgaben: „Aufgabe 1“, „Exercise 2“, „Problem 3“, „Task 4“ am Zeilenanfang */
  const tasks = new Set();
  for (const l of lines) { const m = /^\s*(?:aufgabe|exercise|problem|task|übung|uebung)\s*(?:\d{1,2}\.)?(\d{1,2})\b/i.exec(l); if (m && Number(m[1]) > 0 && Number(m[1]) <= 20) tasks.add(Number(m[1])); }
  const list = [...tasks].sort((a, b) => a - b);
  const subtasks = list.length >= 2 ? list.map((k) => ({ id: uid(), title: `Aufgabe ${k}`, done: false })) : [];

  return { title: sheetTitle, moduleId: mod?.id || "", due, dueTime, subtasks, guessedDue };
}

/* ---------------- Text aus einem PDF ---------------- */

const latin = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };

async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream("deflate");
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  } catch { return null; }
}

/** Zeichenzuordnung aus ToUnicode-CMaps (für Schriften mit 2-Byte-Codes, z. B. aus Word) */
function cmapOf(s, map) {
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(m[1].toLowerCase(), hexText(m[2]));
  }
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16), base = parseInt(m[3], 16);
      for (let c = a; c <= b && c - a < 256; c++) map.set(c.toString(16).padStart(m[1].length, "0"), String.fromCharCode(base + c - a));
    }
  }
}
const hexText = (h) => { let s = ""; for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };

/* Ligaturen in LaTeX-Schriften (OT1): ff, fi, fl, ffi, ffl */
const LIG = { 11: "ff", 12: "fi", 13: "fl", 14: "ffi", 15: "ffl" };
function decodeLiteral(str) {
  return str.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => ({ n: "\n", r: "", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" })[c] ?? String.fromCharCode(parseInt(c, 8)))
    .replace(/[^ -~\u00a0-\uffff\n]/g, (c) => LIG[c.charCodeAt(0)] ?? "");
}

/** Text aus den Inhaltsströmen: Tj/TJ-Strings, Zeilenwechsel bei Td/T*, Leerzeichen bei großen Abständen */
function textOps(s, cmap) {
  let out = "";
  const re = /\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>|-?\d+(?:\.\d+)?|T[dD*m]|'|"|ET|\[|\]/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[0];
    if (t[0] === "(") out += decodeLiteral(t.slice(1, -1));
    else if (t[0] === "<") { const h = t.slice(1, -1).replace(/\s/g, "").toLowerCase(); out += cmap.size && h.length % 4 === 0 ? h.match(/.{4}/g).map((c) => cmap.get(c) ?? "").join("") : h.length % 2 === 0 ? h.match(/.{2}/g).map((c) => cmap.get(c) ?? String.fromCharCode(parseInt(c, 16))).join("") : ""; }
    else if (/^-?\d/.test(t)) { if (Number(t) < -180 && s[re.lastIndex] !== " ") out += " "; }
    else if (t === "Td" || t === "TD" || t === "T*" || t === "'" || t === "\"" || t === "ET" || t === "Tm") out += "\n";
  }
  return out;
}

/** Bestmöglicher Klartext eines PDFs (ohne Bibliothek; reicht für LaTeX- und Office-Blätter meistens) */
export async function pdfText(bytes, limit = 40) {
  const raw = latin(bytes);
  if (!raw.startsWith("%PDF")) return "";
  const streams = [];
  const re = /<<([\s\S]{0,600}?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) && streams.length < 400) {
    const start = re.lastIndex, end = raw.indexOf("endstream", start);
    if (end < 0) break;
    /* Länge aus dem Wörterbuch, sonst bis „endstream“ ohne den Zeilenumbruch davor (zlib verträgt keine Reste) */
    const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(m[1]);
    let stop = len && start + Number(len[1]) <= end ? start + Number(len[1]) : end;
    while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13) && !len) stop--;
    streams.push({ dict: m[1], data: bytes.subarray(start, stop) });
    re.lastIndex = end;
  }
  const decoded = [];
  for (const st of streams) {
    if (/\/Subtype\s*\/Image|\/Length1|\/FontFile/.test(st.dict)) continue;
    const plain = /FlateDecode/.test(st.dict) ? await inflate(st.data) : /\/Filter/.test(st.dict) ? null : st.data;
    if (plain) decoded.push(latin(plain));
  }
  const cmap = new Map();
  decoded.filter((s) => s.includes("begincmap")).forEach((s) => cmapOf(s, cmap));
  return decoded.filter((s) => /\bBT\b/.test(s) && !s.includes("begincmap")).slice(0, limit).map((s) => textOps(s, cmap)).join("\n")
    .replace(/[^\S\n]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
