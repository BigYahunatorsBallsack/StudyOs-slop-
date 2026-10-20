/* Supabase Edge Function „studyos“: ein Endpunkt, drei Aufgaben.
     GET  ?action=vapid    öffentlicher VAPID-Schlüssel für Push-Abos (wird beim ersten Aufruf erzeugt)
     POST ?action=remind   fällige Erinnerungen verschicken (nur mit x-cron-secret, aufgerufen von pg_cron)
     GET  ?action=cal&token=…  Fristen als Kalender-Abo (iCal), Token statt Anmeldung
     POST ?action=mvg      Haltestellen und Abfahrten (MVG), nur angemeldet
     POST ?action=drive    Fahrzeit mit dem Auto bei aktueller Verkehrslage (Google oder TomTom), nur angemeldet
     POST ?action=ics      Kalender-Abo (z. B. TUMonline) abrufen und mit CORS zurückgeben (nur angemeldet)
   Keine Fremdbibliotheken: Datenbank über die REST-API, Kryptografie über WebCrypto. */
import { dueReminders, pruneSent } from "./reminders.js";
import { buildDeadlineIcs } from "./calendar.js";
import { mvg } from "./mvg.js";
import { drive } from "./drive.js";
import { commuteAlert } from "./commute.js";
import { generateVapidKeys, sendPush } from "./webpush.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (message, status) => json({ error: message }, status);

/* Erlaubte Kalenderquellen: TUM-Systeme und der TUM-Kalender-Proxy */
export const ICS_HOSTS = [/(^|\.)tum\.de$/i, /^cal\.tum\.app$/i];
const ICS_MAX_BYTES = 3 * 1024 * 1024;

export function serviceKey(env) {
  try {
    const keys = JSON.parse(env.SUPABASE_SECRET_KEYS || "null");
    if (keys && typeof keys === "object") return keys.default || Object.values(keys)[0];
  } catch {}
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

function db(env, fetchImpl) {
  const key = serviceKey(env);
  if (!key || !env.SUPABASE_URL) throw new Error("SUPABASE_URL oder Service-Schlüssel fehlt in der Funktionsumgebung.");
  const headers = { apikey: key, "Content-Type": "application/json", ...(String(key).startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }) };
  /** @param {string} path @param {{ method?: string, body?: any, prefer?: string }} [opts] */
  return async (path, { method = "GET", body, prefer } = {}) => {
    const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Datenbank ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function serverConfig(q) {
  const rows = await q("studyos_server?id=eq.1&select=*");
  if (!rows || !rows.length) throw new Error("Tabelle studyos_server ist leer. Bitte supabase/schema.sql erneut ausführen.");
  return rows[0];
}

async function ensureVapid(q) {
  let cfg = await serverConfig(q);
  if (!cfg.vapid_public) {
    const keys = await generateVapidKeys();
    const updated = await q("studyos_server?id=eq.1&vapid_public=is.null", { method: "PATCH", body: { vapid_public: keys.publicKey, vapid_private: keys.privateJwk }, prefer: "return=representation" });
    cfg = updated && updated.length ? updated[0] : await serverConfig(q); /* anderer Aufruf war schneller */
  }
  return cfg;
}

/* Geprüfte Anmeldungen kurz merken (höchstens 5 Minuten, nie über den Ablauf des Tokens hinaus):
   spart bei Abfahrten und Fahrzeit die zusätzliche Anfrage an Supabase Auth, solange die Funktion warm ist */
const AUTH_TTL = 5 * 60000;
const authCache = new Map();
function tokenExp(token) {
  try { return Number(JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp) * 1000 || 0; } catch { return 0; }
}

export async function authUser(req, env, fetchImpl, now = Date.now()) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const hit = authCache.get(token);
  if (hit && hit.until > now) return hit.user;
  const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey(env) } });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  const exp = tokenExp(token);
  if (exp > now) {
    if (authCache.size > 200) authCache.clear();
    authCache.set(token, { user, until: Math.min(now + AUTH_TTL, exp) });
  }
  return user;
}

export async function runReminders({ q, cfg, now = new Date(), fetchImpl, subject }) {
  const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject };
  const rows = (await q("studyos_push?select=user_id,subscriptions,deadlines,sent,tz")) || [];
  const stats = { users: rows.length, sent: 0, failed: 0, removed: 0 };
  for (const row of rows) {
    let subs = Array.isArray(row.subscriptions) ? row.subscriptions : [];
    const sent = pruneSent(row.sent || {}, now);
    const tz = row.tz || "Europe/Berlin";
    const due = subs.length ? dueReminders(row.deadlines, sent, now, tz) : [];
    /* Weg zur Uni: bei Verspätung früher Bescheid (nur Einträge, die die App bei eingeschalteter Option hochlädt) */
    if (subs.length) for (const x of (row.deadlines || []).filter((d) => d.kind === "commute")) {
      const alert = await commuteAlert(x, now, tz, fetchImpl).catch(() => null);
      if (alert && !sent[alert.key]) due.push(alert);
    }
    const gone = new Set();
    for (const r of due) {
      let delivered = false, allGone = true;
      for (const sub of subs) {
        if (gone.has(sub.endpoint)) continue;
        try {
          const res = await sendPush(sub, { title: r.title, body: r.body, tag: r.tag, url: r.url, ...(r.actions && { actions: r.actions }) }, vapid, { fetchImpl });
          if (res.ok) { delivered = true; allGone = false; stats.sent++; }
          else if (res.gone) gone.add(sub.endpoint);
          else { allGone = false; stats.failed++; }
        } catch { allGone = false; stats.failed++; }
      }
      if (delivered || allGone) sent[r.key] = now.toISOString(); /* sonst beim nächsten Lauf erneut versuchen */
    }
    if (gone.size) { subs = subs.filter((s) => !gone.has(s.endpoint)); stats.removed += gone.size; }
    if (due.length || gone.size || Object.keys(sent).length !== Object.keys(row.sent || {}).length) {
      await q(`studyos_push?user_id=eq.${row.user_id}`, { method: "PATCH", body: { sent, subscriptions: subs } });
    }
  }
  return stats;
}

