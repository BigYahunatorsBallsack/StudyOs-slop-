import { describe, it, expect } from "vitest";
import { encryptPayload, sendPush, generateVapidKeys, b64url, fromB64url } from "../../src/server/webpush.js";
import { zonedInstant, dueReminders, pruneSent, MAX_LATE_MS } from "../../src/server/reminders.js";
import { createHandler, fetchIcs, serviceKey } from "../../src/server/handler.js";

const enc = new TextEncoder(), dec = new TextDecoder();

/* Empfängerseite wie im Browser (RFC 8291): Abo-Schlüssel erzeugen und Nachrichten entschlüsseln */
async function makeSubscriber(endpoint = "https://push.example.org/send/abc") {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, sub: { endpoint, keys: { p256dh: b64url(pub), auth: b64url(auth) } }, pub, auth };
}
async function hkdf(salt, ikm, info, n) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8));
}
async function decrypt(body, s) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  expect(rs).toBe(4096); expect(idlen).toBe(65);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, s.pair.privateKey, 256));
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...s.pub, ...asPublic]);
  const ikm = await hkdf(s.auth, ecdh, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
  expect(plain[plain.length - 1]).toBe(2); // Abschluss-Markierung des letzten Datensatzes
  return dec.decode(plain.slice(0, -1));
}

describe("Web Push", () => {
  it("verschlüsselt so, dass der Browser es entschlüsseln kann (RFC 8291)", async () => {
    const s = await makeSubscriber();
    const msg = JSON.stringify({ title: "Abgabe morgen", body: "Blatt 4 (Analysis) – äöü ✓" });
    expect(await decrypt(await encryptPayload(s.sub, msg), s)).toBe(msg);
  });

  it("signiert den VAPID-Header gültig und setzt die Pflicht-Header", async () => {
    const s = await makeSubscriber("https://web.push.apple.com/abc123");
    const vapid = { ...(await generateVapidKeys()), subject: "https://kjyfdijcfvvlxipwogkv.supabase.co" };
    let captured;
    const res = await sendPush(s.sub, { title: "T" }, vapid, { fetchImpl: async (url, init) => { captured = { url, init }; return new Response(null, { status: 201 }); } });
    expect(res).toEqual({ ok: true, status: 201, gone: false });
    const h = captured.init.headers;
    expect(h["Content-Encoding"]).toBe("aes128gcm");
    expect(Number(h.TTL)).toBeGreaterThan(0);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization);
    expect(k).toBe(vapid.publicKey);
    const [head, payload, sig] = jwt.split(".");
    const claims = JSON.parse(dec.decode(fromB64url(payload)));
    expect(claims.aud).toBe("https://web.push.apple.com");
    expect(claims.sub).toBe(vapid.subject);
    expect(claims.exp * 1000).toBeGreaterThan(Date.now());
    const pub = await crypto.subtle.importKey("raw", fromB64url(vapid.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(sig), enc.encode(`${head}.${payload}`))).toBe(true);
    expect(await decrypt(new Uint8Array(captured.init.body), s)).toBe(JSON.stringify({ title: "T" }));
  });

  it("erkennt abgelaufene Abos", async () => {
    const s = await makeSubscriber();
    const vapid = { ...(await generateVapidKeys()), subject: "mailto:x@example.org" };
    expect(await sendPush(s.sub, {}, vapid, { fetchImpl: async () => new Response(null, { status: 410 }) })).toMatchObject({ ok: false, gone: true });
  });
});

