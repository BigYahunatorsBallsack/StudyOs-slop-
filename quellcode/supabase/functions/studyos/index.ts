// StudyOS Edge Function – automatisch erzeugt aus src/server/ (npm run build). Nicht von Hand ändern.
// Einrichtung: siehe supabase/EINRICHTUNG.md
// @ts-nocheck
// src/server/reminders.js
function zonedInstant(date, hm2, tz = "Europe/Berlin") {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (hm2 || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t2) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t2)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - t2;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}
var addDays = (date, n) => {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
var RULES = {
  homework: [[1, "18:00", "Abgabe morgen", (x) => `${x.title}${x.module ? ` (${x.module})` : ""}${x.time ? `, bis ${x.time} Uhr` : ""}`], [0, "08:00", "Abgabe heute", (x) => `${x.title}${x.module ? ` (${x.module})` : ""}${x.time ? `, bis ${x.time} Uhr` : ""}`]],
  exam: [[7, "18:00", "Pr\xFCfung in einer Woche", (x) => x.module || x.title], [1, "18:00", "Pr\xFCfung morgen", (x) => `${x.module || x.title}${x.time ? ` um ${x.time}` : ""}`]],
  register: [[3, "18:00", "Anmeldeschluss in 3 Tagen", (x) => `Pr\xFCfung ${x.module || x.title}`], [0, "08:00", "Anmeldeschluss heute", (x) => `Pr\xFCfung ${x.module || x.title}`]],
  retake: [[7, "18:00", "Wiederholungspr\xFCfung in einer Woche", (x) => x.module || x.title], [1, "18:00", "Wiederholungspr\xFCfung morgen", (x) => x.module || x.title]],
  review: [[0, "20:00", "Noch nachzubereiten", (x) => x.body || x.title]],
  /* Abends: noch nicht als besucht abgehakte Termine des Tages, höchstens 3 Stunden verspätet */
  attend: [[0, (x) => x.time || "19:00", "Heute besucht?", (x) => x.body || x.title, 3 * 36e5]],
  weekly: [[0, "18:00", "Deine n\xE4chste Woche", (x) => x.body || x.title]],
  /* Lernblock: 10 Minuten vor Beginn, höchstens 20 Minuten verspätet */
  /* Stundenplan geändert: sofort, höchstens 2 Stunden verspätet */
  change: [[0, (x) => x.time, "Stundenplan ge\xE4ndert", (x) => `${x.title}: ${x.body || "ge\xE4ndert"}`, 2 * 36e5]],
  block: [[0, (x) => minus(x.time, 10), "Gleich: Lernblock", (x) => `${x.time} ${x.title}${x.module ? ` (${x.module})` : ""}`, 20 * 6e4]],
  /* Tagesüberblick zur gewählten Uhrzeit, höchstens 2 Stunden verspätet */
  morning: [[0, (x) => x.time || "07:00", "Dein Tag", (x) => x.body || x.title, 2 * 36e5]]
};
var act = (action, title, q) => ({ action, title, url: `./?aktion=push&${q}` });
var ACTIONS = {
  homework: (x) => [act("done", "Abgegeben", `tun=abgegeben&id=${encodeURIComponent(x.id)}`), act("later", "Verschieben", `tun=verschieben&id=${encodeURIComponent(x.id)}`)],
  review: (x) => [act("reviewed", "Alles nachbereitet", `tun=nachbereitet&tag=${x.date}`)],
  attend: (x) => [act("attended", "Alle besucht", `tun=besucht&tag=${x.date}`)],
  block: (x) => [act("timer", "Timer starten", `tun=timer&id=${encodeURIComponent(x.id)}`)],
  register: (x) => [act("registered", "Angemeldet", `tun=angemeldet&id=${encodeURIComponent(x.id)}`)]
};
var minus = (hm2, n) => {
  const [h, m] = String(hm2 || "00:00").split(":").map(Number);
  const t = Math.max(0, h * 60 + m - n);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
var MAX_LATE_MS = 12 * 3600 * 1e3;
function dueReminders(deadlines, sent = {}, now2 = /* @__PURE__ */ new Date(), tz = "Europe/Berlin") {
  const out = [];
  for (const x of deadlines || []) {
    const rules = RULES[x.kind];
    if (!rules || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) continue;
    rules.forEach(([before, hm2, title, body, maxLate = MAX_LATE_MS], i) => {
      const time = typeof hm2 === "function" ? hm2(x) : hm2;
      const at2 = zonedInstant(addDays(x.date, -before), time, tz);
      const key = `${x.kind}:${x.id}:${x.date}:${x.kind === "block" ? x.time + ":" : ""}${i}`;
      if (sent[key] || at2 > now2 || now2.getTime() - at2.getTime() > maxLate) return;
      out.push({
        key,
        title,
        body: body(x),
        tag: `${x.kind}-${x.id}`,
        url: ["homework", "review", "attend", "weekly", "block", "change", "morning"].includes(x.kind) ? "./?aktion=heute" : "./?aktion=pruefungen",
        ...ACTIONS[x.kind] && { actions: ACTIONS[x.kind](x) }
      });
    });
  }
  return out;
}
function pruneSent(sent = {}, now2 = /* @__PURE__ */ new Date()) {
  const limit = now2.getTime() - 60 * 864e5;
  return Object.fromEntries(Object.entries(sent).filter(([, at2]) => new Date(at2).getTime() >= limit));
}

// src/server/calendar.js
var LABEL = { homework: "Abgabe", exam: "Pr\xFCfung", register: "Anmeldeschluss", retake: "Wiederholungspr\xFCfung" };
var esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, ";").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
var utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
var day = (date) => date.replace(/-/g, "");
var nextDay = (date) => {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
var fold = (line) => {
  const out = [];
  let s = line;
  while (s.length > 74) {
    out.push(s.slice(0, 74));
    s = " " + s.slice(74);
  }
  out.push(s);
  return out.join("\r\n");
};
function buildDeadlineIcs(deadlines, tz = "Europe/Berlin", now2 = /* @__PURE__ */ new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyOS//Fristen//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:StudyOS Fristen", "X-PUBLISHED-TTL:PT3H", "REFRESH-INTERVAL;VALUE=DURATION:PT3H"];
  for (const x of deadlines || []) {
    const label = LABEL[x.kind];
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) continue;
    const what = x.kind === "homework" ? `${label}: ${x.title}${x.module ? ` (${x.module})` : ""}` : `${label}: ${x.module || x.title}`;
    lines.push("BEGIN:VEVENT", `UID:${esc(`${x.kind}-${x.id}`)}@studyos`, `DTSTAMP:${utc(now2)}`, `SUMMARY:${esc(what)}`);
    if (/^\d{2}:\d{2}$/.test(x.time || "")) {
      const start = zonedInstant(x.date, x.time, tz);
      const end = new Date(start.getTime() + (x.kind === "exam" ? 120 : 30) * 6e4);
      lines.push(`DTSTART:${utc(x.kind === "homework" ? new Date(start.getTime() - 30 * 6e4) : start)}`, `DTEND:${utc(x.kind === "homework" ? start : end)}`);
    } else lines.push(`DTSTART;VALUE=DATE:${day(x.date)}`, `DTEND;VALUE=DATE:${day(nextDay(x.date))}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// src/server/mvg.js
var BASE = "https://www.mvg.de/api/bgw-pt/v3";
var TYPES = /^(UBAHN|TRAM|BUS|REGIONAL_BUS|SBAHN|SCHIFF|BAHN)(,(UBAHN|TRAM|BUS|REGIONAL_BUS|SBAHN|SCHIFF|BAHN))*$/;
async function mvg(body, fetchImpl) {
  const kind = body && body.kind;
  let url;
  if (kind === "stations") {
    const q = String(body.query || "").trim();
    if (q.length < 2 || q.length > 80) return { error: "Bitte einen Haltestellennamen eingeben.", status: 400 };
    url = `${BASE}/locations?query=${encodeURIComponent(q)}&locationTypes=STATION`;
  } else if (kind === "departures") {
    const id = String(body.station || "");
    if (!/^de:\d{5}:\d{1,7}$/.test(id)) return { error: "Ung\xFCltige Haltestelle.", status: 400 };
    const offset = Math.max(0, Math.min(24 * 60, Math.round(Number(body.offset) || 0)));
    const limit = Math.max(1, Math.min(80, Math.round(Number(body.limit) || 40)));
    const types = String(body.types || "BUS,REGIONAL_BUS");
    if (!TYPES.test(types)) return { error: "Ung\xFCltige Verkehrsmittel.", status: 400 };
    url = `${BASE}/departures?globalId=${id}&limit=${limit}&offsetInMinutes=${offset}&transportTypes=${types}`;
  } else if (kind === "messages") {
    const lines = Array.isArray(body.lines) ? body.lines.map((l) => String(l).trim()).filter(Boolean) : [];
    if (!lines.length || lines.length > 6 || lines.some((l) => !/^[A-Za-z0-9]{1,6}$/.test(l))) return { error: "Ung\xFCltige Linien.", status: 400 };
    url = `${BASE}/messages`;
  } else return { error: "Unbekannte Abfrage.", status: 400 };
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(1e4), headers: { Accept: "application/json" } });
  } catch {
    return { error: "Die MVG antwortet gerade nicht.", status: 502 };
  }
  if (!res.ok) return { error: `Die MVG meldet Fehler ${res.status}.`, status: 502 };
  const raw = await res.json().catch(() => null);
  if (!Array.isArray(raw)) return { error: "Unerwartete Antwort der MVG.", status: 502 };
  if (kind === "messages") return { data: lineMessages(raw, body.lines, Number(body.now) || Date.now()) };
  if (kind === "stations") return { data: raw.filter((s) => s.globalId).slice(0, 10).map((s) => ({ id: s.globalId, name: s.name, place: s.place || "", types: s.transportTypes || [] })) };
  return { data: raw.map((d) => ({
    line: String(d.label || ""),
    destination: String(d.destination || ""),
    type: d.transportType || "",
    planned: Number(d.plannedDepartureTime) || 0,
    time: Number(d.realtimeDepartureTime || d.plannedDepartureTime) || 0,
    delay: Number(d.delayInMinutes) || 0,
    realtime: !!d.realtime,
    cancelled: !!d.cancelled,
    platform: d.platform ? String(d.platform).slice(0, 8) : ""
  })).filter((d) => d.time) };
}
var plain = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
function lineMessages(raw, lines, now2 = Date.now()) {
  const want = new Set(lines.map((l) => String(l).toLowerCase()));
  return raw.filter((m) => (m.lines || []).some((l) => want.has(String(l.label || "").toLowerCase()))).filter((m) => (Number(m.validTo) || Infinity) >= now2 && (Number(m.validFrom) || 0) <= now2 + 864e5).map((m) => ({
    title: plain(m.title).slice(0, 200),
    text: plain(m.description).slice(0, 800),
    incident: m.type === "INCIDENT",
    from: Number(m.validFrom) || null,
    to: Number(m.validTo) || null,
    lines: [...new Set((m.lines || []).map((l) => String(l.label || "")).filter((l) => want.has(l.toLowerCase())))]
  })).sort((a, b) => Number(b.incident) - Number(a.incident) || (a.from || 0) - (b.from || 0)).slice(0, 8);
}

// src/server/drive.js
var COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
var geoCache = /* @__PURE__ */ new Map();
var place = (s) => String(s || "").trim();
var minutes = (sec) => Math.max(1, Math.round(Number(sec) / 60));
function driveProvider(env2) {
  if (env2.GOOGLE_MAPS_KEY) return "google";
  if (env2.TOMTOM_KEY) return "tomtom";
  return null;
}
async function getJson(fetchImpl, url, opts = {}) {
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(1e4), ...opts });
  } catch {
    return { error: "Der Kartendienst antwortet gerade nicht.", status: 502 };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: res.status === 401 || res.status === 403 ? "Der Kartendienst lehnt den Schl\xFCssel ab. Ist die Routen-API daf\xFCr freigeschaltet?" : `Der Kartendienst meldet Fehler ${res.status}.`, status: 502 };
  return { data };
}
var waypoint = (s) => {
  const m = COORD.exec(s);
  return m ? { location: { latLng: { latitude: Number(m[1]), longitude: Number(m[2]) } } } : { address: s };
};
async function google(from, to, key, fetchImpl) {
  const r = await getJson(fetchImpl, "https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters" },
    body: JSON.stringify({ origin: waypoint(from), destination: waypoint(to), travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", languageCode: "de-DE", regionCode: "de" })
  });
  if (r.error) return r;
  const route = r.data?.routes?.[0];
  if (!route || !route.duration) return { error: "Keine Route gefunden. Stimmen Start und Ziel?", status: 404 };
  const now2 = parseFloat(route.duration), normal = parseFloat(route.staticDuration || route.duration);
  return { data: { minutes: minutes(now2), normal: minutes(normal), km: Math.round((route.distanceMeters || 0) / 100) / 10, provider: "google" } };
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
  if (!a || !b) return { error: `\u201E${!a ? from : to}\u201C wurde nicht gefunden.`, status: 404 };
  const r = await getJson(fetchImpl, `https://api.tomtom.com/routing/1/calculateRoute/${a}:${b}/json?key=${encodeURIComponent(key)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`);
  if (r.error) return r;
  const s = r.data?.routes?.[0]?.summary;
  if (!s) return { error: "Keine Route gefunden. Stimmen Start und Ziel?", status: 404 };
  return { data: { minutes: minutes(s.travelTimeInSeconds), normal: minutes(s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds), km: Math.round((s.lengthInMeters || 0) / 100) / 10, provider: "tomtom" } };
}
async function drive(body, env2, fetchImpl) {
  const from = place(body && body.from), to = place(body && body.to);
  if (from.length < 2 || to.length < 2 || from.length > 120 || to.length > 120) return { error: "Bitte Start und Ziel angeben.", status: 400 };
  const provider = driveProvider(env2);
  if (provider === "google") return google(from, to, env2.GOOGLE_MAPS_KEY, fetchImpl);
  if (provider === "tomtom") return tomtom(from, to, env2.TOMTOM_KEY, fetchImpl);
  return { error: "F\xFCr Fahrzeiten mit Verkehr fehlt in der Supabase-Funktion ein Schl\xFCssel (GOOGLE_MAPS_KEY oder TOMTOM_KEY).", status: 501 };
}

// src/lib/transit.js
var words = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
function matches(d, leg) {
  const dest = d.destination.toLowerCase();
  if (leg.line && d.line.toLowerCase() !== String(leg.line).toLowerCase()) return false;
  const want = words(leg.towards);
  if (want.length && !want.some((w) => dest.includes(w))) return false;
  return !words(leg.avoid).some((w) => dest.includes(w));
}
var at = (date, hm2) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hm2.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
};
function recommend(departures2, session, c, feederDeps = null, startMs = null) {
  if (!session) return null;
  const deadline = (startMs ?? at(session.date, session.start)) - c.buffer * 6e4;
  const buses = departures2.filter((d) => matches(d, c) && !d.cancelled && d.time + c.travel * 6e4 <= deadline).sort((a, b) => b.time - a.time);
  for (const dep of buses) {
    if (!c.feeder || !feederDeps) return { dep, feederDep: null, session, leaveAt: dep.time - c.walk * 6e4, arriveAt: dep.time + c.travel * 6e4 };
    const f = c.feeder;
    const fd = feederDeps.filter((d) => matches(d, f) && !d.cancelled && d.time + (f.travel + f.transfer) * 6e4 <= dep.time).sort((a, b) => b.time - a.time)[0];
    if (fd) return { dep, feederDep: fd, session, leaveAt: fd.time - c.walk * 6e4, changeAt: fd.time + f.travel * 6e4, arriveAt: dep.time + c.travel * 6e4 };
  }
  return null;
}
function vehicle(d) {
  const line = String(d?.line || "");
  const type = String(d?.type || "");
  if (/BUS/.test(type) || /^\d/.test(line)) return { icon: "bus", with: `mit dem Bus ${line}` };
  if (type === "TRAM") return { icon: "tram", with: `mit der Tram ${line}` };
  return { icon: "train", with: line ? `mit der ${line}` : "mit der Bahn" };
}

// src/server/commute.js
var TYPES2 = "BUS,REGIONAL_BUS,SBAHN,UBAHN,TRAM,BAHN";
var MIN = 6e4;
var EARLIER_MS = 3 * MIN;
var hm = (ms, tz) => new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
var lineName = (l) => /^\d/.test(l || "") ? `Bus ${l}` : l;
function commuteWindow(x, tz = "Europe/Berlin") {
  const c = x.commute;
  const start = zonedInstant(x.date, x.time, tz).getTime();
  const lead = (c.buffer + c.travel + c.walk + (c.feeder ? c.feeder.travel + c.feeder.transfer : 0)) * MIN;
  return { start, from: start - lead - 75 * MIN, to: start - lead - 5 * MIN };
}
function reason(plan, main, feeder, tz) {
  const find = (list, d) => (list || []).find((r) => r.line === d.line && r.planned === d.planned);
  const out = [];
  for (const [d, list] of [[plan.feederDep, feeder], [plan.dep, main]]) {
    if (!d) continue;
    const r = find(list, d);
    if (r?.cancelled) out.push(`${lineName(d.line)} um ${hm(d.planned, tz)} f\xE4llt aus`);
    else if (r && r.delay > 0) out.push(`${lineName(d.line)} um ${hm(d.planned, tz)} +${r.delay}`);
  }
  return out.join(", ");
}
async function departures(c, startMs, t, fetchImpl) {
  const offset = (ms) => Math.max(0, Math.round((ms - t) / MIN) - 45);
  const mainLatest = startMs - (c.buffer + c.travel) * MIN;
  const main = await mvg({ kind: "departures", station: c.station.id, types: TYPES2, offset: offset(mainLatest), limit: 60 }, fetchImpl);
  if (main.error) return null;
  let feeder = null;
  if (c.feeder && c.feeder.station && c.feeder.station.id) {
    const r = await mvg({ kind: "departures", station: c.feeder.station.id, types: TYPES2, offset: offset(mainLatest - (c.feeder.transfer + c.feeder.travel) * MIN), limit: 60 }, fetchImpl);
    if (r.error) return null;
    feeder = r.data;
  }
  return { main: main.data, feeder };
}
async function commuteAlert(x, now2, tz, fetchImpl) {
  const c = x.commute;
  if (!c || !c.station || !c.station.id || !/^\d{2}:\d{2}$/.test(x.time || "")) return null;
  const w = commuteWindow(x, tz), t = now2.getTime();
  if (t < w.from || t > w.to) return null;
  const deps = await departures(c, w.start, t, fetchImpl);
  if (!deps) return null;
  const { main, feeder } = deps;
  const session = { date: x.date, start: x.time };
  const byPlan = (list) => list && list.map((d) => ({ ...d, time: d.planned || d.time, cancelled: false }));
  const plan = recommend(byPlan(main), session, c, byPlan(feeder), w.start);
  if (!plan) return null;
  const real = recommend(main, session, c, feeder, w.start);
  if (real && plan.leaveAt - real.leaveAt < EARLIER_MS) return null;
  const why = reason(plan, main, feeder, tz);
  const what = `${x.title || "deine Vorlesung"} um ${x.time}`;
  return {
    key: `commute:${x.id}:${x.date}:${real ? hm(real.leaveAt, tz) : "keine"}`,
    title: real ? `Fr\xFCher los: ${hm(real.leaveAt, tz)}` : "Keine passende Verbindung",
    body: real ? `F\xFCr ${what} um ${hm(real.leaveAt, tz)} statt ${hm(plan.leaveAt, tz)} losgehen${why ? ` (${why})` : ""}.` : `F\xFCr ${what} passt laut Echtzeit keine Verbindung mehr${why ? ` (${why})` : ""}.`,
    tag: `commute-${x.date}`,
    url: "./?aktion=heute"
  };
}
var LEAVE_AHEAD = 15 * MIN;
var LEAVE_LATE = 5 * MIN;
var CAR_FROM = 3 * 60 * MIN;
async function leaveAlert(x, now2, tz, fetchImpl, env2 = {}) {
  const c = x.commute;
  if (!c || !/^\d{2}:\d{2}$/.test(x.time || "")) return null;
  const start = zonedInstant(x.date, x.time, tz).getTime(), t = now2.getTime();
  if (t >= start) return null;
  let leaveAt, how;
  if (c.mode === "car") {
    if (!c.car || !c.car.from || !c.car.to || t < start - CAR_FROM || !driveProvider(env2)) return null;
    const r = await drive({ from: c.car.from, to: c.car.to }, env2, fetchImpl);
    if (r.error || !r.data) return null;
    const { minutes: minutes2, normal } = r.data;
    leaveAt = start - ((Number(c.buffer) || 0) + (Number(c.car.park) || 0) + minutes2) * MIN;
    how = `mit dem Auto ${minutes2} Min.${minutes2 > normal + 2 ? ` wegen Verkehr (sonst ${normal})` : ""}`;
  } else {
    if (!c.station || !c.station.id) return null;
    const w = commuteWindow(x, tz), latest = w.to + 5 * MIN;
    if (t < latest - 90 * MIN || t > latest) return null;
    const deps = await departures(c, start, t, fetchImpl);
    if (!deps) return null;
    const real = recommend(deps.main, { date: x.date, start: x.time }, c, deps.feeder, start);
    if (!real) return null;
    const first = real.feederDep || real.dep;
    leaveAt = real.leaveAt;
    how = `${vehicle(first).with} um ${hm(first.time, tz)}${first.delay > 0 ? ` (+${first.delay})` : ""}`;
  }
  const left = leaveAt - t;
  if (left > LEAVE_AHEAD || left < -LEAVE_LATE) return null;
  return {
    key: `leave:${x.id}:${x.date}`,
    title: left <= 2 * MIN ? "Jetzt losgehen" : `Um ${hm(leaveAt, tz)} losgehen`,
    body: `F\xFCr ${x.title || "deine Vorlesung"} um ${x.time}: ${how}.`,
    tag: `leave-${x.date}`,
    url: "./?aktion=heute",
    ttl: 30 * 60
  };
}

// src/server/webpush.js
var enc = new TextEncoder();
var b64url = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var fromB64url = (str) => {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
};
var concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey, privateJwk };
}
async function vapidHeader(endpoint, vapid, now2 = Math.floor(Date.now() / 1e3)) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(enc.encode(JSON.stringify({ aud, exp: now2 + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey("jwk", { ...vapid.privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${vapid.publicKey}`;
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}
async function encryptPayload(subscription, plaintext, { salt = crypto.getRandomValues(new Uint8Array(16)), serverKeys } = {}) {
  const uaPublic = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);
  const as = serverKeys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const data = typeof plaintext === "string" ? enc.encode(plaintext) : plaintext;
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}
async function sendPush(subscription, message, vapid, { ttl = 24 * 3600, urgency = "normal", fetchImpl = fetch } = {}) {
  const body = await encryptPayload(subscription, JSON.stringify(message));
  const res = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency
    },
    body
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// src/server/handler.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var fail = (message, status) => json({ error: message }, status);
var ICS_HOSTS = [/(^|\.)tum\.de$/i, /^cal\.tum\.app$/i];
var ICS_MAX_BYTES = 3 * 1024 * 1024;
function serviceKey(env2) {
  try {
    const keys = JSON.parse(env2.SUPABASE_SECRET_KEYS || "null");
    if (keys && typeof keys === "object") return keys.default || Object.values(keys)[0];
  } catch {
  }
  return env2.SUPABASE_SERVICE_ROLE_KEY;
}
function db(env2, fetchImpl) {
  const key = serviceKey(env2);
  if (!key || !env2.SUPABASE_URL) throw new Error("SUPABASE_URL oder Service-Schl\xFCssel fehlt in der Funktionsumgebung.");
  const headers = { apikey: key, "Content-Type": "application/json", ...String(key).startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` } };
  return async (path, { method = "GET", body, prefer } = {}) => {
    const res = await fetchImpl(`${env2.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...headers, ...prefer ? { Prefer: prefer } : {} }, body: body === void 0 ? void 0 : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Datenbank ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function serverConfig(q) {
  const rows = await q("studyos_server?id=eq.1&select=*");
  if (!rows || !rows.length) throw new Error("Tabelle studyos_server ist leer. Bitte supabase/schema.sql erneut ausf\xFChren.");
  return rows[0];
}
async function ensureVapid(q) {
  let cfg = await serverConfig(q);
  if (!cfg.vapid_public) {
    const keys = await generateVapidKeys();
    const updated = await q("studyos_server?id=eq.1&vapid_public=is.null", { method: "PATCH", body: { vapid_public: keys.publicKey, vapid_private: keys.privateJwk }, prefer: "return=representation" });
    cfg = updated && updated.length ? updated[0] : await serverConfig(q);
  }
  return cfg;
}
var AUTH_TTL = 5 * 6e4;
var authCache = /* @__PURE__ */ new Map();
function tokenExp(token) {
  try {
    return Number(JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp) * 1e3 || 0;
  } catch {
    return 0;
  }
}
async function authUser(req, env2, fetchImpl, now2 = Date.now()) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const hit = authCache.get(token);
  if (hit && hit.until > now2) return hit.user;
  const res = await fetchImpl(`${env2.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey(env2) } });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  const exp = tokenExp(token);
  if (exp > now2) {
    if (authCache.size > 200) authCache.clear();
    authCache.set(token, { user, until: Math.min(now2 + AUTH_TTL, exp) });
  }
  return user;
}
async function runReminders({ q, cfg, now: now2 = /* @__PURE__ */ new Date(), fetchImpl, subject, env: env2 = {} }) {
  const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject };
  const rows = await q("studyos_push?select=user_id,subscriptions,deadlines,sent,tz") || [];
  const stats = { users: rows.length, sent: 0, failed: 0, removed: 0 };
  for (const row of rows) {
    let subs = Array.isArray(row.subscriptions) ? row.subscriptions : [];
    const sent = pruneSent(row.sent || {}, now2);
    const tz = row.tz || "Europe/Berlin";
    const due = subs.length ? dueReminders(row.deadlines, sent, now2, tz) : [];
    if (subs.length) for (const x of (row.deadlines || []).filter((d) => d.kind === "commute")) {
      const alert = await commuteAlert(x, now2, tz, fetchImpl).catch(() => null);
      if (alert && !sent[alert.key]) due.push(alert);
    }
    if (subs.length) for (const x of (row.deadlines || []).filter((d) => d.kind === "leave")) {
      if (sent[`leave:${x.id}:${x.date}`]) continue;
      const alert = await leaveAlert(x, now2, tz, fetchImpl, env2).catch(() => null);
      if (alert) due.push(alert);
    }
    const gone = /* @__PURE__ */ new Set();
    for (const r of due) {
      let delivered = false, allGone = true;
      for (const sub of subs) {
        if (gone.has(sub.endpoint)) continue;
        try {
          const res = await sendPush(sub, { title: r.title, body: r.body, tag: r.tag, url: r.url, ...r.actions && { actions: r.actions } }, vapid, { fetchImpl, ...r.ttl && { ttl: r.ttl } });
          if (res.ok) {
            delivered = true;
            allGone = false;
            stats.sent++;
          } else if (res.gone) gone.add(sub.endpoint);
          else {
            allGone = false;
            stats.failed++;
          }
        } catch {
          allGone = false;
          stats.failed++;
        }
      }
      if (delivered || allGone) sent[r.key] = now2.toISOString();
    }
    if (gone.size) {
      subs = subs.filter((s) => !gone.has(s.endpoint));
      stats.removed += gone.size;
    }
    if (due.length || gone.size || Object.keys(sent).length !== Object.keys(row.sent || {}).length) {
      await q(`studyos_push?user_id=eq.${row.user_id}`, { method: "PATCH", body: { sent, subscriptions: subs } });
    }
  }
  return stats;
}
async function fetchIcs(rawUrl, fetchImpl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return { error: "Das ist keine g\xFCltige Adresse.", status: 400 };
  }
  if (url.protocol !== "https:") return { error: "Nur https-Adressen werden unterst\xFCtzt.", status: 400 };
  if (!ICS_HOSTS.some((re) => re.test(url.hostname))) return { error: `Kalender von ${url.hostname} werden nicht abgerufen. Erlaubt sind TUMonline (*.tum.de) und cal.tum.app.`, status: 400 };
  let res;
  try {
    res = await fetchImpl(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(15e3), headers: { Accept: "text/calendar, text/plain, */*" } });
  } catch {
    return { error: "Der Kalender-Server hat nicht geantwortet.", status: 502 };
  }
  if (!res.ok) return { error: `Der Kalender-Server meldet Fehler ${res.status}. Ist der Link noch g\xFCltig?`, status: 502 };
  const text = await res.text();
  if (text.length > ICS_MAX_BYTES) return { error: "Der Kalender ist zu gro\xDF.", status: 413 };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { error: "Unter dem Link liegt kein Kalender (iCal).", status: 422 };
  return { text };
}
function createHandler({ env: env2, fetchImpl = fetch, now: now2 = () => /* @__PURE__ */ new Date() }) {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const action = new URL(req.url).searchParams.get("action");
    try {
      const q = db(env2, fetchImpl);
      if (action === "vapid" && req.method === "GET") {
        const cfg = await ensureVapid(q);
        return json({ publicKey: cfg.vapid_public });
      }
      if (action === "remind" && req.method === "POST") {
        const cfg = await ensureVapid(q);
        if (!safeEqual(req.headers.get("x-cron-secret"), cfg.cron_secret)) return fail("Nicht berechtigt.", 401);
        const stats = await runReminders({ q, cfg, now: now2(), fetchImpl, subject: env2.VAPID_SUBJECT || env2.SUPABASE_URL, env: env2 });
        return json(stats);
      }
      if (action === "ics" && req.method === "POST") {
        const user = await authUser(req, env2, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const body = await req.json().catch(() => ({}));
        const r = await fetchIcs(body.url, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return new Response(r.text, { status: 200, headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (action === "mvg" && req.method === "POST") {
        const user = await authUser(req, env2, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const body = await req.json().catch(() => ({}));
        if (Array.isArray(body.batch)) {
          if (!body.batch.length || body.batch.length > 6) return fail("Zu viele Abfragen.", 400);
          const all = await Promise.all(body.batch.map((b) => mvg(b, fetchImpl)));
          return json(all.map((r2) => r2.error ? { error: r2.error } : { data: r2.data }));
        }
        const r = await mvg(body, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return json(r.data);
      }
      if (action === "drive" && req.method === "POST") {
        const user = await authUser(req, env2, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const r = await drive(await req.json().catch(() => ({})), env2, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return json(r.data);
      }
      if (action === "test" && req.method === "POST") {
        const user = await authUser(req, env2, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const cfg = await ensureVapid(q);
        const rows = await q(`studyos_push?user_id=eq.${user.id}&select=subscriptions`) || [];
        const subs = rows[0]?.subscriptions || [];
        if (!subs.length) return fail("Auf keinem Ger\xE4t sind Erinnerungen eingeschaltet.", 404);
        const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject: env2.VAPID_SUBJECT || env2.SUPABASE_URL };
        let sent = 0;
        for (const sub of subs) {
          const r = await sendPush(sub, { title: "StudyOS", body: "Erinnerungen funktionieren.", tag: "test", url: "./" }, vapid, { fetchImpl, ttl: 600 }).catch(() => ({ ok: false }));
          if (r.ok) sent++;
        }
        return json({ devices: subs.length, sent });
      }
      if (action === "cal" && req.method === "GET") {
        const token = new URL(req.url).searchParams.get("token") || "";
        if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return fail("Ung\xFCltiger Kalender-Link.", 404);
        const rows = await q(`studyos_push?cal_token=eq.${token}&select=deadlines,tz`) || [];
        if (!rows.length) return fail("Diesen Kalender gibt es nicht (mehr).", 404);
        return new Response(buildDeadlineIcs(rows[0].deadlines, rows[0].tz || "Europe/Berlin", now2()), { status: 200, headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" } });
      }
      if (action === "health") return json({ ok: true });
      return fail("Unbekannte Aktion.", 404);
    } catch (e) {
      return fail(String(e && e.message || e), 500);
    }
  };
}

// src/server/deno-entry.js
var env = new Proxy({}, { get: (_, key) => Deno.env.get(String(key)) });
var now = () => env.STUDYOS_NOW ? new Date(env.STUDYOS_NOW) : /* @__PURE__ */ new Date();
Deno.serve(createHandler({ env, now }));