export async function fetchIcs(rawUrl, fetchImpl) {
  let url;
  try { url = new URL(String(rawUrl || "").trim().replace(/^webcals?:\/\//i, "https://")); } catch { return { error: "Das ist keine gültige Adresse.", status: 400 }; }
  if (url.protocol !== "https:") return { error: "Nur https-Adressen werden unterstützt.", status: 400 };
  if (!ICS_HOSTS.some((re) => re.test(url.hostname))) return { error: `Kalender von ${url.hostname} werden nicht abgerufen. Erlaubt sind TUMonline (*.tum.de) und cal.tum.app.`, status: 400 };
  let res;
  try { res = await fetchImpl(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { Accept: "text/calendar, text/plain, */*" } }); }
  catch { return { error: "Der Kalender-Server hat nicht geantwortet.", status: 502 }; }
  if (!res.ok) return { error: `Der Kalender-Server meldet Fehler ${res.status}. Ist der Link noch gültig?`, status: 502 };
  const text = await res.text();
  if (text.length > ICS_MAX_BYTES) return { error: "Der Kalender ist zu groß.", status: 413 };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { error: "Unter dem Link liegt kein Kalender (iCal).", status: 422 };
  return { text };
}

export function createHandler({ env, fetchImpl = fetch, now = () => new Date() }) {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const action = new URL(req.url).searchParams.get("action");
    try {
      const q = db(env, fetchImpl);
      if (action === "vapid" && req.method === "GET") {
        const cfg = await ensureVapid(q);
        return json({ publicKey: cfg.vapid_public });
      }
      if (action === "remind" && req.method === "POST") {
        const cfg = await ensureVapid(q);
        if (!safeEqual(req.headers.get("x-cron-secret"), cfg.cron_secret)) return fail("Nicht berechtigt.", 401);
        const stats = await runReminders({ q, cfg, now: now(), fetchImpl, subject: env.VAPID_SUBJECT || env.SUPABASE_URL });
        return json(stats);
      }
      if (action === "ics" && req.method === "POST") {
        const user = await authUser(req, env, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const body = await req.json().catch(() => ({}));
        const r = await fetchIcs(body.url, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return new Response(r.text, { status: 200, headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (action === "mvg" && req.method === "POST") {
        const user = await authUser(req, env, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const body = await req.json().catch(() => ({}));
        /* mehrere Abfragen in einem Aufruf (Weg zur Uni: Abfahrten jetzt und zur Vorlesung, Zubringer und Hauptlinie) */
        if (Array.isArray(body.batch)) {
          if (!body.batch.length || body.batch.length > 6) return fail("Zu viele Abfragen.", 400);
          const all = await Promise.all(body.batch.map((b) => mvg(b, fetchImpl)));
          return json(all.map((r) => (r.error ? { error: r.error } : { data: r.data })));
        }
        const r = await mvg(body, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return json(r.data);
      }
      if (action === "drive" && req.method === "POST") {
        const user = await authUser(req, env, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const r = await drive(await req.json().catch(() => ({})), env, fetchImpl);
        if (r.error) return fail(r.error, r.status);
        return json(r.data);
      }
      if (action === "test" && req.method === "POST") {
        const user = await authUser(req, env, fetchImpl);
        if (!user) return fail("Bitte in StudyOS beim Cloud-Sync anmelden.", 401);
        const cfg = await ensureVapid(q);
        const rows = (await q(`studyos_push?user_id=eq.${user.id}&select=subscriptions`)) || [];
        const subs = rows[0]?.subscriptions || [];
        if (!subs.length) return fail("Auf keinem Gerät sind Erinnerungen eingeschaltet.", 404);
        const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject: env.VAPID_SUBJECT || env.SUPABASE_URL };
        let sent = 0;
        for (const sub of subs) {
          const r = await sendPush(sub, { title: "StudyOS", body: "Erinnerungen funktionieren.", tag: "test", url: "./" }, vapid, { fetchImpl, ttl: 600 }).catch(() => ({ ok: false }));
          if (r.ok) sent++;
        }
        return json({ devices: subs.length, sent });
      }
      if (action === "cal" && req.method === "GET") {
        /* Kalender-Abo: ohne Anmeldung, nur mit dem geheimen Link-Token */
        const token = new URL(req.url).searchParams.get("token") || "";
        if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return fail("Ungültiger Kalender-Link.", 404);
        const rows = (await q(`studyos_push?cal_token=eq.${token}&select=deadlines,tz`)) || [];
        if (!rows.length) return fail("Diesen Kalender gibt es nicht (mehr).", 404);
        return new Response(buildDeadlineIcs(rows[0].deadlines, rows[0].tz || "Europe/Berlin", now()), { status: 200, headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" } });
      }
      if (action === "health") return json({ ok: true });
      return fail("Unbekannte Aktion.", 404);
    } catch (e) {
      return fail(String(e && e.message || e), 500);
    }
  };
}
