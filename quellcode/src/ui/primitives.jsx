import React, { useState, useEffect, useRef } from "react";
import { RING_COLORS } from "../lib/constants.js";
import { pct } from "../lib/util.js";
import { Markdown } from "./markdown.jsx";
import { toggleTask } from "../lib/notes.js";
import { btnDanger, focusRing } from "./styles.js";

export const ICONS = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  modules: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  week: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  learn: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pin: <><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></>,
};

export function Icon({ name, className = "h-5 w-5" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{ICONS[name]}</svg>;
}

export function Toasts({ items, onClose }) {
  return (
    <div className="toast-pos pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast pointer-events-auto flex w-full max-w-md items-center gap-3 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && <button className="toast-action shrink-0 rounded-md px-2 py-1 text-sm" onClick={() => { t.action.run(); onClose(t.id); }}>{t.action.label}</button>}
          <button className="shrink-0 rounded px-1 opacity-60 hover:opacity-100" onClick={() => onClose(t.id)} aria-label="Meldung schließen">✕</button>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`surface ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Bar({ value, max = 1, color = "var(--accent)", className = "", label }) {
  const p = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} className={`bar ${className}`}>
      <span style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

export function TriRing({ s, size = 52 }) {
  const rings = [[22, s.reviewQuote, RING_COLORS.review], [16, s.hwQuote, RING_COLORS.hw], [10, s.topicQuote, RING_COLORS.topics]];
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" role="img" aria-label={`Nachbereitung ${pct(s.reviewQuote)}, Hausaufgaben ${pct(s.hwQuote)}, Themen ${pct(s.topicQuote)}`}>
      {rings.map(([r, v, c]) => {
        const len = 2 * Math.PI * r;
        return (
          <g key={r} transform="rotate(-90 26 26)">
            <circle cx="26" cy="26" r={r} fill="none" stroke="var(--hm0)" strokeWidth="4.5" />
            {v !== null && v > 0 && <circle cx="26" cy="26" r={r} fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${len * v} ${len}`} />}
          </g>
        );
      })}
    </svg>
  );
}

export function RingLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
      {[["Nachbereitung", RING_COLORS.review], ["Hausaufgaben", RING_COLORS.hw], ["Themen", RING_COLORS.topics]].map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
      ))}
    </div>
  );
}

export function Tabs({ items, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="seg">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className="seg-item">{l}</button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, label, warn, color }) {
  return (
    <button onClick={onClick} aria-pressed={!!on} className={`chip ${warn ? "chip-warn" : ""}`} style={color ? { "--mod": color } : undefined}>
      <span className="chip-mark" aria-hidden="true">{on ? "✓" : warn ? "!" : "○"}</span>{label}
    </button>
  );
}

/** Leerer Zustand. art: Pixel-Bild im Retro-Look (book, card, check, hourglass, trophy, star, flag, bowl); ohne art der Space Invader. */
export function Empty({ children, action, art }) {
  return (
    <div className="empty" data-art={art}>
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Dot({ color }) {
  return <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color || "#64748b" }} aria-hidden="true" />;
}

export function Stat({ label, value, sub, onClick }) {
  const body = (<><p className="stat-label">{label}</p><p className="stat-value">{value}</p>{sub && <p className="stat-sub">{sub}</p>}</>);
  return onClick ? <button className="stat" onClick={onClick}>{body}</button> : <div className="stat">{body}</div>;
}

