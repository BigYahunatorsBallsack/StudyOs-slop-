/* Bild-Karteikarten mit Verdecken: Anzeige beim Lernen und Editor zum Zeichnen der Rechtecke (Logik in lib/occlusion.js) */
import React, { useEffect, useRef, useState } from "react";
import { MAX_FILE_BYTES, fmtSize, getLocal, putLocal, removeLocal } from "../lib/files.js";
import { KEEP_BYTES, MAX_BOXES, MAX_SIDE, applyOcclusion, bigEnough, boxFrom, fitSize, isOcc, markUploaded, nudge, occGroup, sortBoxes } from "../lib/occlusion.js";
import { modOpts } from "../lib/forms.js";
import { iso, uid } from "../lib/util.js";
import { ConfirmButton, Modal, Tabs } from "./primitives.jsx";
import { btnGhost, btnPrimary, inputCls } from "./styles.js";
import { Select } from "./select.jsx";

/* Geladene Bilder bleiben für die Sitzung als Objekt-URL im Speicher: beim Lernen folgen oft mehrere Karten desselben Bildes */
const urls = new Map();
const uploading = new Set();

async function loadUrl(img, cloud) {
  if (urls.has(img.id)) return urls.get(img.id);
  let blob = await getLocal(img.id);
  if (!blob && img.cloud && cloud?.canFiles?.()) {
    blob = new Blob([await cloud.downloadFile(img.id)], { type: img.type });
    await putLocal(img.id, blob);
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(img.id, url);
  return url;
}

/** Bild einer Karte: lokal, sonst aus der Cloud. Liegt es nur hier, wird es mit Cloud-Sync nachträglich hochgeladen. */
export function useOccImage(db, img) {
  const canFiles = !!db.cloud?.canFiles?.();
  const [state, setState] = useState(() => (img && urls.has(img.id) ? { url: urls.get(img.id), status: "ok" } : { url: null, status: "loading" }));
  useEffect(() => {
    if (!img) return;
    let live = true;
    loadUrl(img, db.cloud).then(
      (url) => { if (live) setState(url ? { url, status: "ok" } : { url: null, status: "missing" }); },
      (e) => { if (live) setState({ url: null, status: "error", msg: e?.message || "" }); });
    return () => { live = false; };
  }, [img?.id, canFiles]);
  useEffect(() => {
    if (!img || img.cloud || !canFiles || state.status !== "ok" || uploading.has(img.id)) return;
    uploading.add(img.id);
    getLocal(img.id)
      .then(async (blob) => { if (!blob) return; await db.cloud.uploadFile(img.id, new Uint8Array(await blob.arrayBuffer())); db.change((d) => ({ ...d, cards: markUploaded(d.cards, img.id) })); })
      .catch(() => {})
      .finally(() => uploading.delete(img.id));
  }, [img?.id, img?.cloud, canFiles, state.status]);
  return state;
}

/** Bild verkleinern, wenn es groß ist (längste Seite höchstens MAX_SIDE), damit Speicher und Sync schlank bleiben. */
async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Bitte ein Bild wählen (PNG, JPG, WebP …).");
  if (file.size > MAX_FILE_BYTES) throw new Error(`Höchstens ${fmtSize(MAX_FILE_BYTES)} pro Bild.`);
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("Das Bild lässt sich nicht öffnen. PNG, JPG oder WebP gehen sicher."); }
  const { width, height } = bmp;
  if (file.size <= KEEP_BYTES && Math.max(width, height) <= MAX_SIDE) { bmp.close(); return { blob: file, type: file.type, w: width, h: height }; }
  const t = fitSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = t.w; canvas.height = t.h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, t.w, t.h);
  ctx.drawImage(bmp, 0, 0, t.w, t.h);
  bmp.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Das Bild ließ sich nicht verkleinern.");
  return { blob, type: "image/jpeg", w: t.w, h: t.h };
}

