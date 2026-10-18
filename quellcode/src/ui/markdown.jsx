import React, { useState, useEffect, useRef, useMemo } from "react";

/* Kleiner, sicherer Markdown-Renderer für Notizen (ohne HTML-Injection) */
export function mdInline(text, keyBase) {
  const out = []; const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = keyBase + "-" + i++;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer">{m[4].slice(1, m[4].indexOf("]"))}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const lines = String(text || "").split("\n"); const blocks = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push(<pre key={i}><code>{buf.join("\n")}</code></pre>); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(ln);
    if (h) { const T = "h" + h[1].length; blocks.push(<T key={i}>{mdInline(h[2], "h" + i)}</T>); i++; continue; }
    if (/^\s*[-*]\s+/.test(ln) || /^\s*\d+[.)]\s+/.test(ln)) {
      const ordered = /^\s*\d+[.)]\s+/.test(ln); const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, "")); i++; }
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={i}>{items.map((x, j) => <li key={j}>{mdInline(x, `l${i}-${j}`)}</li>)}</L>); continue;
    }
    if (/^>\s?/.test(ln)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, "")); blocks.push(<blockquote key={i}>{mdInline(buf.join(" "), "q" + i)}</blockquote>); continue; }
    if (!ln.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    blocks.push(<p key={i}>{buf.map((x, j) => <React.Fragment key={j}>{j > 0 && <br />}{mdInline(x, `p${i}-${j}`)}</React.Fragment>)}</p>);
  }
  return <div className="md text-sm leading-relaxed text-slate-200">{blocks}</div>;
}
