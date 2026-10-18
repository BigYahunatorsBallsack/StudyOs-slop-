/* Abfahrten des MVV über die MVG-Schnittstelle (www.mvg.de/api/bgw-pt/v3). Nur zwei Abfragen sind erlaubt,
   die Parameter werden geprüft, die Antwort auf das Nötige gekürzt. */
const BASE = "https://www.mvg.de/api/bgw-pt/v3";
const TYPES = /^(UBAHN|TRAM|BUS|REGIONAL_BUS|SBAHN|SCHIFF|BAHN)(,(UBAHN|TRAM|BUS|REGIONAL_BUS|SBAHN|SCHIFF|BAHN))*$/;

export async function mvg(body, fetchImpl) {
  const kind = body && body.kind;
  let url;
  if (kind === "stations") {
    const q = String(body.query || "").trim();
    if (q.length < 2 || q.length > 80) return { error: "Bitte einen Haltestellennamen eingeben.", status: 400 };
    url = `${BASE}/locations?query=${encodeURIComponent(q)}&locationTypes=STATION`;
  } else if (kind === "departures") {
    const id = String(body.station || "");
    if (!/^de:\d{5}:\d{1,7}$/.test(id)) return { error: "Ungültige Haltestelle.", status: 400 };
    const offset = Math.max(0, Math.min(24 * 60, Math.round(Number(body.offset) || 0)));
    const limit = Math.max(1, Math.min(80, Math.round(Number(body.limit) || 40)));
    const types = String(body.types || "BUS,REGIONAL_BUS");
    if (!TYPES.test(types)) return { error: "Ungültige Verkehrsmittel.", status: 400 };
    url = `${BASE}/departures?globalId=${id}&limit=${limit}&offsetInMinutes=${offset}&transportTypes=${types}`;
  } else return { error: "Unbekannte Abfrage.", status: 400 };
  let res;
  try { res = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } }); }
  catch { return { error: "Die MVG antwortet gerade nicht.", status: 502 }; }
  if (!res.ok) return { error: `Die MVG meldet Fehler ${res.status}.`, status: 502 };
  const raw = await res.json().catch(() => null);
  if (!Array.isArray(raw)) return { error: "Unerwartete Antwort der MVG.", status: 502 };
  if (kind === "stations") return { data: raw.filter((s) => s.globalId).slice(0, 10).map((s) => ({ id: s.globalId, name: s.name, place: s.place || "", types: s.transportTypes || [] })) };
  return { data: raw.map((d) => ({
    line: String(d.label || ""), destination: String(d.destination || ""), type: d.transportType || "",
    planned: Number(d.plannedDepartureTime) || 0, time: Number(d.realtimeDepartureTime || d.plannedDepartureTime) || 0,
    delay: Number(d.delayInMinutes) || 0, realtime: !!d.realtime, cancelled: !!d.cancelled,
  })).filter((d) => d.time) };
}
