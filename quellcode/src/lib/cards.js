/* Karteikarten: Wiederholungs-Algorithmus (vereinfachtes SM-2), Lückentext, Tags, CSV */
import { addDays, iso } from "./util.js";

/* Spaced Repetition mit FSRS-5 (Free Spaced Repetition Scheduler, Standardparameter wie in Anki).
   Jede Karte hat Stabilität S (Tage, nach denen sie mit 90 % Wahrscheinlichkeit noch sitzt) und
   Schwierigkeit D (1–10). Bewertung q: 0 nochmal, 1 schwer, 2 gut, 3 leicht. */
export const FSRS_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81, RETENTION = 0.9, MAX_IVL = 36500;
const clampD = (d) => Math.min(10, Math.max(1, d));
const w = FSRS_W;
const initS = (g) => Math.max(0.1, w[g - 1]);
const initD = (g) => clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
export const retrievability = (t, s) => Math.pow(1 + (FACTOR * t) / s, DECAY);
const nextD = (d, g) => { const d1 = d - w[6] * (g - 3) * (10 - d) / 9; return clampD(w[7] * initD(4) + (1 - w[7]) * d1); };
const recallS = (d, s, r, g) => s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1));
const forgetS = (d, s, r) => Math.min(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), s / Math.exp(w[17] * w[18]));
const shortS = (s, g) => s * Math.exp(w[17] * (g - 3 + w[18]));
const ivlOf = (s) => Math.min(MAX_IVL, Math.max(1, Math.round((s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1))));
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

/** Zustand einer Karte für FSRS; Karten aus dem alten Verfahren (SM-2) werden sinnvoll übernommen. */
function fsrsState(card, today) {
  if (Number(card.stability) > 0) return { s: Number(card.stability), d: clampD(Number(card.difficulty) || 5), last: card.lastReview || null };
  if (!card.reps) return null; /* neu */
  const ivl = Math.max(1, Number(card.interval) || 1);
  const ease = Number(card.ease) || 2.5;
  return { s: ivl, d: clampD(11 - (ease - 1.3) * 4), last: card.lastReview || (card.due ? addDays(card.due, -ivl) : today) };
}

export function schedule(card, q, today = iso()) {
  const g = Math.min(4, Math.max(1, (Number(q) || 0) + 1));
  const st = fsrsState(card, today);
  let s, d;
  if (!st) { s = initS(g); d = initD(g); }
  else {
    const t = st.last ? Math.max(0, daysBetween(st.last, today)) : 0;
    d = nextD(st.d, g);
    if (t === 0) s = shortS(st.s, g); /* am selben Tag noch einmal gesehen */
    else { const r = retrievability(t, st.s); s = g === 1 ? forgetS(st.d, st.s, r) : recallS(st.d, st.s, r, g); }
  }
  const interval = g === 1 ? 0 : ivlOf(s);
  return {
    stability: Math.round(s * 1000) / 1000, difficulty: Math.round(d * 1000) / 1000, interval,
    reps: g === 1 ? 0 : (card.reps || 0) + 1, lapses: (card.lapses || 0) + (g === 1 && st ? 1 : 0),
    due: addDays(today, interval), lastReview: today, reviews: (Number(card.reviews) || Number(card.reps) || 0) + 1,
  };
}

/* Lückentext im Anki-Stil: {{c1::Antwort}} oder {{c1::Antwort::Hinweis}} */
const CLOZE = /\{\{c\d+::(.+?)(?:::(.+?))?\}\}/g;
export const hasCloze = (text) => /\{\{c\d+::.+?\}\}/.test(String(text || ""));

/** reveal=false verdeckt die Lücken, reveal=true hebt die Antworten hervor (als Markdown-Fett). */
export function renderCloze(text, reveal) {
  return String(text || "").replace(CLOZE, (_, answer, hint) => (reveal ? `**${answer}**` : `**[${hint || "…"}]**`));
}

/** Tags normalisieren: klein, ohne Leerzeichen, ohne Duplikate. */
export const parseTags = (str) => [...new Set(String(str || "").split(/[,;\n]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))];
export const allTags = (cards) => [...new Set(cards.flatMap((c) => parseTags(c.tags)))].sort((a, b) => a.localeCompare(b, "de"));

