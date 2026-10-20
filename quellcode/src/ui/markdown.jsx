import React from "react";
import { needsExtras, useExtras } from "./extras.js";
import { fileUrl } from "../lib/files.js";

/* Kleiner, sicherer Markdown-Renderer für Notizen und Karten (ohne HTML-Injection).
   Formeln ($…$, $$…$$) und eingefärbter Code werden über KaTeX bzw. highlight.js gezeigt, sobald geladen;
   beide maskieren ihre Eingabe, darum ist das eingesetzte HTML sicher. */
const ExtrasCtx = React.createContext(null);

function MathTex({ tex, display }) {
  const x = React.useContext(ExtrasCtx);
  if (!x) return display ? <pre className="math-raw">{tex}</pre> : <code>{tex}</code>;
  const html = x.math(tex, display);
  return display ? <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

function CodeBlock({ code, lang }) {
  const x = React.useContext(ExtrasCtx);
  return (
    <pre className="code-block">
      {lang && <span className="code-lang">{lang}</span>}
      {x ? <code className="hljs" dangerouslySetInnerHTML={{ __html: x.code(code, lang) }} /> : <code>{code}</code>}
    </pre>
  );
}

/* Verlinkte Notizen ([[Titel]]): nur in der Notizansicht klickbar, sonst einfacher Text */
export const WikiCtx = React.createContext(null);
function WikiLink({ name, label }) {
  const w = React.useContext(WikiCtx);
  const text = label || name;
  if (!w) return <span>{text}</span>;
  const target = w.resolve(name);
  if (!target) return <span className="wiki-link missing" title={`Keine Notiz „${name}“`}>{text}</span>;
  return <button type="button" className="wiki-link" onClick={() => w.open(target.id)}>{text}</button>;
}

/* Bild aus den Anhängen: ![Name](att:ID) */
function AttImage({ id, alt }) {
  const [url, setUrl] = React.useState(undefined);
  React.useEffect(() => { let live = true; fileUrl(id).then((u) => live && setUrl(u)); return () => { live = false; }; }, [id]);
  if (url === undefined) return <span className="md-img-missing">{alt || "Bild"}</span>;
  if (!url) return <span className="md-img-missing">[Bild „{alt || "Bild"}“ nicht auf diesem Gerät]</span>;
  return <img className="md-img" src={url} alt={alt} />;
}

export function mdInline(text, keyBase) {
  const out = []; const re = /(`[^`]+`)|(\$(?=\S)[^$\n]*?\S\$|\$\S\$)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[\[[^\]\n]+\]\])|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(!\[([^\]\n]*)\]\(att:([\w-]+)\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = keyBase + "-" + i++;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<MathTex key={k} tex={m[2].slice(1, -1)} />);
    else if (m[3]) out.push(<strong key={k}>{mdInline(m[3].slice(2, -2), k)}</strong>);
    else if (m[4]) out.push(<em key={k}>{m[4].slice(1, -1)}</em>);
    else if (m[5]) { const [name, label] = m[5].slice(2, -2).split("|"); out.push(<WikiLink key={k} name={name.trim()} label={label?.trim()} />); }
    else if (m[8]) out.push(<AttImage key={k} id={m[10]} alt={m[9]} />);
    else if (m[6]) out.push(<a key={k} href={m[7]} target="_blank" rel="noopener noreferrer">{m[6].slice(1, m[6].indexOf("]"))}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const src = String(text || "");
  const x = useExtras(needsExtras(src));
  const lines = src.split("\n"); const blocks = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const fence = /^```\s*([\w+#-]*)/.exec(ln);
    if (fence) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push(<CodeBlock key={i} code={buf.join("\n")} lang={fence[1]} />); continue; }
    if (/^\s*\$\$/.test(ln)) {
      /* $$ … $$ auf einer oder mehreren Zeilen */
      const one = /^\s*\$\$(.+)\$\$\s*$/.exec(ln);
      if (one) { blocks.push(<MathTex key={i} tex={one[1]} display />); i++; continue; }
      const buf = [ln.replace(/^\s*\$\$/, "")]; i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) buf.push(lines[i++].replace(/\$\$\s*$/, ""));
      blocks.push(<MathTex key={i} tex={buf.join("\n").trim()} display />); continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(ln);
    if (h) { const T = "h" + h[1].length; blocks.push(<T key={i}>{mdInline(h[2], "h" + i)}</T>); i++; continue; }
    if (/^\s*[-*]\s+/.test(ln) || /^\s*\d+[.)]\s+/.test(ln)) {
      const ordered = /^\s*\d+[.)]\s+/.test(ln); const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, "")); i++; }
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={i}>{items.map((x2, j) => <li key={j}>{mdInline(x2, `l${i}-${j}`)}</li>)}</L>); continue;
    }
    if (/^>\s?/.test(ln)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, "")); blocks.push(<blockquote key={i}>{mdInline(buf.join(" "), "q" + i)}</blockquote>); continue; }
    if (!ln.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+|\s*\$\$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    blocks.push(<p key={i}>{buf.map((x2, j) => <React.Fragment key={j}>{j > 0 && <br />}{mdInline(x2, `p${i}-${j}`)}</React.Fragment>)}</p>);
  }
  return <ExtrasCtx.Provider value={x}><div className="md text-sm leading-relaxed text-slate-200">{blocks}</div></ExtrasCtx.Provider>;
}