describe("Erinnerungen", () => {
  it("rechnet Ortszeit inklusive Sommer- und Winterzeit um", () => {
    expect(zonedInstant("2026-10-24", "18:00").toISOString()).toBe("2026-10-24T16:00:00.000Z"); // Sommerzeit
    expect(zonedInstant("2026-10-26", "08:00").toISOString()).toBe("2026-10-26T07:00:00.000Z"); // Winterzeit
    expect(zonedInstant("2026-03-29", "08:00").toISOString()).toBe("2026-03-29T06:00:00.000Z"); // Tag der Umstellung
  });
  const hw = { id: "h1", kind: "homework", title: "Blatt 4", module: "Analysis", date: "2026-10-23" };
  it("verschickt Abgabe-Erinnerungen am Vorabend und am Morgen", () => {
    expect(dueReminders([hw], {}, new Date("2026-10-22T15:59:00Z"))).toEqual([]);
    const evening = dueReminders([hw], {}, new Date("2026-10-22T16:05:00Z"));
    expect(evening).toHaveLength(1);
    expect(evening[0]).toMatchObject({ title: "Abgabe morgen", body: "Blatt 4 (Analysis)" });
    const morning = dueReminders([hw], { [evening[0].key]: "x" }, new Date("2026-10-23T06:30:00Z"));
    expect(morning.map((r) => r.title)).toEqual(["Abgabe heute"]);
  });
  it("schickt nichts doppelt und holt nur kurz Verpasstes nach", () => {
    const first = dueReminders([hw], {}, new Date("2026-10-22T16:05:00Z"));
    expect(dueReminders([hw], { [first[0].key]: "x" }, new Date("2026-10-22T16:20:00Z"))).toEqual([]);
    const tooLate = new Date(zonedInstant("2026-10-22", "18:00").getTime() + MAX_LATE_MS + 60000);
    expect(dueReminders([{ ...hw, date: "2026-10-30" }, hw], {}, tooLate).map((r) => r.title)).not.toContain("Abgabe morgen");
  });
  it("Prüfung, Anmeldeschluss und Wiederholung", () => {
    const list = [
      { id: "e", kind: "exam", title: "Prüfung", module: "DS", date: "2026-11-02", time: "10:30" },
      { id: "r", kind: "register", title: "Anmeldung", module: "DS", date: "2026-10-26" },
    ];
    expect(dueReminders(list, {}, new Date("2026-10-26T07:30:00Z")).map((x) => x.title)).toEqual(["Anmeldeschluss heute"]);
    expect(dueReminders(list, {}, new Date("2026-10-26T17:05:00Z")).map((x) => x.title)).toContain("Prüfung in einer Woche");
    expect(dueReminders([{ ...list[0] }], {}, new Date("2026-11-01T17:10:00Z"))[0]).toMatchObject({ title: "Prüfung morgen", body: "DS um 10:30" });
  });
  it("räumt das Versandprotokoll auf", () => {
    expect(pruneSent({ a: "2026-01-01T00:00:00Z", b: "2026-10-20T00:00:00Z" }, new Date("2026-10-22T00:00:00Z"))).toEqual({ b: "2026-10-20T00:00:00Z" });
  });
});

/* Simuliertes Supabase (REST, Auth), Push-Dienst und Kalender-Server für den Funktions-Handler */
function fakeWorld() {
  const w = { server: { id: 1, cron_secret: "geheim-cron", vapid_public: null, vapid_private: null }, push: [], pushCalls: [], status: 201 };
  w.env = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }) };
  w.fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method || "GET";
    if (u.host === "proj.supabase.co" && u.pathname.startsWith("/rest/v1/")) {
      expect(init.headers.apikey).toBe("sb_secret_test");
      const table = u.pathname.slice(9);
      if (table === "studyos_server") {
        if (method === "GET") return Response.json([w.server]);
        if (method === "PATCH") {
          if (u.searchParams.get("vapid_public") === "is.null" && w.server.vapid_public) return Response.json([]);
          Object.assign(w.server, JSON.parse(init.body));
          return Response.json([w.server]);
        }
      }
      if (table === "studyos_push") {
        if (method === "GET") { const f = u.searchParams.get("user_id"), c = u.searchParams.get("cal_token"); return Response.json(c ? w.push.filter((r) => r.cal_token === c.slice(3)) : f ? w.push.filter((r) => r.user_id === f.slice(3)) : w.push); }
        if (method === "PATCH") { const id = u.searchParams.get("user_id").slice(3); Object.assign(w.push.find((r) => r.user_id === id), JSON.parse(init.body)); return new Response(""); }
      }
    }
    if (u.host === "proj.supabase.co" && u.pathname === "/auth/v1/user") {
      return init.headers.Authorization === "Bearer user-token" ? Response.json({ id: "u1" }) : new Response("{}", { status: 401 });
    }
    if (u.host.endsWith("push.example.org")) { w.pushCalls.push(u.pathname); return new Response(null, { status: u.pathname.includes("gone") ? 410 : w.status }); }
    if (u.host === "campus.tum.de") return new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    if (u.host === "evil.tum.de.example.com") return new Response("BEGIN:VCALENDAR");
    throw new Error("unerwarteter Aufruf " + url);
  };
  return w;
}
const req = (action, { method = "GET", headers = {}, body } = {}) => new Request(`https://proj.supabase.co/functions/v1/studyos?action=${action}`, { method, headers, body: body ? JSON.stringify(body) : undefined });

