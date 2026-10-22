import { WD } from "./constants.js";

/* ---------------- Hilfsfunktionen ---------------- */
export const uid = () => {
  try { const a = new Uint32Array(2); crypto.getRandomValues(a); return (a[0].toString(36) + a[1].toString(36)).slice(0, 12); }
  catch { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
};

export const iso = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Lokales Datum (JJJJ-MM-TT) eines Zeitstempels wie „2026-10-19T23:30:00.000Z“; reine Daten bleiben, wie sie sind */
export const dayOf = (s) => { const v = String(s || ""); if (v.length <= 10) return v; const t = new Date(v); return Number.isNaN(t.getTime()) ? v.slice(0, 10) : iso(t); };

export const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };

/** Gibt es dieses Datum „JJJJ-MM-TT“ im Kalender? (31.02. oder 29.02. außerhalb von Schaltjahren nicht) */
export const validDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

export const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);

export const wdIdx = (s) => (new Date(s + "T00:00:00").getDay() + 6) % 7;

/* Datum TT.MM.JJJJ; volle Zeitstempel (z. B. „updated“) werden in lokales Datum umgerechnet */
export const fmt = (s) => { if (!s) return ""; return dayOf(s).split("-").reverse().join("."); };

export const fmtShort = (s) => (s ? `${WD[wdIdx(s)]}, ${s.slice(8)}.${s.slice(5, 7)}.` : "");

export const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

export const weekStart = (s) => addDays(s, -wdIdx(s));

export const isHeld = (s) => { const t = iso(); return s.date < t || (s.date === t && (s.end || "23:59") <= nowHM()); };

export const byTime = (a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""));

export const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title || "").localeCompare(String(b.title || ""));

export const pct = (v) => (v === null || v === undefined ? "–" : Math.round(v * 100) + " %");

export const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

export const fmtMin = (m) => { m = Math.round(m || 0); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; };
/** Stunden kurz: unter 10 h mit einer Nachkommastelle („2,5 h“), sonst gerundet („14 h“). */
export const fmtH = (h) => (h < 10 ? h.toFixed(1).replace(".", ",") : Math.round(h)) + " h";

/** ISO-Kalenderwoche mit ISO-Jahr eines Datums „JJJJ-MM-TT“ (Woche ab Montag, Woche 1 enthält den 4. Januar); in UTC gerechnet */
export function isoYearWeek(s) {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); /* Donnerstag derselben Woche */
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return { year, week: 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7) };
}

export const isoWeek = (s) => isoYearWeek(s).week;

export const parseDec = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(",", "."); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };

export const fmtDec = (n) => (n === null || n === undefined || n === "" ? "" : String(n).replace(".", ","));

/* Datei speichern: auf dem Handy über „Teilen“ (Dateien, iCloud, Drive), sonst als Download */
export async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = typeof File !== "undefined" ? new File([blob], name, { type: mime }) : null;
    const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (file && mobile && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "aborted"; }
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
