/* Zustand des Sync-Punkts in der Kopfzeile (ui/syncdot.jsx) aus dem Cloud-Sync-Zustand */
import { dayOf, fmt, iso } from "./util.js";

/** Uhrzeit HH:MM eines Zeitstempels in Ortszeit, leer ohne gültigen Zeitstempel */
export const hmOf = (s) => {
  const d = new Date(s || "");
  if (!s || Number.isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};

/** { tone: ok | busy | error | offline, label } oder null, wenn kein Cloud-Sync eingerichtet ist. */
export function syncDotState(cloud) {
  if (!cloud || !cloud.available || cloud.phase !== "ready") return null;
  const at = hmOf(cloud.lastSync);
  /* nicht von heute: mit Datum davor */
  const day = at && dayOf(cloud.lastSync) !== iso() ? fmt(cloud.lastSync) + " " : "";
  const last = at ? `Zuletzt abgeglichen ${day}${at}` : "Noch nicht abgeglichen";
  if (cloud.status === "error") return { tone: "error", label: `Sync-Fehler. ${last}` };
  if (cloud.status === "offline") return { tone: "offline", label: `Offline. ${last}` };
  if (cloud.status === "syncing") return { tone: "busy", label: `Gleicht ab. ${last}` };
  return { tone: "ok", label: `Abgeglichen. ${last}` };
}
