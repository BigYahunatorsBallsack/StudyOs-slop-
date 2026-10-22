import { describe, it, expect, vi } from "vitest";
import { syncOnce, fingerprint, rowTag } from "../../src/lib/cloudsync.js";
import { deriveSyncKey, newSalt, encryptWithKey, decryptWithKey, KeyMismatchError } from "../../src/lib/crypto.js";
import { emptyData, migrate } from "../../src/lib/data.js";
import { mergeData, stampChanges } from "../../src/lib/sync.js";
import { fetchWithTimeout, CloudError } from "../../src/cloud/supabase.js";

/* Simuliertes Supabase wie in cloudsync.test.js, zusätzlich mit peek und Zählern */
function fakeRemote() {
  const r = { row: null, writes: 0, gets: 0, peeks: 0 };
  r.get = async () => { r.gets++; return r.row ? structuredClone(r.row) : null; };
  r.peek = async () => { r.peeks++; return r.row ? rowTag(r.row.version, r.row.payload) : null; };
  r.insert = async (payload) => { if (r.row) return false; r.row = { version: 1, payload }; r.writes++; return true; };
  r.update = async (payload, version) => { if (!r.row || r.row.version !== version) return false; r.row = { version: version + 1, payload }; r.writes++; return true; };
  return r;
}
function device(initial = emptyData()) {
  const dev = { data: initial, known: null };
  dev.edit = (fn, at) => { dev.data = stampChanges(dev.data, fn(dev.data), at); };
  dev.sync = async (remote, key, extra = {}) => {
    const res = await syncOnce({ remote, key, getLocal: () => dev.data, applyLocal: (m) => { dev.data = m; }, known: dev.known, ...extra });
    dev.known = res.tag ? { tag: res.tag, fingerprint: res.fingerprint } : null;
    return res;
  };
  return dev;
}
const addNote = (id, title) => (d) => ({ ...d, notes: [...d.notes, { id, title, text: "" }] });
const keyFor = async () => deriveSyncKey("geheim-123", newSalt(), 20000);

describe("Cloud-Sync: schneller Vergleich ohne Herunterladen", () => {
  it("lädt nichts herunter, wenn sich weder Cloud noch Gerät geändert haben", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device();
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await a.sync(remote, key);
    const gets = remote.gets;
    const res = await a.sync(remote, key);
    expect(res).toMatchObject({ skipped: true, pulled: false, pushed: false });
    expect(remote.gets).toBe(gets);
    expect(remote.peeks).toBe(1);
  });

  it("gleicht ganz ab, sobald ein anderes Gerät geschrieben hat", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device(), b = device();
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await a.sync(remote, key);
    await b.sync(remote, key);
    b.edit(addNote("n2", "B"), "2026-10-17T10:05:00.000Z");
    await b.sync(remote, key);
    const res = await a.sync(remote, key);
    expect(res.skipped).toBeUndefined();
    expect(a.data.notes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });

  it("gleicht ganz ab, sobald sich hier etwas geändert hat", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device();
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await a.sync(remote, key);
    a.edit(addNote("n2", "B"), "2026-10-17T10:01:00.000Z");
    expect(await a.sync(remote, key)).toMatchObject({ pushed: true });
    expect(remote.row.version).toBe(2);
  });

  it("erkennt eine gelöschte und neu angelegte Cloud trotz gleicher Versionsnummer", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device(), b = device();
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await a.sync(remote, key);
    remote.row = null; /* auf einem anderen Gerät gelöscht … */
    b.edit(addNote("n2", "B"), "2026-10-17T10:05:00.000Z");
    await b.sync(remote, key); /* … und neu angelegt: wieder Version 1, aber neuer IV */
    expect(remote.row.version).toBe(1);
    const res = await a.sync(remote, key);
    expect(res.skipped).toBeUndefined();
    expect(a.data.notes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });

  it("ohne peek (ältere Backends) wie bisher", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device();
    delete remote.peek;
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await a.sync(remote, key);
    expect(await a.sync(remote, key)).toMatchObject({ pulled: false, pushed: false });
    expect(remote.gets).toBe(2);
  });
});

