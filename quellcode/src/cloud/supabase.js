/* Dünne Schicht über supabase-js: Login per E-Mail-Code und Lesen/Schreiben der einen Sync-Zeile. */
/* Nur Auth und Datenbank-Client statt des ganzen supabase-js (Realtime, Storage, Functions braucht StudyOS nicht).
   Beide werden erst geladen, wenn sie gebraucht werden (ca. 120 KB weniger beim Start ohne Cloud-Sync). */
import { SUPABASE_KEY, SUPABASE_URL, SYNC_TABLE } from "../lib/cloud-config.js";

export class CloudError extends Error {}

/* Supabase-Fehler in verständliche deutsche Meldungen übersetzen */
function explain(error) {
  const msg = String(error?.message || error || "");
  const status = Number(error?.status) || 0;
  if (/fetch|network|load failed|Failed to fetch/i.test(msg)) return new CloudError("Keine Verbindung zu Supabase. Bist du offline, oder ist das Projekt pausiert (im Supabase-Dashboard „Resume project“)?");
  if (status === 429 || /rate limit|security purposes|only request this after/i.test(msg)) return new CloudError("Zu viele Anfragen. Warte eine Minute und versuch es erneut.");
  if (/expired|invalid|otp/i.test(msg) && /token|otp|code/i.test(msg)) return new CloudError("Der Code ist falsch oder abgelaufen. Fordere einen neuen an.");
  if (/JWT|not authenticated|401/i.test(msg) || status === 401) return new CloudError("Die Anmeldung ist abgelaufen. Bitte neu anmelden.");
  if (/relation .* does not exist|42P01|schema cache/i.test(msg)) return new CloudError("Die Tabelle „studyos_sync“ fehlt. Führe das SQL aus supabase/schema.sql im Supabase-SQL-Editor aus.");
  if (/row-level security|42501/i.test(msg)) return new CloudError("Zugriff verweigert. Prüfe die Row-Level-Security-Regeln aus supabase/schema.sql.");
  return new CloudError("Supabase-Fehler: " + msg);
}

const AUTH_KEY = "studyos-auth";
let libs = null;
const loadLibs = () => (libs ||= import("./supabase-libs.js").catch((e) => { libs = null; throw explain(e); }));

/** Gibt es eine gespeicherte Anmeldung oder kommt gerade eine über den Mail-Link herein? Sonst bleibt Supabase ungeladen. */
export function mayHaveSession(storage = globalThis.localStorage, hash = globalThis.location?.hash || "") {
  try { return !!storage.getItem(AUTH_KEY) || /access_token=|error_description=/.test(hash); } catch { return true; }
}

