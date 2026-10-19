/* Weg zur Uni mit dem Auto: Fahrzeit mit aktueller Verkehrslage. Der Schlüssel bleibt als Secret in der Funktion,
   die App sieht ihn nie. Google Routes API (GOOGLE_MAPS_KEY) oder TomTom Routing (TOMTOM_KEY), je nachdem, was gesetzt ist. */
const COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const geoCache = new Map(); /* Adresse → Koordinaten, solange die Funktion läuft (spart TomTom-Abfragen) */

const place = (s) => String(s || "").trim();
const minutes = (sec) => Math.max(1, Math.round(Number(sec) / 60));

export function driveProvider(env) {
  if (env.GOOGLE_MAPS_KEY) return "google";
  if (env.TOMTOM_KEY) return "tomtom";
  return null;
}

async function getJson(fetchImpl, url, opts = {}) {
  let res;
  try { res = await fetchImpl(url, { signal: AbortSignal.timeout(10000), ...opts }); }
  catch { return { error: "Der Kartendienst antwortet gerade nicht.", status: 502 }; }
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: res.status === 401 || res.status === 403 ? "Der Kartendienst lehnt den Schlüssel ab. Ist die Routen-API dafür freigeschaltet?" : `Der Kartendienst meldet Fehler ${res.status}.`, status: 502 };
  return { data };
}

async function google(from, to, key, fetchImpl) {
  const r = await getJson(fetchImpl, "https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters" },
    body: JSON.stringify({ origin: { address: from }, destination: { address: to }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", languageCode: "de-DE", regionCode: "de" }),
  });
  if (r.error) return r;
  const route = r.data?.routes?.[0];
  if (!route || !route.duration) return { error: "Keine Route gefunden. Stimmen Start und Ziel?", status: 404 };
  const now = parseFloat(route.duration), normal = parseFloat(route.staticDuration || route.duration);
  return { data: { minutes: minutes(now), normal: minutes(normal), km: Math.round((route.distanceMeters || 0) / 100) / 10, provider: "google" } };
}

async function geocode(q, key, fetchImpl) {
  const m = COORD.exec(q);
  if (m) return `${m[1]},${m[2]}`;
  if (geoCache.has(q)) return geoCache.get(q);
  const r = await getJson(fetchImpl, `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&limit=1&countrySet=DE&language=de-DE`);
  const pos = r.data?.results?.[0]?.position;
  if (!pos) return null;
  const v = `${pos.lat},${pos.lon}`;
  geoCache.set(q, v);
  return v;
}

async function tomtom(from, to, key, fetchImpl) {
  const [a, b] = await Promise.all([geocode(from, key, fetchImpl), geocode(to, key, fetchImpl)]);
  if (!a || !b) return { error: `„${!a ? from : to}“ wurde nicht gefunden.`, status: 404 };
  const r = await getJson(fetchImpl, `https://api.tomtom.com/routing/1/calculateRoute/${a}:${b}/json?key=${encodeURIComponent(key)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`);
  if (r.error) return r;
  const s = r.data?.routes?.[0]?.summary;
  if (!s) return { error: "Keine Route gefunden. Stimmen Start und Ziel?", status: 404 };
  return { data: { minutes: minutes(s.travelTimeInSeconds), normal: minutes(s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds), km: Math.round((s.lengthInMeters || 0) / 100) / 10, provider: "tomtom" } };
}

/**
 * Fahrzeit jetzt, mit Verkehr. body: { from, to } als Adresse oder „Breite,Länge“.
 * @returns {Promise<{ data?: { minutes: number, normal: number, km: number, provider: string }, error?: string, status?: number }>}
 */
export async function drive(body, env, fetchImpl) {
  const from = place(body && body.from), to = place(body && body.to);
  if (from.length < 2 || to.length < 2 || from.length > 120 || to.length > 120) return { error: "Bitte Start und Ziel angeben.", status: 400 };
  const provider = driveProvider(env);
  if (provider === "google") return google(from, to, env.GOOGLE_MAPS_KEY, fetchImpl);
  if (provider === "tomtom") return tomtom(from, to, env.TOMTOM_KEY, fetchImpl);
  return { error: "Für Fahrzeiten mit Verkehr fehlt in der Supabase-Funktion ein Schlüssel (GOOGLE_MAPS_KEY oder TOMTOM_KEY).", status: 501 };
}