export function ConfirmButton({ label, confirmLabel = "Wirklich?", onConfirm, className = btnDanger }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const id = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(id); }, [armed]);
  return (
    <button type="button" className={className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

/** onMakeCard(text): bei markiertem Text erscheint „Karte daraus“ */
export function MarkdownInput({ id, value, onChange, rows, placeholder, onMakeCard }) {
  const [preview, setPreview] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const ref = useRef(null);
  const onSelect = () => { const el = ref.current; setHasSel(!!el && el.selectionEnd > el.selectionStart && !!el.value.slice(el.selectionStart, el.selectionEnd).trim()); };
  /* Markierung per Finger meldet nicht jeder Browser über onSelect: zusätzlich auf die nativen Ereignisse hören */
  const selRef = useRef(onSelect); selRef.current = onSelect;
  useEffect(() => {
    if (!onMakeCard || preview) return;
    const el = ref.current, f = () => selRef.current();
    const doc = () => { if (document.activeElement === el) f(); };
    el?.addEventListener("select", f);
    document.addEventListener("selectionchange", doc);
    return () => { el?.removeEventListener("select", f); document.removeEventListener("selectionchange", doc); };
  }, [!!onMakeCard, preview]);
  const makeCard = () => { const el = ref.current; if (!el) return; const t = (value || "").slice(el.selectionStart, el.selectionEnd).trim(); if (t) onMakeCard(t); };
  const insert = (before, after = before, selected = "Text") => {
    const el = ref.current; if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd, text = value || "", chosen = text.slice(start, end) || selected;
    const next = text.slice(0, start) + before + chosen + after + text.slice(end);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + chosen.length); });
  };
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1">
        {[["B", "**", "**", "fett"], ["I", "*", "*", "kursiv"], ["`", "`", "`", "Code"], ["H", "## ", "", "Überschrift"], ["•", "- ", "", "Listeneintrag"], ["Link", "[", "](https://)", "Linktext"]].map(([l, a, b, s]) => (
          <button type="button" key={l} onClick={() => insert(a, b, s)} className={`md-tool rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 ${focusRing}`} title={s}>{l}</button>
        ))}
        <span className="flex-1" />
        {onMakeCard && hasSel && !preview && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={makeCard} className={`md-tool rounded px-2 py-1 text-xs text-sky-300 hover:bg-slate-800 ${focusRing}`}>Karte daraus</button>}
        <button type="button" onClick={() => setPreview((p) => !p)} className={`md-tool rounded px-2 py-1 text-xs text-sky-300 hover:bg-slate-800 ${focusRing}`} aria-pressed={preview}>{preview ? "Bearbeiten" : "Vorschau"}</button>
      </div>
      {preview ? (
        <div className="min-h-28 p-3">{value ? <Markdown text={value} onToggleTask={(ln) => onChange(toggleTask(value, ln))} /> : <p className="text-sm text-slate-500">Noch kein Inhalt.</p>}</div>
      ) : (
        <textarea ref={ref} id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} onSelect={onSelect} rows={rows || 8} placeholder={placeholder}
          className="w-full resize-y bg-transparent p-3 font-num text-sm text-slate-100 placeholder-slate-600 focus:outline-none" />
      )}
      <p className="border-t border-slate-800 px-3 py-1 text-[10px] text-slate-600">Markdown: # Überschrift · **fett** · *kursiv* · `Code` · - Liste · ``` Codeblock ``` · [Link](https://…)</p>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current?.querySelector("input:not([type=hidden]),select,textarea,[role=combobox]") || ref.current?.querySelector("button");
    el && el.focus();
    const onKey = (e) => {
      /* Liegen zwei Fenster übereinander (Karte aus einer Notiz), gilt die Taste nur dem obersten */
      const open = document.querySelectorAll(".sheet-panel");
      if (open.length > 1 && open[open.length - 1] !== ref.current) return;
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const els = [...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); };
  }, []);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="sheet-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title" style={{ fontSize: "1.375rem" }}>{title}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Schließen"><span aria-hidden="true" className="block h-4 w-4 text-center leading-4">✕</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Kleines Pixel-Icon (zug, bus, bowl …); nur im Farbschema „Retro“ sichtbar, für Screenreader unsichtbar */
export const PxIcon = ({ name, className = "" }) => <span className={`px-icon px-${name} ${className}`} aria-hidden="true" />;
