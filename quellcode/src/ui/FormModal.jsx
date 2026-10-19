import React, { useState } from "react";
import { WD } from "../lib/constants.js";
import { PALETTE } from "../lib/constants.js";
import { formDef } from "../lib/forms.js";
import { fmtDec, parseDec } from "../lib/util.js";
import { ConfirmButton, Empty, MarkdownInput, Modal } from "./primitives.jsx";
import { btnGhost, btnPrimary, focusRing, inputCls } from "./styles.js";
import { Attachments } from "./Attachments.jsx";
import { followingSimilar } from "../lib/series.js";

export function FormModal({ form, data, db, onSave, onDelete, onDeleteSeries, onClose }) {
  const def = formDef(form.kind, data);
  const following = form.kind === "session" && !form.isNew ? followingSimilar(data.sessions, form.initial).length : 0;
  const fields = def.fields
    .filter((f) => !(f.createOnly && !form.isNew) && !(f.editOnly && form.isNew) && !(f.seriesOnly && !following))
    .map((f) => (f.seriesOnly ? { ...f, l: `${f.l} (${following} ${following === 1 ? "weiterer" : "weitere"})` } : f));
  const resolve = (f, v) => (typeof f.opts === "function" ? f.opts(v) : f.opts || []);
  const [vals, setVals] = useState(() => {
    const v = {}; const init = form.initial || {};
    const lastMod = data.meta?.lastModule && data.modules.some((m) => m.id === data.meta.lastModule) ? data.meta.lastModule : "";
    fields.forEach((f) => {
      const has = init[f.k] !== undefined && init[f.k] !== null;
      if (f.t === "checkbox") v[f.k] = has ? !!init[f.k] : !!f.def;
      else if (f.t === "weekdays") v[f.k] = Array.isArray(init[f.k]) ? init[f.k].map(Number) : [];
      else if (f.t === "decimal") v[f.k] = has ? fmtDec(init[f.k]) : "";
      else v[f.k] = has ? init[f.k] : f.k === "moduleId" && init.moduleId === undefined && lastMod ? lastMod : typeof f.def === "function" ? f.def() : f.def ?? "";
    });
    fields.forEach((f) => { if (f.t === "select" && f.req && (v[f.k] === "" || v[f.k] === undefined)) v[f.k] = resolve(f, v)[0]?.value ?? ""; });
    return v;
  });
  const [err, setErr] = useState("");
  const setField = (k, val) => setVals((v) => { const n = { ...v, [k]: val }; if (k === "moduleId") { if ("topicId" in n) n.topicId = ""; if ("sessionId" in n) n.sessionId = ""; } return n; });
  const needsModule = fields.some((f) => f.k === "moduleId" && f.req) && data.modules.length === 0;

  const submit = (e) => {
    e.preventDefault();
    for (const f of fields) if (f.req && (vals[f.k] === "" || vals[f.k] === undefined || vals[f.k] === null || (typeof vals[f.k] === "string" && !vals[f.k].trim()))) return setErr(`Bitte „${f.l}“ ausfüllen.`);
    for (const f of fields) if (f.t === "decimal" || f.t === "number") {
      const n = f.t === "decimal" ? parseDec(vals[f.k]) : vals[f.k] === "" || vals[f.k] === null ? null : Number(vals[f.k]);
      if (n === null) continue;
      if (Number.isNaN(n)) return setErr(`„${f.l}“ muss eine Zahl sein.`);
      if (f.min !== undefined && n < f.min) return setErr(`„${f.l}“ muss mindestens ${fmtDec(f.min)} sein.`);
      if (f.max !== undefined && n > f.max) return setErr(`„${f.l}“ darf höchstens ${fmtDec(f.max)} sein.`);
    }
    const msg = def.validate ? def.validate(vals) : "";
    if (msg) return setErr(msg);
    const out = { ...(form.initial || {}) }; const extra = {};
    fields.forEach((f) => {
      const v = vals[f.k];
      const val = f.t === "decimal" ? parseDec(v) : f.t === "number" || f.num ? (v === "" || v === null ? null : Number(v)) : f.t === "checkbox" ? !!v : f.t === "textarea" ? v : typeof v === "string" ? v.trim() : v;
      if (f.transient) extra[f.k] = val; else out[f.k] = val;
    });
    onSave(form.kind, out, form.isNew, extra);
    onClose();
  };

  return (
    <Modal title={`${def.title} ${form.isNew ? "anlegen" : "bearbeiten"}`} onClose={onClose}>
      {needsModule ? (
        <Empty>Lege zuerst ein Modul an. Danach kannst du Termine, Hausaufgaben, Themen und Karten zuordnen.</Empty>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => {
              const id = "f-" + f.k;
              const common = { id, value: vals[f.k] ?? "", onChange: (e) => setField(f.k, e.target.value), className: inputCls + (f.mono ? " font-num" : "") };
              let ctrl;
              if (f.t === "select") ctrl = <select {...common}>{resolve(f, vals).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
              else if (f.t === "textarea" && form.kind === "note" && f.k === "text") ctrl = <MarkdownInput id={id} value={vals[f.k]} onChange={(v) => setField(f.k, v)} rows={f.rows || 8} placeholder={f.ph} />;
              else if (f.t === "textarea") ctrl = <textarea {...common} rows={f.rows || 4} placeholder={f.ph} />;
              else if (f.t === "weekdays") ctrl = (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.l}>
                  {WD.map((w, i) => {
                    const on = (vals[f.k] || []).includes(i);
                    return <button type="button" key={w} aria-pressed={on} onClick={() => setField(f.k, on ? vals[f.k].filter((x) => x !== i) : [...(vals[f.k] || []), i].sort())}
                      className={`h-8 w-10 rounded-lg border text-xs font-medium ${focusRing} ${on ? "border-sky-500/60 bg-sky-500/15 text-sky-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>{w}</button>;
                  })}
                </div>
              );
              else if (f.t === "color") ctrl = (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
                  {PALETTE.map((c) => (
                    <button type="button" key={c} role="radio" aria-checked={vals.color === c} aria-label={`Farbe ${c}`} onClick={() => setField("color", c)}
                      className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-slate-900 ${focusRing} ${vals.color === c ? "ring-2 ring-white" : ""}`} style={{ background: c }} />
                  ))}
                </div>
              );
              else ctrl = f.t === "decimal"
                ? <input {...common} type="text" inputMode="decimal" autoComplete="off" placeholder={f.ph} />
                : f.t === "checkbox"
                  ? <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-300"><input id={id} type="checkbox" checked={!!vals[f.k]} onChange={(e) => setField(f.k, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500" />{f.l}</label>
                  : <input {...common} type={f.t} step={f.step} min={f.min} max={f.max} placeholder={f.ph} inputMode={f.t === "number" ? "numeric" : undefined} />;
              return (
                <div key={f.k} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
                  {f.t === "checkbox" ? null : f.t === "color" ? <span className="mb-1 block text-xs font-medium text-slate-400">{f.l}</span> :
                    <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">{f.l}{f.req && <span className="text-rose-400"> *</span>}</label>}
                  {ctrl}
                  {f.hint && <p className="mt-1 text-[11px] text-slate-500">{f.hint}</p>}
                </div>
              );
            })}
          </div>
          {db && !form.isNew && (form.kind === "homework" || form.kind === "note") && <Attachments db={db} coll={form.kind === "note" ? "notes" : "homework"} itemId={form.initial.id} />}
          {db && form.isNew && (form.kind === "homework" || form.kind === "note") && <p className="mt-3 text-[11px] text-slate-500">Dateien (z. B. das Übungsblatt als PDF) kannst du nach dem Speichern anhängen.</p>}
          {err && <p role="alert" className="mt-3 text-sm text-rose-400">{err}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="submit" className={btnPrimary}>Speichern</button>
            <button type="button" className={btnGhost} onClick={onClose}>Abbrechen</button>
            <div className="ml-auto flex gap-2">
              {!form.isNew && form.kind === "session" && form.initial?.seriesId && <ConfirmButton label="Serie löschen" confirmLabel="Ganze Serie löschen?" onConfirm={() => { onDeleteSeries(form.initial.seriesId); onClose(); }} />}
              {!form.isNew && <ConfirmButton label="Löschen" confirmLabel={form.kind === "module" ? "Modul inkl. Daten löschen?" : "Wirklich löschen?"} onConfirm={() => { onDelete(form.kind, form.initial.id); onClose(); }} />}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
