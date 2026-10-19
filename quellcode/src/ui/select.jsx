import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Auswahlfeld im Pixel-Stil statt des nativen <select>. Das native Menü malt das Betriebssystem
   (iOS-Rad, macOS-Menü), das lässt sich nicht gestalten. Gleiche Props wie <select> mit <option>-Kindern;
   onChange bekommt { target: { value } }. Muster „Select-only Combobox“ (WAI-ARIA APG): Fokus bleibt
   auf dem Knopf, die Liste zeigt die aktive Option per aria-activedescendant. */

const textOf = (n) => n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n)
  : Array.isArray(n) ? n.map(textOf).join("") : n.props ? textOf(n.props.children) : "";

function flatOptions(children, out = []) {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    if (c.type === React.Fragment) return flatOptions(c.props.children, out);
    if (c.type !== "option") return;
    const label = c.props.children;
    out.push({ value: String(c.props.value ?? textOf(label)), label, text: textOf(label), disabled: !!c.props.disabled });
  });
  return out;
}

export function Select({ value, onChange, children, className = "", disabled, id, name, ...aria }) {
  const opts = flatOptions(children);
  const cur = Math.max(0, opts.findIndex((o) => o.value === String(value ?? "")));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(cur);
  const [pos, setPos] = useState(null);
  const [listName, setListName] = useState("");
  const btn = useRef(null), list = useRef(null), typed = useRef({ s: "", t: 0 });
  const uid = useId(), listId = uid + "-list", optId = (i) => `${uid}-o${i}`;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight, below = vh - r.bottom - 8, above = r.top - 8;
    const up = below < 200 && above > below;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8)), width: r.width,
      top: up ? undefined : r.bottom + 6, bottom: up ? vh - r.top + 6 : undefined, max: Math.min(320, (up ? above : below) - 6) });
  };
  const show = () => {
    if (disabled || !opts.length) return;
    const own = btn.current?.textContent || "";
    setListName(aria["aria-label"] || [...(btn.current?.labels || [])].map((l) => l.textContent.replace(own, "").trim()).join(" ") || "Auswahl");
    setActive(cur); place(); setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); refocus && btn.current?.focus(); };
  const pick = (i) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    close();
    if (o.value !== String(value ?? "")) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } });
  };
  const step = (from, d) => {
    for (let i = from + d; i >= 0 && i < opts.length; i += d) if (!opts[i].disabled) return i;
    return from;
  };
  const seek = (ch) => {
    const t = typed.current, now = Date.now();
    t.s = now - t.t > 700 ? ch : t.s + ch; t.t = now;
    const start = open ? active : cur, n = opts.length;
    for (let k = t.s.length > 1 ? 0 : 1; k <= n; k++) {
      const i = (start + k) % n;
      if (!opts[i].disabled && opts[i].text.toLowerCase().startsWith(t.s)) return i;
    }
    return -1;
  };

  const onKey = (e) => {
    if (disabled) return;
    const k = e.key;
    let done = true;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") show();
      else if (k === "Home" || k === "End") { setActive(k === "Home" ? step(-1, 1) : step(opts.length, -1)); show(); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = seek(k.toLowerCase()); if (i >= 0) pick(i); }
      else done = false;
    } else if (k === "ArrowDown") setActive((i) => step(i, 1));
    else if (k === "ArrowUp") { if (e.altKey) pick(active); else setActive((i) => step(i, -1)); }
    else if (k === "Home") setActive(step(-1, 1));
    else if (k === "End") setActive(step(opts.length, -1));
    else if (k === "PageDown") setActive((i) => { let j = i; for (let n = 0; n < 8; n++) j = step(j, 1); return j; });
    else if (k === "PageUp") setActive((i) => { let j = i; for (let n = 0; n < 8; n++) j = step(j, -1); return j; });
    else if (k === "Enter" || k === " ") pick(active);
    else if (k === "Escape") close();
    else if (k === "Tab") { pick(active); done = false; }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = seek(k.toLowerCase()); if (i >= 0) setActive(i); }
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  };

  // Offene Liste folgt dem Knopf beim Scrollen, schließt bei Tipp daneben
  useEffect(() => {
    if (!open) return;
    const outside = (e) => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) close(false); };
    const move = (e) => { if (!list.current?.contains(e.target)) place(); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("scroll", move, true); window.removeEventListener("resize", move); };
  }, [open]);

  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const sel = opts[cur];
  return (
    <>
      <button ref={btn} type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined} disabled={disabled} data-value={sel?.value ?? ""} {...aria}
        className={`select ${className}`} onClick={() => (open ? close() : show())} onKeyDown={onKey}>
        <span className="select-value">{sel?.label}</span>
      </button>
      {open && pos && createPortal(
        <ul ref={list} id={listId} role="listbox" aria-label={listName} className="select-list"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.max }}
          onMouseDown={(e) => e.preventDefault()}>
          {opts.map((o, i) => (
            <li key={o.value + i} id={optId(i)} data-i={i} data-value={o.value} role="option" aria-selected={i === cur} aria-disabled={o.disabled || undefined}
              className={`select-opt${i === active ? " is-active" : ""}`} onPointerMove={() => i !== active && !o.disabled && setActive(i)} onClick={() => pick(i)}>
              {o.label}
            </li>
          ))}
        </ul>, document.body)}
    </>
  );
}