export function createSupabaseCloud() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const toUser = (s) => (s?.user ? { id: s.user.id, email: s.user.email } : null);
  let uid = null;
  const authListeners = new Set();
  let authP = null;
  const getAuth = () => (authP ||= loadLibs().then(({ AuthClient }) => {
    const a = new AuthClient({
      url: SUPABASE_URL + "/auth/v1", headers: { apikey: SUPABASE_KEY },
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: AUTH_KEY,
    });
    a.onAuthStateChange((_event, session) => { const u = toUser(session); uid = u?.id || null; authListeners.forEach((cb) => cb(u)); });
    return a;
  }, (e) => { authP = null; throw e; }));
  const auth = { getSession: async () => (await getAuth()).getSession() };
  /* Versatz der Geräteuhr zur Serverzeit, aus dem Date-Header der Antworten (Sekundengenau; Mitte der Anfrage als Bezug).
     Fehlt der Header (z. B. nicht per CORS freigegeben), bleibt er unbekannt und der Sync nutzt nur die Geräteuhr. */
  let serverOffset = NaN;
  const timedFetch = async (...args) => {
    const t0 = Date.now();
    const res = await fetch(...args);
    const server = Date.parse(res.headers?.get?.("date") || "");
    if (Number.isFinite(server)) serverOffset = server + 500 - (t0 + Date.now()) / 2;
    return res;
  };
  /* Datenbankzugriff immer mit dem aktuellen Zugangstoken des Nutzers (wird bei Bedarf erneuert) */
  const db = async () => {
    const { data } = await auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new CloudError("Die Anmeldung ist abgelaufen. Bitte neu anmelden.");
    const { PostgrestClient } = await loadLibs();
    return new PostgrestClient(SUPABASE_URL + "/rest/v1", { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, fetch: timedFetch });
  };
  const userId = async () => {
    if (uid) return uid;
    const { data } = await auth.getSession();
    uid = data.session?.user?.id || null;
    if (!uid) throw new CloudError("Nicht angemeldet.");
    return uid;
  };

  /* Supabase Storage (Bucket „studyos-files“) direkt per fetch */
  async function storage(method, id, body) {
    if (!/^[\w-]{8,64}$/.test(id)) throw new CloudError("Ungültige Datei.");
    const { data } = await auth.getSession();
    if (!data.session) throw new CloudError("Nicht angemeldet.");
    const url = `${SUPABASE_URL}/storage/v1/object/studyos-files/${data.session.user.id}/${id}`;
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session.access_token}` };
    if (body) Object.assign(headers, { "Content-Type": "application/octet-stream", "x-upsert": "true" });
    try { return await fetch(url, { method, headers, body }); } catch (e) { throw explain(e); }
  }

  /* Aufruf der Edge Function „studyos“ (Erinnerungen, Kalender-Abo) */
  const FN = SUPABASE_URL + "/functions/v1/studyos";
  async function callFn(action, { method = "POST", body, withUser = true } = {}) {
    const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    if (withUser) {
      const { data } = await auth.getSession();
      if (!data.session) throw new CloudError("Nicht angemeldet.");
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    let res;
    try { res = await fetch(`${FN}?action=${action}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw explain(e); }
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).error || ""; } catch {}
      if (msg === "Unbekannte Aktion.") throw new CloudError("Deine Supabase-Funktion „studyos“ ist veraltet. Bitte die aktuelle index.ts einspielen (siehe supabase/EINRICHTUNG.md).");
      if (res.status === 404 && !msg) throw new CloudError("Die Supabase-Funktion „studyos“ ist noch nicht eingerichtet (siehe supabase/EINRICHTUNG.md).");
      if (res.status === 401 && !msg) throw new CloudError("Die Funktion „studyos“ verlangt eine JWT-Prüfung. Schalte „Verify JWT“ in den Funktionseinstellungen aus.");
      throw new CloudError(msg || `Die Funktion meldet Fehler ${res.status}.`);
    }
    return res;
  }
  async function pushRow() {
    const { data, error } = await (await db()).from("studyos_push").select("subscriptions").eq("user_id", await userId()).maybeSingle();
    if (error) throw explain(error);
    return data;
  }
  async function pushUpsert(fields) {
    const { error } = await (await db()).from("studyos_push").upsert({ user_id: await userId(), ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw explain(error);
  }

  return {
    push: {
      vapidKey: async () => (await (await callFn("vapid", { method: "GET", withUser: false })).json()).publicKey,
      async saveSubscription(sub, tz) {
        const row = await pushRow();
        const subs = (row?.subscriptions || []).filter((x) => x.endpoint !== sub.endpoint);
        await pushUpsert({ subscriptions: [...subs, sub], tz });
      },
      async removeSubscription(endpoint) {
        const row = await pushRow();
        if (row) await pushUpsert({ subscriptions: (row.subscriptions || []).filter((x) => x.endpoint !== endpoint) });
      },
      saveDeadlines: (deadlines, tz) => pushUpsert({ deadlines, tz }),
      setCalToken: (token) => pushUpsert({ cal_token: token || null }),
      test: async () => (await callFn("test")).json(),
    },
    shares: {
      async create(token, blob) {
        const { error } = await (await db()).from("studyos_shares").insert({ token, owner: await userId(), blob });
        if (error) throw new CloudError(/studyos_shares|schema cache|does not exist/i.test(error.message) ? "Teilen ist noch nicht eingerichtet: Bitte das aktuelle supabase/schema.sql im SQL-Editor ausführen." : error.message);
      },
      async get(token) {
        /* auch ohne Anmeldung: nur über die Funktion, die genau einen Eintrag nach Kennung liefert */
        const { PostgrestClient } = await loadLibs();
        const anon = new PostgrestClient(SUPABASE_URL + "/rest/v1", { headers: { apikey: SUPABASE_KEY } });
        const { data, error } = await anon.rpc("studyos_get_share", { t: token });
        if (error) throw new CloudError(error.message);
        if (!data) throw new CloudError("Diesen Stapel gibt es nicht (mehr). Links laufen nach 180 Tagen ab.");
        return data;
      },
      async remove(token) {
        const { error } = await (await db()).from("studyos_shares").delete().eq("token", token);
        if (error) throw new CloudError(error.message);
      },
    },
    /* Anhänge (bereits verschlüsselt) im privaten Speicher: Ordner = Nutzer-ID */
    files: {
      async put(id, bytes) {
        const res = await storage("POST", id, bytes);
        if (!res.ok) throw new CloudError(res.status === 404 || res.status === 400 ? "Anhänge sind noch nicht eingerichtet: Bitte supabase/anhaenge.sql im SQL-Editor ausführen." : `Hochladen fehlgeschlagen (${res.status}).`);
      },
      async get(id) {
        const res = await storage("GET", id);
        if (!res.ok) throw new CloudError(res.status === 404 || res.status === 400 ? "Datei nicht in der Cloud gefunden." : `Laden fehlgeschlagen (${res.status}).`);
        return new Uint8Array(await res.arrayBuffer());
      },
      async remove(id) { await storage("DELETE", id).catch(() => {}); },
      /* Dateien im eigenen Ordner, deren Name mit `search` beginnt (für die Cloud-Sicherungen) */
      async list(search) {
        const { data } = await auth.getSession();
        if (!data.session) throw new CloudError("Nicht angemeldet.");
        let res;
        try {
          res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/studyos-files`, {
            method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ prefix: data.session.user.id + "/", search, limit: 100, sortBy: { column: "name", order: "desc" } }),
          });
        } catch (e) { throw explain(e); }
        if (!res.ok) throw new CloudError(res.status === 404 || res.status === 400 ? "Cloud-Speicher ist noch nicht eingerichtet: Bitte supabase/anhaenge.sql im SQL-Editor ausführen." : `Liste der Sicherungen nicht verfügbar (${res.status}).`);
        return (await res.json()).filter((o) => o.name && o.name.startsWith(search)).map((o) => ({ id: o.name, created: o.updated_at || o.created_at || null, size: Number(o.metadata?.size) || 0 }));
      },
    },
    calUrl: (token) => `${FN}?action=cal&token=${token}`,
    fetchIcs: async (url) => (await callFn("ics", { body: { url } })).text(),
    mvg: async (body) => (await callFn("mvg", { body })).json(),
    drive: async (body) => (await callFn("drive", { body })).json(),
    async getUser() {
      if (!authP && !mayHaveSession()) return null;
      const { data } = await auth.getSession(); const u = toUser(data.session); uid = u?.id || null; return u;
    },
    onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    async sendCode(email) {
      const redirect = window.location.origin + window.location.pathname;
      const { error } = await (await getAuth()).signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      if (error) throw explain(error);
    },
    async verifyCode(email, token) {
      const { error } = await (await getAuth()).verifyOtp({ email, token, type: "email" });
      if (error) throw explain(error);
    },
    async signOut() { uid = null; if (authP) await (await authP).signOut({ scope: "local" }).catch(() => {}); },
    remote: {
      get serverOffset() { return serverOffset; },
      async get() {
        const { data, error } = await (await db()).from(SYNC_TABLE).select("version,payload").eq("user_id", await userId()).maybeSingle();
        if (error) throw explain(error);
        return data;
      },
      async insert(payload) {
        const { error } = await (await db()).from(SYNC_TABLE).insert({ user_id: await userId(), version: 1, payload });
        if (error) { if (error.code === "23505") return false; throw explain(error); }
        return true;
      },
      async update(payload, version) {
        const { data, error } = await (await db()).from(SYNC_TABLE)
          .update({ payload, version: version + 1, updated_at: new Date().toISOString() })
          .eq("user_id", await userId()).eq("version", version).select("version");
        if (error) throw explain(error);
        return Array.isArray(data) && data.length === 1;
      },
      async remove() {
        const { error } = await (await db()).from(SYNC_TABLE).delete().eq("user_id", await userId());
        if (error) throw explain(error);
      },
    },
  };
}
