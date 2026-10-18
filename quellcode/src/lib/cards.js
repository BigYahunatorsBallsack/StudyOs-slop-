/* Karteikarten: Wiederholungs-Algorithmus (vereinfachtes SM-2), Lückentext, Tags, CSV */
import { addDays, iso } from "./util.js";

/* Spaced Repetition (vereinfachtes SM-2). q: 0 nochmal, 1 schwer, 2 gut, 3 leicht */
export function schedule(card, q, today = iso()) {
  let ease = card.ease || 2.5, interval = card.interval || 0, reps = card.reps || 0;
  if (q === 0) { reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else {
    reps += 1;
    if (q === 1) { interval = reps === 1 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (q === 2) { interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(interval + 1, Math.round(interval * ease)); }
    else { interval = reps === 1 ? 3 : reps === 2 ? 6 : Math.max(interval + 1, Math.round(interval * ease * 1.3)); ease = ease + 0.15; }
  }
  return { ease: Math.round(ease * 100) / 100, interval, reps, due: addDays(today, interval), lastReview: today };
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
  const counts = ["\t", ";", ","].map((d) => [d, firstLine.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
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
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/, "").trim();
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