describe("Edge Function", () => {
  it("nimmt den neuen Secret Key, sonst den alten Service-Role-Key", () => {
    expect(serviceKey({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })).toBe("sb_secret_x");
    expect(serviceKey({ SUPABASE_SERVICE_ROLE_KEY: "eyJ..." })).toBe("eyJ...");
  });

  it("erzeugt den VAPID-Schlüssel einmal und gibt ihn danach unverändert aus", async () => {
    const w = fakeWorld(), h = createHandler({ env: w.env, fetchImpl: w.fetch });
    const a = await (await h(req("vapid"))).json();
    const b = await (await h(req("vapid"))).json();
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(b.publicKey).toBe(a.publicKey);
    expect((await h(req("vapid", { method: "OPTIONS" }))).headers.get("access-control-allow-origin")).toBe("*");
  });

  it("verschickt fällige Erinnerungen nur mit Cron-Geheimnis und entfernt tote Abos", async () => {
    const w = fakeWorld();
    const s1 = await makeSubscriber("https://push.example.org/ok"), s2 = await makeSubscriber("https://push.example.org/gone");
    w.push = [{ user_id: "u1", subscriptions: [s1.sub, s2.sub], deadlines: [{ id: "h1", kind: "homework", title: "Blatt 4", date: "2026-10-23" }], sent: {}, tz: "Europe/Berlin" }];
    const h = createHandler({ env: w.env, fetchImpl: w.fetch, now: () => new Date("2026-10-22T16:05:00Z") });
    expect((await h(req("remind", { method: "POST" }))).status).toBe(401);
    expect((await h(req("remind", { method: "POST", headers: { "x-cron-secret": "falsch-cron!" } }))).status).toBe(401);
    const res = await h(req("remind", { method: "POST", headers: { "x-cron-secret": "geheim-cron" } }));
    expect(await res.json()).toEqual({ users: 1, sent: 1, failed: 0, removed: 1 });
    expect(w.push[0].subscriptions.map((s) => s.endpoint)).toEqual(["https://push.example.org/ok"]);
    expect(Object.keys(w.push[0].sent)).toHaveLength(1);
    // zweiter Lauf: nichts doppelt
    const again = await (await h(req("remind", { method: "POST", headers: { "x-cron-secret": "geheim-cron" } }))).json();
    expect(again.sent).toBe(0);
  });

  it("wiederholt bei vorübergehendem Fehler des Push-Dienstes", async () => {
    const w = fakeWorld(); w.status = 503;
    const s1 = await makeSubscriber("https://push.example.org/ok");
    w.push = [{ user_id: "u1", subscriptions: [s1.sub], deadlines: [{ id: "h1", kind: "homework", title: "B", date: "2026-10-23" }], sent: {} }];
    const h = createHandler({ env: w.env, fetchImpl: w.fetch, now: () => new Date("2026-10-22T16:05:00Z") });
    const r = await (await h(req("remind", { method: "POST", headers: { "x-cron-secret": "geheim-cron" } }))).json();
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(w.push[0].sent).toEqual({});
  });

  it("Kalender-Abruf: nur angemeldet und nur von TUM-Adressen", async () => {
    const w = fakeWorld(), h = createHandler({ env: w.env, fetchImpl: w.fetch });
    const post = (body, token) => h(req("ics", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }));
    expect((await post({ url: "https://campus.tum.de/x.ics" })).status).toBe(401);
    expect((await post({ url: "https://campus.tum.de/x.ics" }, "fremd")).status).toBe(401);
    const ok = await post({ url: "webcal://campus.tum.de/tumonline/x.ics" }, "user-token");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("BEGIN:VCALENDAR");
    const evil = await post({ url: "https://evil.tum.de.example.com/x.ics" }, "user-token");
    expect(evil.status).toBe(400);
    expect((await evil.json()).error).toMatch(/nicht abgerufen/);
    expect((await fetchIcs("ftp://campus.tum.de/x", w.fetch)).status).toBe(400);
  });

  it("Testnachricht nur an die eigenen Geräte", async () => {
    const w = fakeWorld();
    const s1 = await makeSubscriber("https://push.example.org/ok");
    w.push = [{ user_id: "u1", subscriptions: [s1.sub] }, { user_id: "u2", subscriptions: [(await makeSubscriber("https://push.example.org/other")).sub] }];
    const h = createHandler({ env: w.env, fetchImpl: w.fetch });
    expect((await h(req("test", { method: "POST" }))).status).toBe(401);
    const r = await h(req("test", { method: "POST", headers: { authorization: "Bearer user-token" } }));
    expect(await r.json()).toEqual({ devices: 1, sent: 1 });
    expect(w.pushCalls).toEqual(["/ok"]);
  });
});

