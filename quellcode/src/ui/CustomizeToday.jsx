/* „Heute anpassen“: Bereiche ein- und ausblenden und umsortieren (am Griff ziehen oder mit den Pfeilen) */
import React, { useRef, useState } from "react";
import { Modal } from "./primitives.jsx";
import { btnGhost } from "./styles.js";
import { moveBlock, todayLayout } from "../lib/todayLayout.js";

export function CustomizeToday({ db, onClose }) {
  const layout = todayLayout(db.data.settings);
  const list = useRef(null);
  const [drag, setDrag] = useState(null); /* { id, to } während des Ziehens */

  const save = (order, hidden = layout.filter((b) => b.hidden).map((b) => b.id)) => db.patchSettings({ todayOrder: order, todayHidden: hidden });
  const move = (from, to) => save(moveBlock(layout, from, to));
  const toggle = (id, show) => save(layout.map((b) => b.id), layout.filter((b) => (b.id === id ? !show : b.hidden)).map((b) => b.id));

  /* Ziehen am Griff: Zielposition aus der Mitte der Zeilen unter dem Finger */
  const targetAt = (y) => {
    const rows = [...(list.current?.children || [])];
    const i = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    return i < 0 ? rows.length - 1 : i;
  };
  const onDown = (e, id) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, to: layout.findIndex((b) => b.id === id) });
  };
  const onMoveP = (e) => { if (drag) setDrag({ ...drag, to: targetAt(e.clientY) }); };
  const onUp = () => {
    if (!drag) return;
    move(layout.findIndex((b) => b.id === drag.id), drag.to);
    setDrag(null);
  };

  /* Während des Ziehens die Vorschau zeigen */
  const shown = drag ? moveBlock(layout, layout.findIndex((b) => b.id === drag.id), drag.to).map((id) => layout.find((b) => b.id === id)) : layout;

  return (
    <Modal title="Heute anpassen" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">Haken weg blendet einen Bereich aus. Am Griff ziehen oder mit den Pfeilen verschieben. „Weg zur Uni“ und „Mensa“ erscheinen nur, wenn sie eingerichtet sind.</p>
      <ul ref={list} className="customize" aria-label="Bereiche auf Heute">
        {shown.map((b, i) => (
          <li key={b.id} className={`customize-row ${drag?.id === b.id ? "customize-drag" : ""}`}>
            <button type="button" className="customize-grip" aria-label={`${b.label} ziehen`} onPointerDown={(e) => onDown(e, b.id)} onPointerMove={onMoveP} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
              <span aria-hidden="true">⠿</span>
            </button>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={!b.hidden} onChange={(e) => toggle(b.id, e.target.checked)} />
              <span className="truncate">{b.label}</span>
            </label>
            <button type="button" className="btn btn-ghost btn-icon" aria-label={`${b.label} nach oben`} disabled={i === 0} onClick={() => move(i, i - 1)}><span aria-hidden="true">↑</span></button>
            <button type="button" className="btn btn-ghost btn-icon" aria-label={`${b.label} nach unten`} disabled={i === shown.length - 1} onClick={() => move(i, i + 1)}><span aria-hidden="true">↓</span></button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <button className={btnGhost} onClick={() => db.patchSettings({ todayOrder: undefined, todayHidden: undefined })}>Standard wiederherstellen</button>
      </div>
    </Modal>
  );
}
