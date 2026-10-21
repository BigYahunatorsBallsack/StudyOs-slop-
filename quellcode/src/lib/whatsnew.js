/* „Was ist neu“: Überschriften der Punkte aus CHANGELOG.md (beim Build eingelesen, siehe build.mjs) */

/** @typedef {{ version: string | null, items: string[] }} Section */

/** Fett gedruckter Anfang eines Punkts („- **Titel:** …“) ohne Doppelpunkt oder Punkt am Ende. */
export function itemTitle(line) {
  const m = /^\s*[-*]\s+\*\*(.+?)\*\*/.exec(line);
  return m ? m[1].trim().replace(/[:.]$/, "").trim() : "";
}

/** Abschnitte des Changelogs, neueste zuerst: „Unveröffentlicht“ (nur wenn nicht leer, version null), dann die Versionen. */
export function parseChangelog(text, max = 3) {
  /** @type {Section[]} */
  const out = [];
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { version: /unver/i.test(h[1]) ? null : h[1].replace(/^v/i, ""), items: [] };
      out.push(cur);
      continue;
    }
    const t = cur && itemTitle(line);
    if (t) cur.items.push(t);
  }
  return out.filter((s) => s.items.length).slice(0, max);
}

/** Was der Nutzer noch nicht gesehen hat. Ohne gemerkte Liste: neue Nutzer bekommen nichts, wer schon Daten hat, alles. */
export function freshItems(section, seen, hasData) {
  if (!section) return [];
  if (!Array.isArray(seen)) return hasData ? section.items : [];
  return section.items.filter((t) => !seen.includes(t));
}

export const WHATS_NEW = /** @type {Section[]} */ (typeof __WHATS_NEW__ !== "undefined" ? __WHATS_NEW__ : []);

const KEY = "studyos-neu-gesehen";
export const readSeen = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(v) ? v : null; } catch { return null; } };
/** Punkte als gesehen merken (die jüngsten 300 genügen) */
export const markSeen = (items) => {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...items, ...(readSeen() || [])])].slice(0, 300))); } catch { /* egal */ }
};