/* Bild entfernen, wenn nach dem Rückgängig-Fenster keine Karte es mehr braucht */
function dropImageLater(db, img) {
  setTimeout(() => {
    if (db.getData().cards.some((c) => isOcc(c) && c.occ.img.id === img.id)) return;
    removeLocal(img.id);
    if (img.cloud && db.cloud?.canFiles?.()) db.cloud.removeFile(img.id).catch(() => {});
    const u = urls.get(img.id); if (u) { URL.revokeObjectURL(u); urls.delete(img.id); }
  }, 9000);
}

const pos = (b) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
/* Seitenverhältnis des Bildes, höchstens 60 % der Bildschirmhöhe */
const stageStyle = (img) => ({ aspectRatio: `${img.w || 4} / ${img.h || 3}`, maxWidth: `calc(60vh * ${(img.w || 4) / (img.h || 3)})` });

/** Abfrage: alle Rechtecke verdeckt (bzw. nur das gesuchte), das gesuchte hervorgehoben; aufgedeckt wird es durchsichtig. */
export function OcclusionImage({ db, card, revealed }) {
  const { img, boxes, target, mode } = card.occ;
  const { url, status, msg } = useOccImage(db, img);
  const sorted = sortBoxes(boxes);
  const n = sorted.findIndex((b) => b.id === target) + 1;
  return (
    <div className="occ-stage" style={stageStyle(img)}>
      {url ? <img src={url} alt={`Bild zu „${card.front}“, gesucht ist Bereich ${n} von ${sorted.length}`} className="occ-img" draggable={false} />
        : <p className="occ-missing">{status === "loading" ? "Bild lädt …" : status === "error" ? `Bild konnte nicht geladen werden${msg ? `: ${msg}` : "."}` : img.cloud ? "Das Bild liegt in der Cloud. Entsperre den Cloud-Sync, um es zu laden." : "Das Bild liegt nur auf dem Gerät, auf dem die Karte angelegt wurde."}</p>}
      {sorted.filter((b) => mode !== "one" || b.id === target).map((b) => {
        const t = b.id === target;
        return <span key={b.id} aria-hidden="true" style={pos(b)} className={`occ-box${t ? " is-target" : ""}${t && revealed ? " is-open" : ""}`}>{t && !revealed ? "?" : ""}</span>;
      })}
    </div>
  );
}

