/* Kopfzeile: vor dem ersten Termin vor Ort klein die Abfahrt („S6 07:47 (+3)“, mit dem Auto „Los 07:40“),
   sonst während eines Termins die Restzeit. Die Abfahrt kommt aus dem Zwischenspeicher von „Weg zur Uni“;
   abgefragt wird nur, wenn dort kein frischer Stand liegt. */
import React, { useEffect, useState } from "react";
import { commuteIncomplete, commuteOf } from "../lib/transit.js";
import { carKey, departureChip, headerSession, HEADER_LEAD, loadDrive, loadTransit, readCache, transitKey, WEG_EVENT } from "../lib/wegcache.js";
import { liveSession } from "../lib/dayview.js";
import { iso, nowHM } from "../lib/util.js";
import { LiveLeft } from "./dayview.jsx";

/* Ab diesem Alter holt die Kopfzeile selbst einen neuen Stand (die Karte auf „Heute“ erneuert öfter) */
const FRESH = { transit: 5 * 60000, car: 10 * 60000 };
/* Läuft ein Termin, hat die Restzeit Vorrang, bis das Losgehen so nah ist */
const DEP_FIRST = 30 * 60000;

/** Die Abfahrt für die Kopfzeile oder null; holt bei Bedarf einen neuen Stand */
export function useDeparture(db, now) {
  const settings = db.data.settings;
  const c = settings.commuteHeader === false ? null : commuteOf(settings);
  const ok = !!c && !commuteIncomplete(c);
  const car = c?.mode === "car";
  const session = ok ? headerSession(db.data.sessions, new Date(now)) : null;
  const [, setVer] = useState(0);
  useEffect(() => {
    const on = () => setVer((v) => v + 1);
    window.addEventListener(WEG_EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(WEG_EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  const from = car ? (c.car.fromHere && readCache("pos")?.pos) || c.car.from : "";
  const hit = !session ? null : car ? readCache(carKey(from, c.car.to)) : readCache(transitKey(c, session));
  const stale = !hit || now - hit.at > FRESH[car ? "car" : "transit"];
  /* nur abfragen, wenn die Veranstaltung so nah ist, dass die Abfahrt bald oben stehen kann */
  const startMs = session ? new Date(`${session.date}T${session.start}:00`).getTime() : 0;
  const soon = !!session && startMs - now <= (HEADER_LEAD + 150) * 60000;
  const ready = db.cloud?.phase === "ready";
  const slot = Math.floor(now / 60000);
  useEffect(() => {
    if (!ready || !soon || !stale) return;
    (car ? loadDrive(db.cloud, from, c.car.to, from !== c.car.from) : loadTransit(db.cloud, c, session)).catch(() => { /* offline: dann eben nichts oben */ });
  }, [ready, soon, stale, session?.id, car, from, slot]);
  if (!session || !hit) return null;
  return departureChip({ c, session, raw: car ? null : hit, route: car ? hit.route : null, now });
}

/* Zur Karte „Weg zur Uni“ auf „Heute“: aufklappen, falls zu, und hinscrollen */
function showCommute(db) {
  db.goTab("heute");
  setTimeout(() => {
    const g = document.querySelector(".group-commute");
    if (!g) return;
    const t = g.querySelector(".group-toggle");
    if (t && t.getAttribute("aria-expanded") === "false") t.click();
    g.scrollIntoView({ block: "start" });
  }, 0);
}

/** Kopfzeile: Abfahrt oder Restzeit des laufenden Termins, nie beides */
export function HeaderNow({ db }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  const dep = useDeparture(db, now);
  const live = liveSession(db.data.sessions || [], iso(), nowHM());
  if (dep && (!live || dep.leaveAt - now <= DEP_FIRST)) {
    return <button className="dep-chip font-num" onClick={() => showCommute(db)} aria-label={dep.label} title={dep.label}>{dep.text}</button>;
  }
  return <LiveLeft data={db.data} />;
}
