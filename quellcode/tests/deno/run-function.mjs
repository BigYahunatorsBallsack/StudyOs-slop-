/* Startet die gebaute Edge Function (supabase/functions/studyos/index.ts) in echtem Deno und prüft sie
   gegen ein simuliertes Supabase und einen simulierten Push-Dienst. Aufruf: node tests/deno/run-function.mjs <pfad-zu-deno> */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const DENO = process.argv[2] || "deno";
const enc = new TextEncoder(), dec = new TextDecoder();
const b64url = (b) => Buffer.from(b).toString("base64url");

/* Empfänger-Schlüssel (wie ein Browser) */
const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));

const state = { server: { id: 1, cron_secret: "cron-123", vapid_public: null, vapid_private: null }, push: [], received: [] };
const fake = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const u = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
  if (u.pathname === "/rest/v1/studyos_server") {
    if (req.method === "GET") return send(200, [state.server]);
    if (req.method === "PATCH") { Object.assign(state.server, JSON.parse(body)); return send(200, [state.server]); }
  }
  if (u.pathname === "/rest/v1/studyos_push") {
    if (req.method === "GET") return send(200, state.push);
    if (req.method === "PATCH") { Object.assign(state.push[0], JSON.parse(body)); return send(204); }
  }
  if (u.pathname === "/push/device") { state.received.push({ headers: req.headers, body }); res.writeHead(201); return res.end(); }
  send(404, { error: "unbekannt " + u.pathname });
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${fake.address().port}`;
state.push = [{ user_id: "u1", tz: "Europe/Berlin", sent: {}, subscriptions: [{ endpoint: `${base}/push/device`, keys: { p256dh: b64url(pub), auth: b64url(auth) } }],
  deadlines: [{ id: "h1", kind: "homework", title: "Blatt 4", module: "Analysis", date: "2026-10-23" }] }];

const port = 18000 + Math.floor(Math.random() * 1000);
const child = spawn(DENO, ["run", "--allow-net", "--allow-env", "supabase/functions/studyos/index.ts"], {
  env: { ...process.env, SUPABASE_URL: base, SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }), DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, STUDYOS_NOW: "2026-10-22T16:05:00Z", NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; child.stdout.on("data", (d) => (log += d)); child.stderr.on("data", (d) => (log += d));
const fn = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) { try { await fetch(`${fn}/?action=health`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }

try {
  const v = await (await fetch(`${fn}/?action=vapid`)).json();
  assert.match(v.publicKey, /^[A-Za-z0-9_-]{87}$/, "VAPID-Schlüssel");
  assert.equal(state.server.vapid_private.kty, "EC");

  assert.equal((await fetch(`${fn}/?action=remind`, { method: "POST" })).status, 401, "ohne Cron-Geheimnis");
  const stats = await (await fetch(`${fn}/?action=remind`, { method: "POST", headers: { "x-cron-secret": "cron-123" } })).json();
  assert.equal(stats.sent, 1, "eine Erinnerung verschickt: " + JSON.stringify(stats));
  assert.equal(state.received.length, stats.sent);

  if (state.received.length) {
    /* Nachricht wie ein Browser entschlüsseln */
    const { body, headers } = state.received[0];
    assert.equal(headers["content-encoding"], "aes128gcm");
    assert.match(headers.authorization, /^vapid t=.+, k=/);
    const b = new Uint8Array(body);
    const salt = b.slice(0, 16), asPublic = b.slice(21, 86), cipher = b.slice(86);
    const hk = async (s, ikm, info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []) }, pair.privateKey, 256));
    const ikm = await hk(auth, ecdh, new Uint8Array([...enc.encode("WebPush: info\0"), ...pub, ...asPublic]), 32);
    const cek = await hk(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hk(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cipher));
    const msg = JSON.parse(dec.decode(plain.slice(0, -1)));
    assert.equal(msg.title, "Abgabe morgen");
    assert.equal(msg.body, "Blatt 4 (Analysis)");
    console.log("Push entschlüsselt:", msg);
  }
  const again = await (await fetch(`${fn}/?action=remind`, { method: "POST", headers: { "x-cron-secret": "cron-123" } })).json();
  assert.equal(again.sent, 0, "nichts doppelt");
  const ics = await fetch(`${fn}/?action=ics`, { method: "POST", body: JSON.stringify({ url: "https://campus.tum.de/x.ics" }) });
  assert.equal(ics.status, 401, "Kalender nur angemeldet");
  console.log("Deno-Test bestanden:", JSON.stringify(stats));
} catch (e) {
  console.error("FEHLGESCHLAGEN:", e.message, "\nDeno-Ausgabe:\n" + log);
  process.exitCode = 1;
} finally {
  child.kill(); fake.close();
}