describe("Weg zur Uni: schneller laden", () => {
  const jwt = (exp) => `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.y`;
  function world() {
    const w = fakeWorld(), base = w.fetch;
    w.auth = 0; w.mvg = [];
    w.fetch = async (url, init = {}) => {
      const u = new URL(url);
      if (u.pathname === "/auth/v1/user") { w.auth++; return init.headers.Authorization.startsWith("Bearer x.") ? Response.json({ id: "u1" }) : base(url, init); }
      if (u.host === "www.mvg.de") { w.mvg.push(u.searchParams.get("offsetInMinutes")); return Response.json([{ label: "230", destination: "Garching", plannedDepartureTime: 1, realtimeDepartureTime: 2 }]); }
      return base(url, init);
    };
    return w;
  }
  const dep = (offset) => ({ kind: "departures", station: "de:09184:2140", types: "BUS", offset, limit: 40 });

  it("mehrere Abfragen in einem Aufruf, Fehler je Abfrage", async () => {
    const w = world(), h = createHandler({ env: w.env, fetchImpl: w.fetch });
    const res = await h(req("mvg", { method: "POST", headers: { authorization: `Bearer ${jwt(Date.now() / 1000 + 3600)}` }, body: { batch: [dep(0), dep(90), { kind: "departures", station: "kaputt" }] } }));
    const out = await res.json();
    expect(out).toHaveLength(3);
    expect(out[0].data[0]).toMatchObject({ line: "230", time: 2 });
    expect(out[2]).toEqual({ error: "Ungültige Haltestelle." });
    expect(w.mvg.sort()).toEqual(["0", "90"]);
    expect((await h(req("mvg", { method: "POST", headers: { authorization: `Bearer ${jwt(Date.now() / 1000 + 3600)}` }, body: { batch: Array(7).fill(dep(0)) } }))).status).toBe(400);
  });

  it("merkt sich die Anmeldung kurz, aber nie über den Ablauf des Tokens hinaus", async () => {
    const w = world(), h = createHandler({ env: w.env, fetchImpl: w.fetch });
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    for (let i = 0; i < 3; i++) await h(req("mvg", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: dep(0) }));
    expect(w.auth).toBe(1);
    const expired = jwt(Math.floor(Date.now() / 1000) - 10);
    await h(req("mvg", { method: "POST", headers: { authorization: `Bearer ${expired}` }, body: dep(0) }));
    await h(req("mvg", { method: "POST", headers: { authorization: `Bearer ${expired}` }, body: dep(0) }));
    expect(w.auth).toBe(3);
  });
});

describe("Kalender-Abo der Fristen", () => {
  it("liefert iCal nur mit gültigem Token", async () => {
    const w = fakeWorld();
    w.push.push({ user_id: "u1", cal_token: "a".repeat(32), tz: "Europe/Berlin", subscriptions: [], deadlines: [
      { id: "h1", kind: "homework", title: "Blatt 3", module: "DS", date: "2026-10-28", time: "23:59" },
      { id: "x1", kind: "exam", title: "Prüfung", module: "Analysis, Teil 1", date: "2027-02-10" },
      { id: "r1", kind: "review", title: "1 Termin", date: "2026-10-21" },
    ] });
    const h = createHandler({ env: w.env, fetchImpl: w.fetch, now: () => new Date("2026-10-20T10:00:00Z") });
    const ok = await h(new Request("https://proj.supabase.co/functions/v1/studyos?action=cal&token=" + "a".repeat(32)));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toMatch(/text\/calendar/);
    const ics = await ok.text();
    expect(ics).toContain("SUMMARY:Abgabe: Blatt 3 (DS)");
    expect(ics).toContain("DTEND:20261028T225900Z"); /* 23:59 MEZ */
    expect(ics).toContain("SUMMARY:Prüfung: Analysis\\, Teil 1");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270210");
    expect(ics).not.toContain("1 Termin");
    expect((await h(new Request("https://proj.supabase.co/functions/v1/studyos?action=cal&token=" + "b".repeat(32)))).status).toBe(404);
    expect((await h(new Request("https://proj.supabase.co/functions/v1/studyos?action=cal&token=x';drop"))).status).toBe(404);
  });
});