/** Bild-Karte anlegen oder bearbeiten: Bild wählen, Rechtecke ziehen; jedes Rechteck wird eine Karte. */
export function OcclusionEditor({ db, initial, onClose }) {
  const { data } = db;
  const editing = isOcc(initial);
  const groupSize = editing ? occGroup(data.cards, initial.occ.img.id).length : 0;
  const lastMod = data.meta?.lastModule && data.modules.some((m) => m.id === data.meta.lastModule) ? data.meta.lastModule : "";
  const [img, setImg] = useState(editing ? initial.occ.img : null);
  const [fresh, setFresh] = useState(null); /* neu gewähltes Bild: { blob, url } */
  const [boxes, setBoxes] = useState(editing ? sortBoxes(initial.occ.boxes) : []);
  const [sel, setSel] = useState(editing ? initial.occ.target : null);
  const [draft, setDraft] = useState(null);
  const [moduleId, setModuleId] = useState(initial.moduleId || lastMod || data.modules[0]?.id || "");
  const [front, setFront] = useState(editing ? initial.front : "");
  const [tags, setTags] = useState(initial.tags || "");
  const [mode, setMode] = useState(initial.occ?.mode === "one" ? "one" : "all");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const shown = useOccImage(db, editing ? img : null);
  const url = fresh?.url || shown.url;
  const stage = useRef(null), drag = useRef(null), freshRef = useRef(null), kept = useRef(false);
  freshRef.current = fresh;
  useEffect(() => () => { if (freshRef.current && !kept.current) URL.revokeObjectURL(freshRef.current.url); }, []);

  const pick = async (file) => {
    setErr("");
    if (!file) return;
    try {
      const p = await prepareImage(file);
      if (fresh) URL.revokeObjectURL(fresh.url);
      setFresh({ blob: p.blob, url: URL.createObjectURL(p.blob) });
      setImg({ id: uid() + uid(), type: p.type, size: p.blob.size, w: p.w, h: p.h, cloud: false });
      setBoxes([]); setSel(null);
      if (!front.trim()) setFront(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120));
    } catch (e) { setErr(e.message); }
  };

  const at = (e) => { const r = stage.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const down = (e) => {
    if (e.button > 0 || e.target.closest(".occ-del")) return;
    const [x, y] = at(e);
    const hit = e.target.closest("[data-box]");
    if (hit) { const b = boxes.find((v) => v.id === hit.dataset.box); setSel(b.id); drag.current = { kind: "move", x, y, b }; }
    else drag.current = { kind: "draw", x, y };
    stage.current.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const [x, y] = at(e);
    if (d.kind === "draw") setDraft(boxFrom(d.x, d.y, x, y));
    else setBoxes((bs) => bs.map((b) => (b.id === d.b.id ? nudge(d.b, x - d.x, y - d.y) : b)));
  };
  const up = (e) => {
    const d = drag.current; drag.current = null; setDraft(null);
    if (!d || d.kind !== "draw") return;
    const [x, y] = at(e);
    const b = boxFrom(d.x, d.y, x, y);
    if (!bigEnough(b)) { setSel(null); return; }
    if (boxes.length >= MAX_BOXES) { setErr(`Höchstens ${MAX_BOXES} Bereiche pro Bild.`); return; }
    const id = uid();
    setBoxes((bs) => [...bs, { id, ...b }]); setSel(id);
  };
  const remove = (id) => { setBoxes((bs) => bs.filter((b) => b.id !== id)); setSel(null); };
  const addBox = () => { const id = uid(); setBoxes((bs) => [...bs, { id, x: 0.4, y: 0.44, w: 0.2, h: 0.12 }]); setSel(id); };
  const key = (e, b) => {
    const step = 0.01, dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir) { e.preventDefault(); setBoxes((bs) => bs.map((v) => (v.id === b.id ? nudge(v, dir[0], dir[1], e.shiftKey) : v))); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(b.id); }
  };

  const save = async () => {
    setErr("");
    if (!img) return setErr("Bitte zuerst ein Bild wählen.");
    if (!moduleId) return setErr("Bitte ein Modul wählen.");
    if (!boxes.length) return setErr("Zieh mindestens ein Rechteck über eine Stelle, die du abfragen willst.");
    let im = img;
    if (fresh) {
      setBusy(true);
      try { await putLocal(im.id, fresh.blob); } catch (e) { setBusy(false); return setErr(e.message || "Konnte das Bild nicht speichern."); }
      if (db.cloud?.canFiles?.()) {
        try { await db.cloud.uploadFile(im.id, new Uint8Array(await fresh.blob.arrayBuffer())); im = { ...im, cloud: true }; }
        catch (e) { db.toast(`Bild lokal gespeichert, Cloud: ${e.message}`); }
      }
      urls.set(im.id, fresh.url); kept.current = true;
    }
    const n = boxes.length;
    db.withUndo(editing ? `Bild-Karte gespeichert, ${n} ${n === 1 ? "Bereich" : "Bereiche"}.` : `${n} ${n === 1 ? "Karte" : "Karten"} aus dem Bild angelegt.`, (d) => ({
      ...d, meta: { ...d.meta, lastModule: moduleId },
      cards: applyOcclusion(d.cards, { img: im, boxes, mode, front, tags, moduleId, topicId: initial.topicId }, iso(), uid),
    }));
    if (!editing) dropImageLater(db, im); /* falls das Anlegen rückgängig gemacht wird */
    onClose();
  };
  const del = () => {
    db.withUndo(`${groupSize} ${groupSize === 1 ? "Bild-Karte" : "Bild-Karten"} gelöscht.`, (d) => ({ ...d, cards: d.cards.filter((c) => !(isOcc(c) && c.occ.img.id === img.id)) }));
    dropImageLater(db, img);
    onClose();
  };

  const shownBoxes = draft ? [...boxes, { id: "draft", ...draft }] : boxes;
  return (
    <Modal title={editing ? "Bild-Karte bearbeiten" : "Bild-Karte anlegen"} onClose={onClose}>
      <div className="space-y-3">
        {!img ? (
          <div className="empty">
            <p>Foto, Folie oder Diagramm wählen. Danach Rechtecke über die Stellen ziehen, die du abfragen willst: Jedes Rechteck wird eine eigene Karte.</p>
            <label className={`${btnPrimary} mt-3 cursor-pointer`}>Bild wählen<input type="file" accept="image/*" className="sr-only" aria-label="Bild wählen" onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} /></label>
          </div>
        ) : (
          <>
            <div ref={stage} className="occ-stage occ-edit" style={stageStyle(img)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDraft(null); }}>
              {url ? <img src={url} alt="" className="occ-img" draggable={false} /> : <p className="occ-missing">{shown.status === "loading" ? "Bild lädt …" : "Das Bild ist auf diesem Gerät nicht verfügbar."}</p>}
              {shownBoxes.map((b, i) => (
                b.id === "draft" ? <span key="draft" className="occ-box is-draft" style={pos(b)} aria-hidden="true" />
                  : <button key={b.id} type="button" data-box={b.id} className={`occ-box occ-handle${sel === b.id ? " is-target" : ""}`} style={pos(b)}
                    aria-label={`Bereich ${i + 1}`} aria-pressed={sel === b.id} onFocus={() => setSel(b.id)} onKeyDown={(e) => key(e, b)}>
                    <span aria-hidden="true">{i + 1}</span>
                  </button>
              ))}
              {sel && boxes.some((b) => b.id === sel) && (() => { const b = boxes.find((v) => v.id === sel); return (
                <button type="button" className="occ-del" style={{ left: `${(b.x + b.w) * 100}%`, top: `${b.y * 100}%` }} aria-label="Bereich entfernen" onClick={() => remove(b.id)}><span aria-hidden="true">✕</span></button>
              ); })()}
            </div>
            <p className="text-xs text-slate-400">Rechteck aufziehen, antippen zum Auswählen, ziehen zum Verschieben. Mit der Tastatur: Pfeiltasten verschieben, mit Umschalt ändern sie die Größe, Entf löscht.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnGhost} onClick={addBox} disabled={boxes.length >= MAX_BOXES}>+ Bereich</button>
              {!editing && <label className={`${btnGhost} cursor-pointer`}>Anderes Bild<input type="file" accept="image/*" className="sr-only" aria-label="Anderes Bild wählen" onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} /></label>}
              <span className="font-num text-xs text-slate-400">{boxes.length} {boxes.length === 1 ? "Bereich" : "Bereiche"}</span>
            </div>
          </>
        )}
        <div>
          <label htmlFor="occ-mod" className="mb-1 block text-xs text-slate-400">Modul</label>
          <Select id="occ-mod" className={inputCls} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            {modOpts(data).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="occ-front" className="mb-1 block text-xs text-slate-400">Frage</label>
          <input id="occ-front" className={inputCls} value={front} maxLength={200} onChange={(e) => setFront(e.target.value)} placeholder="z. B. Schichten des OSI-Modells" />
        </div>
        <div>
          <label htmlFor="occ-tags" className="mb-1 block text-xs text-slate-400">Tags</label>
          <input id="occ-tags" className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="z. B. netze, klausur" />
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">Beim Lernen</span>
          <Tabs items={[["all", "Alle verdecken"], ["one", "Nur den gesuchten"]]} value={mode} onChange={setMode} label="Beim Lernen verdecken" />
        </div>
        {!db.cloud?.canFiles?.() && <p className="text-[11px] text-slate-500">Ohne Cloud-Sync bleibt das Bild auf diesem Gerät (nicht in Sicherungsdateien enthalten).</p>}
        {err && <p role="alert" className="text-xs text-amber-300">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={save} disabled={busy || !img}>{busy ? "Speichert …" : boxes.length > 1 ? `Speichern (${boxes.length} Karten)` : "Speichern"}</button>
          <button type="button" className={btnGhost} onClick={onClose}>Abbrechen</button>
          {editing && <ConfirmButton label="Löschen" confirmLabel={groupSize > 1 ? `Alle ${groupSize} Karten löschen?` : "Wirklich löschen?"} onConfirm={del} />}
        </div>
      </div>
    </Modal>
  );
}