/** CSV mit Anführungszeichen, Zeilenumbrüchen in Feldern und Erkennung von Tab, Semikolon oder Komma. */
export function parseCsv(text) {
  const t = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = t.split(/\r?\n/)[0] || "";
  const counts = ["\t", ";", ","].map((d) => /** @type {[string, number]} */ ([d, firstLine.split(d).length - 1])).sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ";";
  const rows = [];
  let row = [], field = "", quoted = false;
  const endRow = () => { row.push(field); field = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; endRow(); }
    else field += ch;
  }
  endRow();
  return rows;
}

/** Spalten: Vorderseite, Rückseite, Tags (optional). Eine Kopfzeile wird erkannt und übersprungen. */
export function parseCardsCsv(text) {
  let rows = parseCsv(text);
  if (rows.length && /^(front|vorderseite|frage)$/i.test((rows[0][0] || "").trim())) rows = rows.slice(1);
  const cards = [], skipped = [];
  rows.forEach((r, i) => {
    const front = (r[0] || "").trim(), back = (r[1] || "").trim();
    if (!front || (!back && !hasCloze(front))) { skipped.push(i + 1); return; }
    cards.push({ front, back, tags: parseTags(r[2]).join(", ") });
  });
  return { cards, skipped };
}

/** Export als CSV (Semikolon, UTF-8 mit BOM, damit Excel Umlaute richtig anzeigt). */
/** @param {any[]} cards @param {(moduleId: string) => string} [moduleName] */
export function cardsToCsv(cards, moduleName = () => "") {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [["Vorderseite", "Rückseite", "Tags", "Modul"].map(q).join(";")];
  cards.forEach((c) => lines.push([c.front, c.back, c.tags || "", moduleName(c.moduleId)].map(q).join(";")));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/**
 * Karteikarten aus einer Notiz: Zeilen „Frage :: Antwort“ und Zeilen mit Lückentext {{c1::…}}.
 * Listenpunkte und Überschriftenzeichen am Zeilenanfang werden entfernt; vorhandene Karten (gleiche Vorderseite) übersprungen.
 */
export function cardsFromNote(text, existingFronts = []) {
  const seen = new Set(existingFronts.map((f) => String(f).trim().toLowerCase()));
  const out = [];
  let inCode = false;
  for (const raw of String(text || "").split("\n")) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode) continue;
    /* Kästchen einer Checkliste gehören nicht zur Frage: Abhaken ändert so keine Karte */
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/, "").replace(/^\[[ xX]\](?:\s+|$)/, "").trim();
    let card = null;
    const sep = line.indexOf(" :: ");
    if (sep > 0 && !/\{\{c\d+::/.test(line.slice(0, sep))) card = { front: line.slice(0, sep).trim(), back: line.slice(sep + 4).trim() };
    else if (hasCloze(line)) card = { front: line, back: "" };
    if (!card || !card.front || (!card.back && !hasCloze(card.front))) continue;
    const key = card.front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

/**
 * Vorlage für eine Karte aus markiertem Text einer Notiz: Sieht die Markierung aus wie „Frage :: Antwort“
 * (eine Zeile), werden daraus Vorder- und Rückseite, sonst wird der ganze Text die Rückseite.
 * @returns {{ front: string, back: string }}
 */
export function cardFromSelection(text) {
  const t = String(text || "").replace(/\r/g, "").trim();
  if (!t.includes("\n")) {
    const line = t.replace(/^(?:[-*+]|\d+[.)]|#{1,6})\s+/, "").replace(/^\[[ xX]\]\s+/, "");
    const m = /^(.+?)\s+::\s+(.+)$/.exec(line);
    if (m && !/\{\{c\d+::/.test(m[1])) return { front: m[1].trim(), back: m[2].trim() };
  }
  return { front: "", back: t };
}

/**
 * Karten einer Notiz beim Speichern abgleichen: neue Zeilen „Frage :: Antwort“ bzw. Lückentexte werden Karten,
 * geänderte Antworten ändern die Karte. Eine geänderte Frage übernimmt die Karte, die ihre Zeile verloren hat
 * (Lernstand bleibt); was übrig bleibt, wird gelöscht. Ohne Modul passiert nichts.
 * @returns {{ cards: any[], added: number, updated: number, removed: number }}
 */
export function syncNoteCards(cards, note, today, newId) {
  const same = { cards, added: 0, updated: 0, removed: 0 };
  if (!note.moduleId) return same;
  const own = cards.filter((c) => c.fromNote === note.id);
  const others = cards.filter((c) => c.fromNote !== note.id && c.moduleId === note.moduleId).map((c) => c.front);
  const parsed = cardsFromNote(note.text, others);
  if (!own.length && !parsed.length) return same;
  const key = (s) => String(s).trim().toLowerCase();
  const left = new Map(own.map((c) => [key(c.front), c]));
  const keep = new Map(), fresh = [];
  for (const p of parsed) {
    const hit = left.get(key(p.front));
    if (hit) { left.delete(key(p.front)); keep.set(hit.id, p); } else fresh.push(p);
  }
  const orphans = [...left.values()];
  let added = 0, updated = 0;
  const patches = new Map();
  for (const [id, p] of keep) { const c = own.find((x) => x.id === id); if (c.back !== p.back) { patches.set(id, { back: p.back }); updated++; } }
  const extra = [];
  fresh.forEach((p) => {
    const reuse = orphans.shift();
    if (reuse) { patches.set(reuse.id, { front: p.front, back: p.back }); updated++; }
    else { extra.push({ ...p, id: newId(), moduleId: note.moduleId, topicId: "", tags: "", created: today, ease: 2.5, interval: 0, reps: 0, due: today, fromNote: note.id }); added++; }
  });
  const gone = new Set(orphans.map((c) => c.id));
  if (!added && !updated && !gone.size) return same;
  const next = cards.filter((c) => !gone.has(c.id)).map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id) } : c));
  return { cards: [...next, ...extra], added, updated, removed: gone.size };
}

/* ---------------- Abfragen als Lernzeit ---------------- */

/** Längste Pause zwischen zwei Schritten der Abfrage, die noch als Lernzeit zählt (wer länger nichts tut, ist weg). */
export const REVIEW_GAP_MAX = 2 * 60000;

/** Zeit seit dem letzten Schritt der Abfrage in ms, auf REVIEW_GAP_MAX gedeckelt; ohne Startzeit 0 */
export const reviewGap = (last, now) => (last ? Math.max(0, Math.min(REVIEW_GAP_MAX, now - last)) : 0);

/**
 * Gesammelte Abfragezeit (ms je Modul) in ganze Minuten aufteilen. Ohne `final` bleibt der Rest unter einer Minute
 * liegen (kommt mit der nächsten Karte dazu), mit `final` wird ab einer halben Minute aufgerundet und nichts bleibt übrig.
 * @param {Record<string, number>} pending
 * @returns {{ add: Record<string, number>, rest: Record<string, number> }} add: Minuten je Modul, rest: übrige ms
 */
export function splitReviewTime(pending, final = false) {
  const add = {}, rest = {};
  for (const [mod, ms] of Object.entries(pending || {})) {
    const mins = final ? Math.round(ms / 60000) : Math.floor(ms / 60000);
    if (mins >= 1) add[mod] = mins;
    const left = final ? 0 : ms - mins * 60000;
    if (left > 0) rest[mod] = left;
  }
  return { add, rest };
}

/**
 * Abfragezeit als Lerneinheit „Karteikarten“ eintragen: je Modul und Tag eine automatische Einheit (auto: "karten"),
 * weitere Minuten am selben Tag kommen dazu. Von Hand angelegte Einheiten bleiben unberührt.
 * @param {{ date: string, at: string, newId: () => string }} opts
 */
export function addReviewMinutes(logs, moduleId, minutes, opts) {
  const { date, at, newId } = opts;
  if (!(minutes >= 1)) return logs;
  const mod = moduleId || "";
  const hit = logs.find((l) => l.auto === "karten" && (l.moduleId || "") === mod && l.date === date);
  if (hit) return logs.map((l) => (l === hit ? { ...l, minutes: (Number(l.minutes) || 0) + minutes } : l));
  return [...logs, { id: newId(), moduleId: mod, topicId: "", kind: "Karteikarten", auto: "karten", date, at, minutes, note: "Karteikarten abgefragt", created: date }];
}
