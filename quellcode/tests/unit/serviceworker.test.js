import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/* Vorab-Laden des Service Workers (src/sw.template.js) mit nachgebautem Cache-Speicher und Netz */
const template = readFileSync(new URL("../../src/sw.template.js", import.meta.url), "utf8");
const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const BASE = "https://studyos.test/";
const abs = (u) => new URL(typeof u === "string" ? u : u.url, BASE).href;

function fakeCaches(stores) {
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { put: async (u, r) => { m.set(abs(u), r); }, match: async (u) => m.get(abs(u))?.clone() };
  };
  return {
    open,
    keys: async () => [...stores.keys()],
    delete: async (k) => stores.delete(k),
    match: async (u) => { for (const m of stores.values()) if (m.has(abs(u))) return m.get(abs(u)).clone(); return undefined; },
  };
}

/** Installiert die Shell-Liste; server(url, mode) liefert den Text oder null (404). Gibt Netz-Anfragen und Caches zurück. */
async function install(files, server, stores = new Map()) {
  const shell = Object.entries(files).map(([url, text]) => [url, hashOf(text)]);
  const code = template.replace("__HASH__", "neu").replace("__SHELL__", JSON.stringify(shell));
  const handlers = {};
  const self = { addEventListener: (t, fn) => { handlers[t] = fn; }, location: new URL(BASE + "sw.js"), registration: { active: null, scope: BASE } };
  const calls = [];
  const fetch = async (req) => {
    calls.push([new URL(req.url).pathname, req.cache]);
    const body = server(new URL(req.url).pathname, req.cache);
    if (body === null) return new Response("not found", { status: 404 });
    return new Response(body, { headers: { "content-type": "text/plain", "content-encoding": "gzip", "content-length": "1" } });
  };
  const caches = fakeCaches(stores);
  self.skipWaiting = async () => {};
  const Req = class extends Request { constructor(u, o) { super(abs(u), o); } };
  new Function("self", "caches", "fetch", "Request", "BroadcastChannel", "indexedDB", code)(self, caches, fetch, Req, undefined, undefined);
  let done;
  handlers.install({ waitUntil: (p) => { done = p; } });
  await done;
  return { calls, stores, cache: stores.get("studyos-shell-neu") };
}

describe("Service Worker: Vorab-Laden", () => {
  const v1 = { "./": "<html>1", "./app.js": "app 1", "./chunks/a-AAAA.js": "a" };

  it("Erstbesuch: nimmt passende Dateien aus dem HTTP-Cache, jede nur einmal, mit Hash und ohne Kompressionsangabe", async () => {
    const { calls, cache } = await install(v1, (p) => ({ "/": "<html>1", "/app.js": "app 1", "/chunks/a-AAAA.js": "a" })[p]);
    expect(calls.map(([, mode]) => mode)).toEqual(["default", "default", "default"]);
    const res = cache.get(BASE + "app.js");
    expect(res.headers.get("x-studyos-hash")).toBe(hashOf("app 1"));
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBeNull();
    expect(await res.clone().text()).toBe("app 1");
  });

  it("veraltete Datei im HTTP-Cache: lädt sie frisch vom Server", async () => {
    const { calls, cache } = await install(v1, (p, mode) => (p === "/app.js" ? (mode === "reload" ? "app 1" : "app 0") : { "/": "<html>1", "/chunks/a-AAAA.js": "a" }[p]));
    expect(calls.filter(([p]) => p === "/app.js")).toEqual([["/app.js", "default"], ["/app.js", "reload"]]);
    expect(await cache.get(BASE + "app.js").clone().text()).toBe("app 1");
  });

  it("passt der Inhalt auch frisch nicht zur Version (gerade neu veröffentlicht), schlägt die Installation fehl", async () => {
    await expect(install(v1, (p) => ({ "/": "<html>1", "/app.js": "app 2", "/chunks/a-AAAA.js": "a" })[p])).rejects.toThrow(/passt nicht/);
    await expect(install(v1, (p) => (p === "/app.js" ? null : { "/": "<html>1", "/chunks/a-AAAA.js": "a" }[p]))).rejects.toThrow(/Precache failed/);
  });

  it("Update: unveränderte Dateien kommen aus dem alten Cache, nur geänderte übers Netz", async () => {
    const first = await install(v1, (p) => ({ "/": "<html>1", "/app.js": "app 1", "/chunks/a-AAAA.js": "a" })[p]);
    const stores = new Map([["studyos-shell-alt", first.cache]]);
    const v2 = { "./": "<html>1", "./app.js": "app 2", "./chunks/a-AAAA.js": "a" };
    const { calls, cache } = await install(v2, (p) => ({ "/": "<html>1", "/app.js": "app 2", "/chunks/a-AAAA.js": "a" })[p], stores);
    expect(calls).toEqual([["/app.js", "default"]]);
    expect(await cache.get(BASE + "app.js").clone().text()).toBe("app 2");
    expect(await cache.get(BASE + "chunks/a-AAAA.js").clone().text()).toBe("a");
  });

  it("alte Cache-Einträge ohne Hash (Version vor dieser Änderung) werden einmal neu geladen", async () => {
    const old = new Map([[BASE + "chunks/a-AAAA.js", new Response("a")]]);
    const { calls } = await install({ "./chunks/a-AAAA.js": "a" }, () => "a", new Map([["studyos-shell-alt", old]]));
    expect(calls).toEqual([["/chunks/a-AAAA.js", "default"]]);
  });
});
