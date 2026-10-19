/* Kleine Links zu TUM-Diensten: Raum in NavigaTUM, Aufzeichnung in TUM-Live */
import React from "react";
import { roomUrl, watchProgress } from "../lib/tum.js";

export function PlaceLinks({ room, live, className = "" }) {
  const r = roomUrl(room);
  if (!r && !live) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <div className={`ext-links ${className}`}>
      {r && <a className="ext-link" href={r} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label={`Raum finden: ${room} in NavigaTUM öffnen`}>Raum finden ↗</a>}
      {live && <a className="ext-link" href={live} target="_blank" rel="noopener noreferrer" onClick={stop}>Aufzeichnung ↗</a>}
    </div>
  );
}

/** Wie weit die Aufzeichnung angeschaut ist (selbst eingetragen), als Zeile mit schmalem Balken. */
export function WatchProgress({ s, color, className = "" }) {
  const w = watchProgress(s);
  if (!w) return null;
  const pctText = w.ratio !== null ? `${Math.round(w.ratio * 100)} %` : "";
  return (
    <span className={`watch ${className}`} title={pctText ? `${pctText} der Termindauer` : undefined}>
      <span className="row-meta">Geschaut bis {w.label}{pctText && <span className="sr-only"> ({pctText})</span>}</span>
      {w.ratio !== null && (
        /* span statt div: steht teils in einem Knopf */
        <span className="bar watch-bar" aria-hidden="true"><span style={{ width: `${Math.round(w.ratio * 100)}%`, background: color || "var(--accent)" }} /></span>
      )}
    </span>
  );
}