describe("Cloud-Sync: Abbruch und beschädigte Daten", () => {
  it("schreibt nicht mehr, wenn inzwischen abgemeldet oder die Cloud gelöscht wurde", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device();
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    const res = await a.sync(remote, key, { canWrite: () => false });
    expect(res).toMatchObject({ pushed: false, cancelled: true });
    expect(remote.row).toBeNull();
  });

  it("kaputter Inhalt bei richtigem Schlüssel verlangt keine neue Passphrase", async () => {
    const key = await keyFor();
    const env = await encryptWithKey({ ok: 1 }, key);
    /* gültig verschlüsselt, aber kein JSON */
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key.key, new TextEncoder().encode("{kaputt"));
    const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
    const broken = { ...env, iv: b64(iv), data: b64(ct) };
    const err = await decryptWithKey(broken, key).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(KeyMismatchError);
    expect(err.message).toMatch(/beschädigt/);
    /* falscher Schlüssel bleibt ein KeyMismatchError */
    const other = await deriveSyncKey("anders-123", key.salt, 20000);
    await expect(decryptWithKey(env, other)).rejects.toBeInstanceOf(KeyMismatchError);
  });

  it("ein Sync mit beschädigtem Cloud-Inhalt überschreibt die Cloud nicht", async () => {
    const remote = fakeRemote(), key = await keyFor(), a = device();
    remote.row = { version: 3, payload: await encryptWithKey({ kein: "StudyOS" }, key) };
    a.edit(addNote("n1", "A"), "2026-10-17T10:00:00.000Z");
    await expect(a.sync(remote, key)).rejects.toThrow();
    expect(remote.row.version).toBe(3);
    expect(remote.writes).toBe(0);
  });
});

describe("Zusammenführen mit beschädigten gespeicherten Daten", () => {
  it("Papierkorb ohne Liste verhindert das Bearbeiten nicht", () => {
    const d = migrate({ modules: [], meta: { trash: "kaputt" } });
    const next = stampChanges(d, addNote("n1", "A")(d), "2026-10-17T10:00:00.000Z");
    expect(next.notes).toHaveLength(1);
    expect(() => mergeData(next, d)).not.toThrow();
  });

  it("kaputte Teilaufgaben und Links (null, Zahlen) werden übersprungen", () => {
    const d = migrate({ modules: [{ id: "m", name: "M", links: [null, 1, { id: "l1", url: "https://x" }] }], homework: [{ id: "h", title: "H", subtasks: [null, { id: "s1", title: "S" }] }] });
    const edited = stampChanges(d, { ...d, homework: d.homework.map((h) => ({ ...h, title: "neu" })), modules: d.modules.map((m) => ({ ...m, name: "neu" })) }, "2026-10-17T10:00:00.000Z");
    expect(edited.homework[0].title).toBe("neu");
    const remote = stampChanges(d, { ...d, homework: d.homework.map((h) => ({ ...h, subtasks: [{ id: "s2", title: "T" }] })) }, "2026-10-17T11:00:00.000Z");
    const { data } = mergeData(edited, remote);
    expect(data.homework[0].title).toBe("neu");
    expect(data.homework[0].subtasks.map((s) => s.id)).toContain("s2");
    expect(fingerprint(data)).toBe(fingerprint(mergeData(remote, edited).data));
  });
});

describe("Zeitlimit für Supabase-Anfragen", () => {
  it("bricht eine hängende Anfrage mit verständlicher Meldung ab", async () => {
    vi.useFakeTimers();
    try {
      let signal;
      const hang = (_u, init) => new Promise((_, reject) => { signal = init.signal; init.signal.addEventListener("abort", () => reject(new Error("aborted"))); });
      const p = fetchWithTimeout("https://x", {}, 1000, hang);
      const check = expect(p).rejects.toThrow(/Zeitüberschreitung/);
      await vi.advanceTimersByTimeAsync(1001);
      await check;
      expect(signal.aborted).toBe(true);
      await expect(p).rejects.toBeInstanceOf(CloudError);
    } finally { vi.useRealTimers(); }
  });

  it("reicht ein Abbrechen des Aufrufers durch und meldet es nicht als Zeitüberschreitung", async () => {
    const outer = new AbortController();
    const hang = (_u, init) => new Promise((_, reject) => { init.signal.addEventListener("abort", () => reject(new Error("vom Aufrufer abgebrochen"))); });
    const p = fetchWithTimeout("https://x", { signal: outer.signal }, 60000, hang);
    outer.abort();
    await expect(p).rejects.toThrow("vom Aufrufer abgebrochen");
  });

  it("lässt schnelle Antworten durch", async () => {
    const res = await fetchWithTimeout("https://x", { method: "GET" }, 1000, async (_u, init) => ({ ok: true, method: init.method }));
    expect(res).toEqual({ ok: true, method: "GET" });
  });
});
