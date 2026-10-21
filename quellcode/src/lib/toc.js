/* Inhaltsverzeichnis für lange Notizen: Überschriften (# bis ###) so erkennen, wie sie der Markdown-Renderer zeigt,
   also nicht in Code-Blöcken (```) und Formelblöcken ($$ … $$). */

export const TOC_MIN = 3; /* ab so vielen Überschriften gibt es ein Inhaltsverzeichnis */
export const HEADING = /^(#{1,3})\s+(.*)$/;

/** Überschrift als schlichter Text: ohne **, *, `, Links und [[Verweise]]. */
export function plainHeading(s) {
  return String(s || "")
    .replace(/!\[([^\]\n]*)\]\(att:[\w-]+\)/g, "$1")
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, a, b) => (b || a).trim())
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\s][^*]*)\*/g, "$1").replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Überschriften einer Notiz: [{ level, text, line }] mit der Zeilennummer (ab 0) wie im Renderer. */
export function noteHeadings(text) {
  const lines = String(text || "").split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^```/.test(ln)) { i++; while (i < lines.length && !/^```/.test(lines[i])) i++; continue; }
    if (/^\s*\$\$/.test(ln)) {
      if (/^\s*\$\$(.+)\$\$\s*$/.test(ln)) continue;
      i++; while (i < lines.length && !/\$\$\s*$/.test(lines[i])) i++;
      continue;
    }
    const h = HEADING.exec(ln);
    if (h) { const t = plainHeading(h[2]); if (t) out.push({ level: h[1].length, text: t, line: i }); }
  }
  return out;
}

/** Einzug im Verzeichnis: relativ zur kleinsten vorkommenden Ebene (0, 1 oder 2). */
export function tocDepth(items) {
  const min = Math.min(...items.map((x) => x.level));
  return (x) => x.level - min;
}
