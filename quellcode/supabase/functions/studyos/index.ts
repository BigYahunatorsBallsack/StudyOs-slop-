// StudyOS Edge Function – automatisch erzeugt aus src/server/ (npm run build). Nicht von Hand ändern.
// Einrichtung: siehe supabase/EINRICHTUNG.md
// @ts-nocheck
// src/server/reminders.js
function zonedInstant(date, hm, tz = "Europe/Berlin") {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (hm || "00:00").split(":").map(Number);
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
  weekly: [[0, "18:00", "Deine n\xE4chste Woche", (x) => x.body || x.title]]
};
var MAX_LATE_MS = 12 * 3600 * 1e3;
function dueReminders(deadlines, sent = {}, now2 = /* @__PURE__ */ new Date(), tz = "Europe/Berlin") {
  const out = [];
  for (const x of deadlines || []) {
    const rules = RULES[x.kind];
    if (!rules || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) continue;
    rules.forEach(([before, hm, title, body], i) => {
      const at = zonedInstant(addDays(x.date, -before), hm, tz);
      const key = `${x.kind}:${x.id}:${x.date}:${i}`;
      if (sent[key] || at > now2 || now2 - at > MAX_LATE_MS) return;
      out.push({ key, title, body: body(x), tag: `${x.kind}-${x.id}`, url: x.kind === "homework" || x.kind === "review" || x.kind === "weekly" ? "./?aktion=heute" : "./?aktion=pruefungen" });
    });
  }
  return out;
}
function pruneSent(sent = {}, now2 = /* @__PURE__ */ new Date()) {
  const limit = now2.getTime() - 60 * 864e5;
  return Object.fromEntries(Object.entries(sent).filter(([, at]) => new Date(at).getTime() >= limit));
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
async function authUser(req, env2, fetchImpl) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetchImpl(`${env2.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey(env2) } });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}
async function runReminders({ q, cfg, now: now2 = /* @__PURE__ */ new Date(), fetchImpl, subject }) {
  const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject };
  const rows = await q("studyos_push?select=user_id,subscriptions,deadlines,sent,tz") || [];
  const stats = { users: rows.length, sent: 0, failed: 0, removed: 0 };
  for (const row of rows) {
    let subs = Array.isArray(row.subscriptions) ? row.subscriptions : [];
    const sent = pruneSent(row.sent || {}, now2);
    const due = subs.length ? dueReminders(row.deadlines, sent, now2, row.tz || "Europe/Berlin") : [];
    const gone = /* @__PURE__ */ new Set();
    for (const r of due) {
      let delivered = false, allGone = true;
      for (const sub of subs) {
        if (gone.has(sub.endpoint)) continue;
        try {
          const res = await sendPush(sub, { title: r.title, body: r.body, tag: r.tag, url: r.url }, vapid, { fetchImpl });
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
        const stats = await runReminders({ q, cfg, now: now2(), fetchImpl, subject: env2.VAPID_SUBJECT || env2.SUPABASE_URL });
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
