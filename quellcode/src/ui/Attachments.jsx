/* Anhänge an Hausaufgaben und Notizen (PDF, Fotos …), lokal und verschlüsselt in der Cloud */
import React, { useEffect, useRef, useState } from "react";
import { ACCEPT, MAX_FILE_BYTES, fmtSize, getLocal, pastedName, putLocal, removeLocal, storeFile } from "../lib/files.js";

export function Attachments({ db, coll, itemId }) {
  const item = db.data[coll].find((x) => x.id === itemId);
  const files = item?.files || [];
  const cloud = db.cloud;
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  /* Objekt-URLs, die gerade gelten (auch zwischen zwei Zeichnungen aktuell); alles andere wird freigegeben */
  const urlsRef = useRef({}), mounted = useRef(true);
  const keep = (next) => { urlsRef.current = next; setUrls(next); };

  /* lokale Dateien direkt als Link bereitstellen; Links entfernter Anhänge freigeben */
  useEffect(() => {
    let live = true;
    const made = [];
    (async () => {
      const next = {};
      for (const f of files) {
        if (urlsRef.current[f.id]) { next[f.id] = urlsRef.current[f.id]; continue; }
        const blob = await getLocal(f.id);
        if (!live) break;
        if (blob) { next[f.id] = URL.createObjectURL(blob); made.push(next[f.id]); }
      }
      if (!live) { made.forEach((u) => URL.revokeObjectURL(u)); return; }
      /* inzwischen (z. B. über „Laden“) entstandene Links behalten, die übrigen freigeben */
      const ids = new Set(files.map((f) => f.id));
      for (const [id, u] of Object.entries(urlsRef.current)) {
        if (!ids.has(id)) URL.revokeObjectURL(u);
        else if (next[id] !== u) { if (next[id]) URL.revokeObjectURL(next[id]); next[id] = u; }
      }
      keep(next);
    })();
    return () => { live = false; };
  }, [files.map((f) => f.id).join()]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = {}; };
  }, []);

  if (!item) return null;
  const add = async (file) => {
    setErr("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setErr(`Höchstens ${fmtSize(MAX_FILE_BYTES)} pro Datei.`); return; }
    setBusy(file.name);
    try {
      const { meta, cloudErr } = await storeFile(file, cloud, pastedName(file));
      if (cloudErr) setErr(`Lokal gespeichert, Cloud: ${cloudErr}`);
      db.patch(coll, itemId, (x) => ({ files: [...(x.files || []), meta] }));
    } catch (e) { setErr(e.message || "Konnte die Datei nicht speichern."); }
    setBusy("");
  };
  const fetchRemote = async (f) => {
    setErr(""); setBusy(f.name);
    try {
      const bytes = await cloud.downloadFile(f.id);
      const blob = new Blob([bytes], { type: f.type });
      await putLocal(f.id, blob);
      if (mounted.current && !urlsRef.current[f.id]) keep({ ...urlsRef.current, [f.id]: URL.createObjectURL(blob) });
    } catch (e) { setErr(e.message || "Laden fehlgeschlagen."); }
    setBusy("");
  };
  const remove = async (f) => {
    db.patch(coll, itemId, (x) => ({ files: (x.files || []).filter((y) => y.id !== f.id) }));
    await removeLocal(f.id);
    if (f.cloud && cloud?.canFiles?.()) cloud.removeFile(f.id).catch(() => {});
  };
  const upload = async (f) => {
    setErr(""); setBusy(f.name);
    try {
      const blob = await getLocal(f.id);
      if (!blob) throw new Error("Die Datei liegt nicht mehr auf diesem Gerät.");
      await cloud.uploadFile(f.id, new Uint8Array(await blob.arrayBuffer()));
      db.patch(coll, itemId, (x) => ({ files: (x.files || []).map((y) => (y.id === f.id ? { ...y, cloud: true } : y)) }));
    } catch (e) { setErr(e.message || "Hochladen fehlgeschlagen."); }
    setBusy("");
  };

  return (
    <div className="attachments">
      <p className="text-xs font-medium text-slate-400">Anhänge</p>
      {files.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {files.map((f) => { const type = String(f.type || ""); return (
            <li key={f.id} className="attachment">
              {type.startsWith("image/") && urls[f.id] ? <img src={urls[f.id]} alt="" className="attachment-thumb" /> : <span className="attachment-icon" aria-hidden="true">{type === "application/pdf" ? "PDF" : "DATEI"}</span>}
              <span className="min-w-0 flex-1">
                {urls[f.id] ? <a className="block truncate text-sm" href={urls[f.id]} target="_blank" rel="noopener noreferrer" download={type.startsWith("image/") || type === "application/pdf" ? undefined : f.name}>{f.name}</a>
                  : <span className="block truncate text-sm">{f.name}</span>}
                <span className="text-[11px] text-slate-500">{fmtSize(f.size)}{f.cloud ? ", in der Cloud" : ", nur auf diesem Gerät"}</span>
              </span>
              {!urls[f.id] && f.cloud && cloud?.canFiles?.() && <button type="button" className="btn btn-ghost" onClick={() => fetchRemote(f)} disabled={!!busy}>Laden</button>}
              {urls[f.id] && !f.cloud && cloud?.canFiles?.() && <button type="button" className="btn btn-ghost" onClick={() => upload(f)} disabled={!!busy}>Hochladen</button>}
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} entfernen`} onClick={() => remove(f)}><span aria-hidden="true" className="block h-4 w-4 text-center leading-4">✕</span></button>
            </li>
          ); })}
        </ul>
      )}
      <label className={`btn btn-ghost mt-2 ${busy ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
        {busy ? `Speichert ${busy} …` : "Datei anhängen"}
        <input type="file" accept={ACCEPT} className="sr-only" aria-label="Datei anhängen" onChange={(e) => { add(e.target.files[0]); e.target.value = ""; }} />
      </label>
      {!cloud?.canFiles?.() && <p className="mt-1 text-[11px] text-slate-500">Ohne Cloud-Sync bleiben Anhänge auf diesem Gerät (nicht in Sicherungen enthalten).</p>}
      {err && <p role="alert" className="mt-1 text-xs text-amber-300">{err}</p>}
    </div>
  );
}
