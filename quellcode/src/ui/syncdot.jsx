/* Sync-Status oben in der Kopfzeile: ein Punkt, nur wenn der Cloud-Sync eingerichtet ist.
   Grün abgeglichen, gelb (ruhig, ohne Blinken) gleicht gerade ab, rot bei Fehler, grau offline. */
import React from "react";
import { syncDotState } from "../lib/syncdot.js";

/** Antippen gleicht ab; bei Fehler öffnet es die Cloud-Einstellungen. */
export function SyncDot({ cloud, onOpenSettings }) {
  const s = syncDotState(cloud);
  if (!s) return null;
  const click = () => { if (s.tone === "error") onOpenSettings(); else cloud.syncNow(); };
  return (
    <button type="button" onClick={click} className="btn btn-ghost btn-icon sync-dot" aria-label={s.label} title={s.label} data-tone={s.tone}>
      <span className={`sync-dot-mark sync-${s.tone}`} aria-hidden="true" />
    </button>
  );
}
