/* Notizen: Checklisten (- [ ] / - [x]) und angeheftete Notizen */

/** Listenpunkt mit Kästchen: Einzug und Listenzeichen, dann [ ] oder [x] */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/;
/** Kästchen am Anfang eines Listenpunkts (ohne Listenzeichen), wie ihn der Markdown-Renderer sieht */
export const TASK_ITEM = /^\[([ xX])\](?:\s+|$)/;

/** Kästchen in Zeile `line` (0-basiert) umschalten; alles andere bleibt Zeichen für Zeichen gleich. */
export function toggleTask(text, line) {
  const lines = String(text || "").split("\n");
  const m = TASK_LINE.exec(lines[line] ?? "");
  if (!m) return String(text || "");
  lines[line] = m[1] + (m[2] === " " ? "[x]" : "[ ]") + lines[line].slice(m[0].length);
  return lines.join("\n");
}

/** Angeheftete Notizen zuerst, sonst zuletzt bearbeitete zuerst. */
export const sortNotes = (notes) => [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || "").localeCompare(a.updated || ""));
