/* Kleine Links zu TUM-Diensten: Raum in NavigaTUM, Aufzeichnung in TUM-Live */
import React from "react";
import { roomUrl } from "../lib/tum.js";

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
